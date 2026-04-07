from fastapi import APIRouter, HTTPException, Depends
from app.core.deps import SessionDep
from app.models.inventory import InventoryReception
from app.models.finance import PurchaseInvoice, InvoiceStatus
from app.models.foundations import Provider
from app.schemas.inventory_schema import ReceptionCreate, ReceptionRead
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