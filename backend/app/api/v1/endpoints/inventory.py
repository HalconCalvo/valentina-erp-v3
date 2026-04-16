from typing import List, Optional
from datetime import datetime

from fastapi import APIRouter, HTTPException, Query
from sqlmodel import select

from app.core.deps import SessionDep, CurrentUser
from app.models.inventory import InventoryReception, Product, ProductStockMovement
from app.models.finance import PurchaseInvoice, InvoiceStatus
from app.models.foundations import Provider
from app.schemas.inventory_schema import (
    ReceptionCreate,
    ReceptionRead,
    ProductCreate,
    ProductUpdate,
    ProductRead,
    StockMovementCreate,
)
from app.services.inventory_manager import InventoryManager  # <--- EL MOTOR

router = APIRouter()

@router.post("/reception", response_model=ReceptionRead)
def create_inventory_reception(
    *,
    session: SessionDep,
    reception_in: ReceptionCreate
):
    # 1. Validación de Proveedor (Seguimos tu lógica original)
    provider = session.get(Provider, reception_in.provider_id)
    if not provider:
        raise HTTPException(status_code=404, detail="Proveedor no encontrado")

    # 2. Crear Cabecera Física
    db_reception = InventoryReception(
        provider_id=reception_in.provider_id,
        invoice_number=reception_in.invoice_number,
        invoice_date=reception_in.invoice_date,
        total_amount=reception_in.total_amount,
        notes=reception_in.notes,
        status="COMPLETED"
    )
    session.add(db_reception)
    session.flush() # Obtenemos el ID sin cerrar la transacción

    # 3. PROCESAMIENTO MEDIANTE EL MOTOR (SGP V3.5)
    for item in reception_in.items:
        # El motor se encarga de:
        # - Buscar el material
        # - Aplicar factor de conversión
        # - Calcular nuevo costo unitario
        # - Sumar stock físico
        # - Crear la transacción en el Kárdex
        
        success = InventoryManager.update_stock_and_cost(
            session=session,
            material_id=item.material_id,
            quantity_usage_units=item.quantity, # El motor aplicará el factor internamente
            total_line_cost=item.line_total_cost,
            transaction_type="PURCHASE_ENTRY",
            reception_id=db_reception.id
        )
        
        if not success:
            session.rollback()
            raise HTTPException(status_code=404, detail=f"Material ID {item.material_id} no encontrado")

    # 4. TRIGGER FINANCIERO (Tu lógica de Cuentas por Pagar)
    due_date = reception_in.due_date or reception_in.invoice_date
    new_invoice = PurchaseInvoice(
        provider_id=reception_in.provider_id,
        invoice_number=reception_in.invoice_number,
        issue_date=reception_in.invoice_date,
        due_date=due_date,
        total_amount=reception_in.total_amount,
        outstanding_balance=reception_in.total_amount,
        status=InvoiceStatus.PENDING
    )
    session.add(new_invoice)

    # 5. COMMIT ÚNICO (Atomicidad Total)
    # Si algo falló en los pasos anteriores, nada se guarda.
    session.commit()
    session.refresh(db_reception)
    return db_reception


# ==================================================================
# CATÁLOGO DE PRODUCTOS TERMINADOS
# Referencia de configuración DB: @backend/app/core/database.py
# Motor: SQLModel + engine definido en database.py (SQLite local /
#        Cloud SQL en producción vía DATABASE_URL).
# ==================================================================

@router.post("/products", response_model=ProductRead, status_code=201)
def create_product(
    *,
    session: SessionDep,
    product_in: ProductCreate,
):
    """
    Da de alta un producto nuevo en el catálogo.
    El SKU debe ser único; si ya existe se retorna 409.
    """
    existing = session.exec(
        select(Product).where(Product.sku == product_in.sku)
    ).first()
    if existing:
        raise HTTPException(
            status_code=409,
            detail=f"Ya existe un producto con el SKU '{product_in.sku}'.",
        )

    db_product = Product(**product_in.model_dump())
    session.add(db_product)
    session.commit()
    session.refresh(db_product)
    return db_product


@router.get("/products", response_model=List[ProductRead])
def list_products(
    *,
    session: SessionDep,
    only_active: bool = Query(default=True),
    category: Optional[str] = Query(default=None),
    skip: int = Query(default=0, ge=0),
    limit: int = Query(default=50, le=200),
):
    """Devuelve el catálogo de productos, con filtros opcionales."""
    query = select(Product)
    if only_active:
        query = query.where(Product.is_active == True)
    if category:
        query = query.where(Product.category == category)
    query = query.offset(skip).limit(limit)
    return session.exec(query).all()


@router.get("/products/{product_id}", response_model=ProductRead)
def get_product(*, session: SessionDep, product_id: int):
    """Obtiene el detalle de un producto por su ID."""
    product = session.get(Product, product_id)
    if not product:
        raise HTTPException(status_code=404, detail="Producto no encontrado.")
    return product


@router.patch("/products/{product_id}", response_model=ProductRead)
def update_product(
    *,
    session: SessionDep,
    product_id: int,
    product_in: ProductUpdate,
):
    """Actualiza campos editables de un producto."""
    product = session.get(Product, product_id)
    if not product:
        raise HTTPException(status_code=404, detail="Producto no encontrado.")

    update_data = product_in.model_dump(exclude_unset=True)
    for field, value in update_data.items():
        setattr(product, field, value)
    product.updated_at = datetime.utcnow()

    session.add(product)
    session.commit()
    session.refresh(product)
    return product


@router.post("/products/{product_id}/stock", response_model=ProductRead)
def register_stock_movement(
    *,
    session: SessionDep,
    current_user: CurrentUser,
    product_id: int,
    movement_in: StockMovementCreate,
):
    """
    Registra una entrada, salida o ajuste de stock para un producto.
    Actualiza `stock_quantity` en tiempo real y deja traza en el kárdex.
    """
    product = session.get(Product, product_id)
    if not product:
        raise HTTPException(status_code=404, detail="Producto no encontrado.")

    ENTRY_TYPES = {"ENTRADA", "AJUSTE_POSITIVO"}
    EXIT_TYPES = {"SALIDA", "AJUSTE_NEGATIVO"}

    if movement_in.movement_type not in ENTRY_TYPES | EXIT_TYPES:
        raise HTTPException(
            status_code=422,
            detail="movement_type debe ser: ENTRADA, SALIDA, AJUSTE_POSITIVO o AJUSTE_NEGATIVO.",
        )

    if movement_in.quantity <= 0:
        raise HTTPException(status_code=422, detail="La cantidad debe ser mayor a 0.")

    # Ajustar stock
    if movement_in.movement_type in ENTRY_TYPES:
        product.stock_quantity += movement_in.quantity
    else:
        if product.stock_quantity < movement_in.quantity:
            raise HTTPException(
                status_code=422,
                detail=(
                    f"Stock insuficiente. Disponible: {product.stock_quantity} "
                    f"| Solicitado: {movement_in.quantity}"
                ),
            )
        product.stock_quantity -= movement_in.quantity

    product.updated_at = datetime.utcnow()

    # Kárdex
    movement = ProductStockMovement(
        product_id=product_id,
        movement_type=movement_in.movement_type,
        quantity=movement_in.quantity,
        unit_cost=movement_in.unit_cost,
        reference=movement_in.reference,
        notes=movement_in.notes,
        registered_by_user_id=current_user.id,
    )

    session.add(product)
    session.add(movement)
    session.commit()
    session.refresh(product)
    return product