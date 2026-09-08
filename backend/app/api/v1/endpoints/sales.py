from typing import Optional, List, Any, Dict
from datetime import datetime
import math
from fastapi import APIRouter, Depends, HTTPException, status, Body, Query
from sqlmodel import Session, select, delete
from sqlalchemy import func
from sqlalchemy.orm import selectinload
from fastapi.responses import StreamingResponse

from app.core.database import get_session
from app.core.deps import get_current_active_user, CurrentUser

# Importamos los modelos
from app.models.sales import (
    SalesOrder, SalesOrderItem, SalesOrderItemInstance, 
    SalesOrderStatus, InstanceStatus, CustomerPayment, PaymentType, PaymentMethod, CXCStatus,
    SalesCommission, CommissionType, CustomerPaymentInstallment
)
from app.models.design import ProductVersion
from app.models.material import Material
from app.models.foundations import TaxRate, GlobalConfig, Client
from app.models.users import User, UserRole
from app.models.treasury import BankAccount, BankTransaction, TransactionType
from app.services.pdf_generator import PDFGenerator

# --- IMPORTAMOS LOS MOTORES (V3.5) ---
from app.services.cost_engine import CostEngine
from app.services import sales_service
from app.repositories import sales_repository as sales_repo

from app.schemas.sales_schema import (
    SalesOrderCreate, SalesOrderRead, SalesOrderUpdate,
    SalesOrderItemCreate,
    AddItemsPayload,
    CustomerPaymentRead,
    CustomerPaymentUpdate,
    CustomerPaymentCancel,
    InstallmentUpdate,
    InstallmentCancel,
    SalesOrderItemInstanceUpdate,
    SalesOrderItemInstanceRead,
    PaymentPayload,
    ClientPurchaseOrderPayload,
    ResaleItemPatch,
    ProductionItemPatch,
    RegisterProgressPayload,
    InvoicingRightAdvanceRow,
    InvoicingRightProgressRow,
    InvoicingRightsRead,
    PaymentCommissionUpdate,
    SalesCommissionRead,
    PayrollCommissionRow,
    CommissionsPayrollOverview,
    CommissionPayrollUpdate,
    CommissionPaidUpdate,
    InstanceStatusSummary,
    HouseStatusSummary,
    OrderHousesStatus,
    RetentionUpdate,
    RetentionInvoicePayload,
    RetentionWaivePayload,
    RetentionDefaultsUpdate,
    RetentionAlertRead,
)

router = APIRouter()


def _normalized_role(user: User) -> str:
    role = user.role
    if role is None:
        return ""
    if hasattr(role, 'value'):
        return str(role.value).strip().upper()
    return str(role).strip().upper()


def _is_seller_scoped_role(user: User) -> bool:
    """
    Alcance tipo «solo mis ventas»: SALES y VENTAS (alias en algunos clientes).
    ADMIN, GERENCIA, DIRECTOR y demás roles de staff **no** entran aquí: ven el universo
    completo de órdenes en GET /sales/orders (monitor tipo administración), sin filtro por user_id.
    """
    return _normalized_role(user) in ("SALES",)


def _line_amount_per_instance(item: SalesOrderItem) -> float:
    """Valor contable por instancia (partida / cantidad)."""
    qty = float(item.quantity) if item.quantity else 1.0
    if qty < 1e-9:
        qty = 1.0
    sub = float(item.subtotal_price or 0.0)
    if sub <= 0:
        sub = float(item.unit_price or 0.0) * qty
    return sub / qty


def _can_edit_client_po_meta(user: User) -> bool:
    """Administración / Gerencia / Dirección: backfill OC en órdenes existentes."""
    r = _normalized_role(user)
    return r in (
        "ADMIN",
        "MANAGER",
        "DIRECTOR",
        "SALES",
        "DESIGN",
    )


def normalize_commission(rate: float | None) -> float:
    if rate is None: return 0.0
    if rate > 1.0: return rate / 100.0
    return rate


def _create_instances_for_order(session: Session, order: SalesOrder) -> int:
    """
    Crea las instancias (Productos Vendidos) de una orden al generar la OV.
    Una instancia por cada unidad de cada item. Idempotente: si el item ya tiene
    instancias, no las duplica.
    Devuelve el número de instancias creadas.
    """
    created = 0
    for item in order.items:
        if getattr(item, 'is_resale', False):
            continue
        # Idempotencia: si este item ya tiene instancias, saltarlo
        existing = session.exec(
            select(SalesOrderItemInstance).where(
                SalesOrderItemInstance.sales_order_item_id == item.id
            )
        ).first()
        if existing:
            continue
        qty_int = int(item.quantity) if item.quantity and item.quantity > 0 else 1
        for i in range(1, qty_int + 1):
            session.add(SalesOrderItemInstance(
                sales_order_item_id=item.id,
                custom_name=f"{item.product_name} - Instancia {i}",
                production_status=InstanceStatus.PENDING
            ))
            created += 1
    return created


def _recalculate_order_totals(session: Session, order: SalesOrder) -> None:
    """
    Recalcula subtotal, comision, IVA y total de una orden desde sus items
    actuales. Ajusta outstanding_balance por el DELTA del total (preserva el
    saldo vivo que se decrementa con pagos). Misma formula que add_items.
    """
    session.refresh(order)
    items_sum = sum(float(it.subtotal_price or 0.0) for it in order.items)

    tax_rate_obj = session.get(TaxRate, order.tax_rate_id)
    tax_multiplier = tax_rate_obj.rate if tax_rate_obj else 0.16

    comm_percent = order.applied_commission_percent or 0.0
    nueva_comision = (
        items_sum - (items_sum / (1 + comm_percent))
        if comm_percent > 0 else 0.0
    )
    nuevo_tax = items_sum * tax_multiplier
    nuevo_total = items_sum + nuevo_tax

    total_anterior = order.total_price or 0.0
    delta_total = nuevo_total - total_anterior

    order.subtotal = items_sum
    order.commission_amount = nueva_comision
    order.tax_amount = nuevo_tax
    order.total_price = nuevo_total
    order.outstanding_balance = (order.outstanding_balance or 0.0) + delta_total
    session.add(order)


# ==========================================
# 1. CREAR ORDEN
# ==========================================
@router.post("/orders", response_model=SalesOrderRead)
def create_sales_order(
    order_in: SalesOrderCreate,
    session: Session = Depends(get_session),
    current_user: User = Depends(get_current_active_user),
):
    return sales_service.create_order(session, order_in, current_user)

# ==========================================
# 2. LISTAR ORDENES
# ==========================================
@router.get("/orders", response_model=List[SalesOrderRead])
def read_sales_orders(
    status: SalesOrderStatus | None = None,
    client_id: int | None = None,
    session: Session = Depends(get_session),
    current_user: User = Depends(get_current_active_user),
):
    return sales_service.list_orders(session, current_user, status=status, client_id=client_id)


# ==========================================
# 3. DETALLE ORDEN
# ==========================================
@router.get("/orders/{order_id}", response_model=SalesOrderRead)
def read_order_detail(
    order_id: int,
    session: Session = Depends(get_session),
    current_user: User = Depends(get_current_active_user),
):
    return sales_service.get_order(session, order_id, current_user)


# ==========================================
# 3b. CXC — LECTURA V4.4 (Vendedor read-only, filtrado por user_id de la OV)
# ==========================================
@router.get("/customer-payments/pending", response_model=List[CustomerPaymentRead])
def get_my_pending_customer_payments(
    session: Session = Depends(get_session),
    current_user: User = Depends(get_current_active_user),
):
    return sales_service.list_customer_payments(session, current_user, status=CXCStatus.PENDING)


@router.get("/customer-payments", response_model=List[CustomerPaymentRead])
def list_customer_payments(
    status: Optional[str] = Query(
        default=None,
        description="PENDING | PAID | CANCELLED. Si se omite: vendedor = todos sus CXC; staff = solo PENDING.",
    ),
    session: Session = Depends(get_session),
    current_user: User = Depends(get_current_active_user),
):
    return sales_service.list_customer_payments(session, current_user, status=status)


@router.get("/payments", response_model=List[CustomerPaymentRead])
def list_sales_payments(
    status: Optional[str] = Query(default=None, description="Filtrar por CXCStatus, ej. PENDING"),
    session: Session = Depends(get_session),
    current_user: User = Depends(get_current_active_user),
):
    return sales_service.list_customer_payments(session, current_user, status=status)


# ==========================================
# 4. ACTUALIZAR ORDEN
# ==========================================
@router.patch("/orders/{order_id}", response_model=SalesOrderRead)
def update_sales_order(
    order_id: int,
    order_update: SalesOrderUpdate,
    session: Session = Depends(get_session),
    current_user: User = Depends(get_current_active_user),
):
    return sales_service.update_order(session, order_id, order_update, current_user)


@router.post("/orders/{order_id}/add-items", response_model=SalesOrderRead)
def add_items_to_order(
    order_id: int,
    payload: AddItemsPayload,
    session: Session = Depends(get_session),
    current_user: User = Depends(get_current_active_user),
):
    return sales_service.add_items_to_order(session, order_id, payload, current_user)


@router.delete("/orders/{order_id}/items/{item_id}/instances/{instance_id}")
def delete_order_instance(
    order_id: int, item_id: int, instance_id: int,
    session: Session = Depends(get_session),
):
    """
    Elimina UNA instancia de una partida de produccion.
    Candado: solo si PENDING y sin facturar (customer_payment_id null).
    Recalcula totales de la orden.
    """
    order = session.get(SalesOrder, order_id)
    if not order:
        raise HTTPException(404, "Orden no encontrada")
    item = session.get(SalesOrderItem, item_id)
    if not item or item.sales_order_id != order_id:
        raise HTTPException(404, "Partida no encontrada en esta orden")
    inst = session.get(SalesOrderItemInstance, instance_id)
    if not inst or inst.sales_order_item_id != item_id:
        raise HTTPException(404, "Instancia no encontrada en esta partida")

    # CANDADO por-instancia
    if inst.production_status != InstanceStatus.PENDING:
        raise HTTPException(400, "La instancia ya entro a produccion, no se puede eliminar")
    if inst.customer_payment_id is not None:
        raise HTTPException(400, "La instancia ya fue facturada, no se puede eliminar")

    try:
        # bajar la cantidad de la partida en 1 (la linea suma quantity*price)
        nueva_qty = int(item.quantity or 1) - 1
        session.delete(inst)
        session.flush()
        if nueva_qty <= 0:
            # era la ultima unidad: se elimina la partida completa
            session.delete(item)
        else:
            item.quantity = nueva_qty
            item.subtotal_price = float(nueva_qty) * float(item.unit_price or 0.0)
            session.add(item)
        session.flush()
        _recalculate_order_totals(session, order)
        session.commit()
        session.refresh(order)
        return {"ok": True, "deleted_instance": instance_id}
    except HTTPException:
        raise
    except Exception as e:
        session.rollback()
        raise HTTPException(500, f"Error al eliminar instancia: {e}")


@router.patch("/instances/{instance_id}", response_model=SalesOrderItemInstanceRead)
def update_sales_order_instance(
    instance_id: int,
    data: SalesOrderItemInstanceUpdate,
    session: Session = Depends(get_session),
    current_user: User = Depends(get_current_active_user),
):
    allowed = {UserRole.DIRECTOR, UserRole.MANAGER, UserRole.ADMIN, UserRole.SALES, UserRole.DESIGN}
    if current_user.role not in allowed:
        raise HTTPException(status_code=403, detail="Sin permisos.")

    instance = session.get(SalesOrderItemInstance, instance_id)
    if not instance:
        raise HTTPException(status_code=404, detail="Instancia no encontrada")

    for field, value in data.model_dump(exclude_unset=True).items():
        setattr(instance, field, value)

    if data.administration_invoice_folio is not None:
        sales_service.check_and_release_commissions(session, instance.id)

    session.add(instance)
    session.commit()
    session.refresh(instance)
    return instance


@router.delete("/orders/{order_id}/items/{item_id}/resale")
def delete_resale_item(
    order_id: int, item_id: int,
    session: Session = Depends(get_session),
):
    """
    Elimina una partida de reventa completa.
    Candado: la orden no debe estar cerrada/instalada.
    (El equivalente 'facturada' para reventa se afinará luego.)
    """
    order = session.get(SalesOrder, order_id)
    if not order:
        raise HTTPException(404, "Orden no encontrada")
    item = session.get(SalesOrderItem, item_id)
    if not item or item.sales_order_id != order_id:
        raise HTTPException(404, "Partida no encontrada en esta orden")
    if not item.is_resale:
        raise HTTPException(400, "Esta partida no es de reventa; usa el borrado por instancia")

    # Candado de estado de orden (FINISHED/COMPLETED = cerrada; no existe CLOSED en SalesOrderStatus)
    estados_bloqueados = {
        SalesOrderStatus.FINISHED,
        SalesOrderStatus.COMPLETED,
        SalesOrderStatus.CANCELLED,
        SalesOrderStatus.CANCELLED_OV,
    }
    if order.status in estados_bloqueados:
        raise HTTPException(400, "La orden ya esta cerrada, no se puede modificar")

    try:
        session.delete(item)
        session.flush()
        _recalculate_order_totals(session, order)
        session.commit()
        session.refresh(order)
        return {"ok": True, "deleted_item": item_id}
    except HTTPException:
        raise
    except Exception as e:
        session.rollback()
        raise HTTPException(500, f"Error al eliminar partida de reventa: {e}")


@router.patch("/orders/{order_id}/items/{item_id}/resale")
def patch_resale_item(
    order_id: int, item_id: int, payload: ResaleItemPatch,
    session: Session = Depends(get_session),
):
    """
    Edita una partida de reventa. Candado: is_resale y orden no terminal.
    Si cambia resale_sku, actualiza frozen_unit_cost desde el material.
    Recalcula subtotal_price del item y totales de la orden.
    """
    order = session.get(SalesOrder, order_id)
    if not order:
        raise HTTPException(404, "Orden no encontrada")
    item = session.get(SalesOrderItem, item_id)
    if not item or item.sales_order_id != order_id:
        raise HTTPException(404, "Partida no encontrada en esta orden")
    if not item.is_resale:
        raise HTTPException(400, "Esta partida no es de reventa")

    estados_terminales = {
        SalesOrderStatus.FINISHED, SalesOrderStatus.COMPLETED,
        SalesOrderStatus.CANCELLED, SalesOrderStatus.CANCELLED_OV,
    }
    if order.status in estados_terminales:
        raise HTTPException(400, "La orden ya esta cerrada, no se puede modificar")

    try:
        if payload.resale_sku is not None and payload.resale_sku != item.resale_sku:
            mat = session.exec(
                select(Material).where(Material.sku == payload.resale_sku)
            ).first()
            if not mat:
                raise HTTPException(404, f"Material {payload.resale_sku} no encontrado")
            item.resale_sku = mat.sku
            item.frozen_unit_cost = float(mat.current_cost or 0.0)
            if payload.product_name is None:
                item.product_name = mat.name

        if payload.product_name is not None:
            item.product_name = payload.product_name
        if payload.quantity is not None:
            if payload.quantity <= 0:
                raise HTTPException(400, "La cantidad debe ser mayor a 0")
            item.quantity = payload.quantity
        if payload.unit_price is not None:
            if payload.unit_price < 0:
                raise HTTPException(400, "El precio no puede ser negativo")
            item.unit_price = payload.unit_price

        item.subtotal_price = float(item.quantity or 1) * float(item.unit_price or 0.0)
        session.add(item)
        session.flush()
        _recalculate_order_totals(session, order)
        session.commit()
        session.refresh(order)
        return {"ok": True, "item_id": item_id}
    except HTTPException:
        raise
    except Exception as e:
        session.rollback()
        raise HTTPException(500, f"Error al editar partida de reventa: {e}")


@router.patch("/orders/{order_id}/items/{item_id}/production")
def patch_production_item_price(
    order_id: int, item_id: int, payload: ProductionItemPatch,
    session: Session = Depends(get_session),
):
    """
    Edita el precio de una partida de produccion.
    Candado Opcion A: solo si TODAS sus instancias estan PENDING y sin facturar.
    """
    order = session.get(SalesOrder, order_id)
    if not order:
        raise HTTPException(404, "Orden no encontrada")
    item = session.get(SalesOrderItem, item_id)
    if not item or item.sales_order_id != order_id:
        raise HTTPException(404, "Partida no encontrada en esta orden")
    if item.is_resale:
        raise HTTPException(400, "Esta partida es de reventa; usa el endpoint /resale")

    estados_terminales = {
        SalesOrderStatus.FINISHED, SalesOrderStatus.COMPLETED,
        SalesOrderStatus.CANCELLED, SalesOrderStatus.CANCELLED_OV,
    }
    if order.status in estados_terminales:
        raise HTTPException(400, "La orden ya esta cerrada, no se puede modificar")

    if payload.unit_price < 0:
        raise HTTPException(400, "El precio no puede ser negativo")

    instances = session.exec(
        select(SalesOrderItemInstance).where(
            SalesOrderItemInstance.sales_order_item_id == item.id
        )
    ).all()
    for inst in instances:
        if inst.production_status != InstanceStatus.PENDING or inst.customer_payment_id is not None:
            raise HTTPException(
                400,
                "No se puede cambiar el precio: la partida tiene unidades en produccion o facturadas."
            )

    try:
        item.unit_price = payload.unit_price
        item.subtotal_price = float(item.quantity or 1) * float(payload.unit_price)
        session.add(item)
        session.flush()
        _recalculate_order_totals(session, order)
        session.commit()
        session.refresh(order)
        return {"ok": True, "item_id": item_id, "unit_price": payload.unit_price}
    except HTTPException:
        raise
    except Exception as e:
        session.rollback()
        raise HTTPException(500, f"Error al editar precio: {e}")


@router.post("/orders/{order_id}/items/{item_id}/add-instance")
def add_instance_to_item(
    order_id: int, item_id: int,
    session: Session = Depends(get_session),
):
    """
    Agrega UNA instancia a una partida de produccion (sube la cantidad en 1).
    La instancia nace PENDING con nombre generico; luego se bautiza.
    """
    order = session.get(SalesOrder, order_id)
    if not order:
        raise HTTPException(404, "Orden no encontrada")
    item = session.get(SalesOrderItem, item_id)
    if not item or item.sales_order_id != order_id:
        raise HTTPException(404, "Partida no encontrada en esta orden")
    if item.is_resale:
        raise HTTPException(400, "Las partidas de reventa no tienen instancias")

    estados_terminales = {
        SalesOrderStatus.FINISHED, SalesOrderStatus.COMPLETED,
        SalesOrderStatus.CANCELLED, SalesOrderStatus.CANCELLED_OV,
    }
    if order.status in estados_terminales:
        raise HTTPException(400, "La orden ya esta cerrada, no se puede modificar")

    try:
        existing = session.exec(
            select(SalesOrderItemInstance).where(
                SalesOrderItemInstance.sales_order_item_id == item.id
            )
        ).all()
        # Numerar por el mayor sufijo numerico existente + 1 (no por conteo,
        # que duplica cuando hay huecos por instancias borradas).
        import re
        max_n = 0
        for inst in existing:
            m = re.search(r'Instancia\s+(\d+)\s*$', inst.custom_name or '')
            if m:
                n = int(m.group(1))
                if n > max_n:
                    max_n = n
        siguiente_n = max_n + 1

        session.add(SalesOrderItemInstance(
            sales_order_item_id=item.id,
            custom_name=f"{item.product_name} - Instancia {siguiente_n}",
            production_status=InstanceStatus.PENDING,
        ))
        item.quantity = int(item.quantity or 0) + 1
        item.subtotal_price = float(item.quantity) * float(item.unit_price or 0.0)
        session.add(item)
        session.flush()
        _recalculate_order_totals(session, order)
        session.commit()
        session.refresh(order)
        return {"ok": True, "item_id": item_id, "nueva_cantidad": item.quantity}
    except HTTPException:
        raise
    except Exception as e:
        session.rollback()
        raise HTTPException(500, f"Error al agregar instancia: {e}")


# ==========================================
# 5. WORKFLOW: AUTORIZACIÓN Y SEMÁFORO
# ==========================================
@router.post("/orders/{order_id}/request-auth", response_model=SalesOrderRead)
def request_order_authorization(order_id: int, session: Session = Depends(get_session)):
    return sales_service.request_authorization(session, order_id)


@router.post("/orders/{order_id}/authorize", response_model=SalesOrderRead)
def authorize_order(order_id: int, session: Session = Depends(get_session)):
    return sales_service.authorize_order(session, order_id)


@router.post("/orders/{order_id}/mark_waiting_advance", response_model=SalesOrderRead)
def mark_as_waiting_advance(
    order_id: int,
    payload: ClientPurchaseOrderPayload,
    session: Session = Depends(get_session),
    current_user: User = Depends(get_current_active_user),
):
    return sales_service.mark_waiting_advance(session, order_id, current_user, payload)


@router.post("/orders/{order_id}/cancel_ov", response_model=SalesOrderRead)
def cancel_ov(
    order_id: int,
    session: Session = Depends(get_session),
    current_user: User = Depends(get_current_active_user),
):
    return sales_service.cancel_ov(session, order_id)

# ==========================================
# 6. PAGOS Y COMISIONES (CÓDIGO HÍBRIDO)
# ==========================================
@router.post("/orders/{order_id}/mark_sold", response_model=SalesOrderRead)
def register_advance(
    order_id: int,
    payload: PaymentPayload,
    session: Session = Depends(get_session),
    current_user: User = Depends(get_current_active_user),
):
    return sales_service.mark_sold(session, order_id, payload.amount)


@router.post("/orders/{order_id}/confirm_payment/{cxc_id}", response_model=SalesOrderRead)
def confirm_cxc_payment(order_id: int, cxc_id: int, session: Session = Depends(get_session)):
    return sales_service.confirm_payment(session, order_id, cxc_id)


def _liberar_comision_anticipo(session, order, payment, base_con_iva):
    sales_service.liberar_comision_anticipo(session, order, payment, base_con_iva)

@router.post("/orders/{order_id}/advance_payments", response_model=SalesOrderRead)
def register_advance_payment(order_id: int, payload: PaymentPayload,
                             session: Session = Depends(get_session),
                             current_user: User = Depends(get_current_active_user)):
    order = session.get(SalesOrder, order_id)
    if not order:
        raise HTTPException(404, "Orden no encontrada")

    objetivo = float(order.advance_invoice_amount or 0.0)
    if objetivo <= 0:
        raise HTTPException(400, "Esta OV no tiene importe de anticipo definido. Captúralo primero en Rayos X.")

    # Suma de abonos de anticipo YA cobrados (PAID) para esta OV
    pagados_antes = session.exec(
        select(func.coalesce(func.sum(CustomerPayment.amount), 0.0)).where(
            CustomerPayment.sales_order_id == order.id,
            CustomerPayment.payment_type == PaymentType.ADVANCE,
            CustomerPayment.status == CXCStatus.PAID
        )
    ).one()
    pagados_antes = float(pagados_antes or 0.0)

    monto = float(payload.amount or 0.0)
    if monto <= 0:
        raise HTTPException(400, "El monto del abono debe ser mayor a cero.")

    faltante = max(objetivo - pagados_antes, 0.0)
    aplica_anticipo = min(monto, faltante)   # lo que abona al anticipo
    excedente = max(monto - faltante, 0.0)   # sobrepago → al saldo de la OV

    # Registrar el abono como PAID (ya recibido)
    nuevo = CustomerPayment(
        sales_order_id=order.id,
        payment_type=PaymentType.ADVANCE,
        invoice_folio=payload.invoice_folio or order.client_po_folio,
        amount=monto,
        status=CXCStatus.PAID,
        payment_date=payload.payment_date or datetime.utcnow(),
        notes=payload.notes,
        reference=payload.reference,
        created_by_user_id=current_user.id,
        commission_paid=False,
    )
    session.add(nuevo)

    # Aplicar el abono al saldo de la OV (todo el monto reduce la deuda total)
    order.outstanding_balance = float(order.outstanding_balance or 0.0) - monto

    pagados_despues = pagados_antes + aplica_anticipo
    anticipo_completo = pagados_despues >= objetivo - 0.01

    # LIBERAR COMISIÓN SOLO AL COMPLETAR EL ANTICIPO, una sola vez.
    # Verificar que no se haya liberado ya (ningún ADVANCE de esta OV con commission_paid=True).
    ya_liberada = session.exec(
        select(func.count(CustomerPayment.id)).where(
            CustomerPayment.sales_order_id == order.id,
            CustomerPayment.payment_type == PaymentType.ADVANCE,
            CustomerPayment.commission_paid == True
        )
    ).one()

    if anticipo_completo and int(ya_liberada or 0) == 0:
        session.flush()  # asegurar id del nuevo pago
        _liberar_comision_anticipo(session, order, nuevo, objetivo)
        nuevo.commission_paid = True

    # Opción 1: al completar el anticipo la OV pasa a SOLD (los abonos parciales la dejan en
    # WAITING_ADVANCE). Se coloca ANTES del check de FINISHED para que, si además se salda todo
    # el proyecto, FINISHED prevalezca.
    if anticipo_completo:
        order.status = SalesOrderStatus.SOLD

    if order.outstanding_balance <= 0.1:
        order.status = SalesOrderStatus.FINISHED

    session.add(order)
    session.commit()
    session.refresh(order)
    return order

@router.get("/orders/{order_id}/pdf")
def download_quote_pdf(order_id: int, session: Session = Depends(get_session)):
    """
    DESCARGA DE PDF DE COTIZACIÓN
    """
    order = session.get(SalesOrder, order_id)
    if not order: 
        raise HTTPException(status_code=404, detail="Cotización no encontrada")

    client = session.get(Client, order.client_id) if order.client_id else None
    config = session.exec(select(GlobalConfig)).first()
    seller = session.get(User, order.user_id) if order.user_id else None
    
    seller_name = seller.full_name if seller else "Departamento de Ventas"
    seller_email = seller.email if seller else ""
    seller_phone = seller.phone if seller and seller.phone else ""

    pdf_gen = PDFGenerator()
    pdf_buffer = pdf_gen.generate_quote_pdf(
        order=order, 
        client=client, 
        config=config, 
        seller_name=seller_name, 
        seller_email=seller_email,
        seller_phone=seller_phone
    )

    filename = f"Cotizacion_{order.id}.pdf"
    return StreamingResponse(
        pdf_buffer, 
        media_type="application/pdf", 
        headers={"Content-Disposition": f'inline; filename="{filename}"'}
    )

# ==========================================
# RECHAZAR COTIZACIÓN (REGRESAR A DRAFT)
# ==========================================
@router.post("/orders/{order_id}/request_changes", response_model=SalesOrderRead)
def request_order_changes(order_id: int, session: Session = Depends(get_session)):
    return sales_service.request_changes(session, order_id)


# ==========================================
# MARCAR COMO PERDIDA (CLIENTE NO ACEPTÓ)
# ==========================================
@router.post("/orders/{order_id}/mark_lost", response_model=SalesOrderRead)
def mark_order_lost(order_id: int, session: Session = Depends(get_session)):
    return sales_service.mark_lost(session, order_id)


# ==========================================
# RECHAZAR COTIZACIÓN (DIRECCIÓN → VENDEDOR)
# ==========================================
@router.post("/orders/{order_id}/reject", response_model=SalesOrderRead)
def reject_order(order_id: int, session: Session = Depends(get_session)):
    return sales_service.reject_order(session, order_id)


# ==========================================
# REGISTRAR AVANCE DE OBRA (🟢🟢 → FACTURA DE AVANCE)
# ==========================================

def _pending_progress_instances_base_stmt():
    return (
        select(SalesOrderItemInstance)
        .where(
            SalesOrderItemInstance.production_status == InstanceStatus.CLOSED,
            SalesOrderItemInstance.is_cancelled == False,  # noqa: E712
            SalesOrderItemInstance.customer_payment_id == None,  # noqa: E711
            SalesOrderItemInstance.administration_invoice_folio == None,  # noqa: E711
        )
        .options(
            selectinload(SalesOrderItemInstance.item)
            .selectinload(SalesOrderItem.order)
            .selectinload(SalesOrder.client)
        )
    )


def _instance_to_progress_dict(inst: SalesOrderItemInstance) -> Dict[str, Any]:
    item = inst.item
    order = item.order if item else None
    client = order.client if order else None
    line_amount = _line_amount_per_instance(item) if item else 0.0
    return {
        "instance_id": inst.id,
        "custom_name": inst.custom_name or f"Instancia #{inst.id}",
        "production_status": inst.production_status.value,
        "line_amount": line_amount,
        "signed_received_at": inst.signed_received_at.isoformat() if inst.signed_received_at else None,
        "order_id": order.id if order else None,
        "order_folio": f"OV-{str(order.id).zfill(4)}" if order else "—",
        "project_name": order.project_name if order else None,
        "client_name": client.full_name if client else "Sin Cliente",
        "item_product_name": item.product_name if item else None,
    }


@router.get("/invoicing-rights", response_model=InvoicingRightsRead)
def get_invoicing_rights(
    session: Session = Depends(get_session),
    _current_user: User = Depends(get_current_active_user),
):
    """
    Monto Tarjeta B (Pendiente de Facturar): suma de
    - Anticipos: órdenes WAITING_ADVANCE sin registro ADVANCE en customer_payments.
    - Avances de obra: instancias CLOSED sin administration_invoice_folio ni customer_payment_id.
    """
    advance_payments = session.exec(
        select(CustomerPayment).where(CustomerPayment.payment_type == PaymentType.ADVANCE)
    ).all()
    advance_order_ids = {p.sales_order_id for p in advance_payments if p.sales_order_id is not None}

    waiting_orders = session.exec(
        select(SalesOrder)
        .where(SalesOrder.status == SalesOrderStatus.WAITING_ADVANCE)
        .options(selectinload(SalesOrder.client))
    ).all()

    advances_out: List[InvoicingRightAdvanceRow] = []
    advance_total = 0.0
    for o in waiting_orders:
        if o.id is not None and o.id in advance_order_ids:
            continue
        pct = float(o.advance_percent or 60.0) / 100.0
        total_p = float(o.total_price or 0.0)
        amt = total_p * pct
        client = o.client
        client_name = client.full_name if client else "Sin Cliente"
        advances_out.append(
            InvoicingRightAdvanceRow(
                order_id=o.id,
                project_name=o.project_name,
                client_name=client_name,
                advance_percent=float(o.advance_percent or 60.0),
                total_price=total_p,
                advance_amount=amt,
            )
        )
        advance_total += amt

    instances = session.exec(_pending_progress_instances_base_stmt()).all()
    progress_rows: List[InvoicingRightProgressRow] = []
    progress_total = 0.0
    for inst in instances:
        payload = _instance_to_progress_dict(inst)
        progress_rows.append(InvoicingRightProgressRow(**payload))
        progress_total += float(payload["line_amount"])

    return InvoicingRightsRead(
        advance_pending_total=advance_total,
        progress_work_total=progress_total,
        total_pending_invoice=advance_total + progress_total,
        advances=advances_out,
        progress_instances=progress_rows,
    )


@router.post("/orders/{order_id}/register_progress")
def register_progress_invoice(
    order_id: int,
    payload: RegisterProgressPayload,
    session: Session = Depends(get_session),
    current_user: User = Depends(get_current_active_user),
):
    """
    Registra una Factura de Avance para las instancias en estado 🟢🟢 CLOSED.

    - Si payload.instance_ids está vacío, toma TODAS las instancias CLOSED sin cobro.
    - Crea un CustomerPayment de tipo PROGRESS.
    - Vincula las instancias a ese cobro (instance.customer_payment_id).
    - Retorna el cobro creado y las instancias vinculadas.
    """
    order = session.exec(
        select(SalesOrder)
        .where(SalesOrder.id == order_id)
        .options(
            selectinload(SalesOrder.items).selectinload(SalesOrderItem.instances)
        )
    ).first()
    if not order:
        raise HTTPException(status_code=404, detail="Orden de venta no encontrada.")

    # Reunir instancias candidatas: CLOSED y sin cobro asignado
    all_instances: list[SalesOrderItemInstance] = []
    for item in order.items:
        all_instances.extend(item.instances or [])

    if payload.instance_ids:
        candidates = [
            i for i in all_instances
            if i.id in payload.instance_ids
            and i.customer_payment_id is None
            and i.administration_invoice_folio is None
        ]
    else:
        candidates = [
            i for i in all_instances
            if i.customer_payment_id is None
            and i.administration_invoice_folio is None
        ]

    if not candidates:
        raise HTTPException(
            status_code=422,
            detail="No hay instancias pendientes de facturación para esta orden."
        )

    # Crear el CXC de avance
    new_cxc = CustomerPayment(
        sales_order_id=order.id,
        payment_type=PaymentType.PROGRESS,
        invoice_folio=payload.invoice_folio,
        amount=payload.amount,
        status=CXCStatus.PENDING,
        created_by_user_id=current_user.id,
        invoice_date=payload.invoice_date or datetime.utcnow(),
    )
    session.add(new_cxc)
    session.flush()  # Obtener el ID del CXC

    # Vincular instancias al cobro de avance
    linked = []
    for inst in candidates:
        inst.customer_payment_id = new_cxc.id
        session.add(inst)
        # Liberar nómina a READY_TO_PAY al facturar
        from app.models.production import PayrollPayment, PayrollStatus
        from app.models.production import InstallationAssignment
        payroll_stmt = (
            select(PayrollPayment)
            .join(InstallationAssignment,
                  PayrollPayment.installation_assignment_id == InstallationAssignment.id)
            .where(InstallationAssignment.instance_id == inst.id)
            .where(PayrollPayment.status == PayrollStatus.PENDING_SIGNATURE)
        )
        payroll_rows = session.exec(payroll_stmt).all()
        for pp in payroll_rows:
            pp.status = PayrollStatus.READY_TO_PAY
            session.add(pp)
        linked.append({
            "instance_id": inst.id,
            "custom_name": inst.custom_name,
            "production_status": inst.production_status,
        })

    session.commit()
    session.refresh(new_cxc)

    return {
        "message": f"Factura de avance registrada. {len(linked)} instancia(s) vinculada(s).",
        "cxc_id": new_cxc.id,
        "payment_type": new_cxc.payment_type,
        "invoice_folio": new_cxc.invoice_folio,
        "amount": new_cxc.amount,
        "status": new_cxc.status,
        "instances_linked": linked,
    }

@router.post("/orders/{order_id}/emit_advance_invoice", response_model=dict)
def emit_advance_invoice(
    order_id: int,
    payload: PaymentPayload,
    session: Session = Depends(get_session),
    current_user: User = Depends(get_current_active_user),
):
    return sales_service.emit_advance_invoice(session, order_id, payload, current_user)


@router.post("/orders/{order_id}/emit_full_invoice", response_model=dict)
def emit_full_invoice(
    order_id: int,
    payload: PaymentPayload,
    session: Session = Depends(get_session),
    current_user: User = Depends(get_current_active_user),
):
    return sales_service.emit_full_invoice(session, order_id, payload, current_user)


def _sum_active_installments(session: Session, cxc_id: int) -> float:
    return sales_repo.sum_active_installments(session, cxc_id)


@router.post("/invoices/{cxc_id}/installments", response_model=dict)
def register_installment(
    cxc_id: int,
    payload: PaymentPayload,
    session: Session = Depends(get_session),
    current_user: User = Depends(get_current_active_user),
):
    return sales_service.register_installment(session, cxc_id, payload, current_user)


@router.get("/invoices/{cxc_id}/installments", response_model=dict)
def list_installments(cxc_id: int, session: Session = Depends(get_session),
                      current_user: User = Depends(get_current_active_user)):
    cxc = session.get(CustomerPayment, cxc_id)
    if not cxc:
        raise HTTPException(404, "Factura no encontrada.")

    rows = session.exec(
        select(CustomerPaymentInstallment)
        .where(CustomerPaymentInstallment.customer_payment_id == cxc_id)
        .order_by(CustomerPaymentInstallment.payment_date)
    ).all()

    abonos = [{
        "id": r.id,
        "amount": r.amount,
        "payment_date": r.payment_date.isoformat() if r.payment_date else None,
        "reference": r.reference,
        "notes": r.notes,
        "is_cancelled": r.is_cancelled,
        "cancel_reason": r.cancel_reason,
        "cancelled_at": r.cancelled_at.isoformat() if r.cancelled_at else None,
        "bank_transaction_id": r.bank_transaction_id,
        "is_advance": bool(r.is_advance) or cxc.payment_type == PaymentType.ADVANCE,
    } for r in rows]

    total_abonado = _sum_active_installments(session, cxc_id)
    monto_factura = float(cxc.amount or 0.0)
    linked_instance_ids = [
        i.id for i in session.exec(
            select(SalesOrderItemInstance).where(
                SalesOrderItemInstance.customer_payment_id == cxc_id
            )
        ).all()
    ]

    return {
        "cxc_id": cxc.id,
        "invoice_folio": cxc.invoice_folio,
        "payment_type": cxc.payment_type,
        "monto_factura": monto_factura,
        "total_abonado": total_abonado,
        "saldo": max(monto_factura - total_abonado, 0.0),
        "status": cxc.status,
        "linked_instance_ids": linked_instance_ids,
        "abonos": abonos,
    }


@router.patch("/installments/{installment_id}", response_model=dict)
def update_installment(
    installment_id: int,
    data: InstallmentUpdate,
    session: Session = Depends(get_session),
    current_user: User = Depends(get_current_active_user),
):
    return sales_service.update_installment(session, installment_id, data, current_user)


@router.patch("/installments/{installment_id}/cancel", response_model=dict)
def cancel_installment(
    installment_id: int,
    data: InstallmentCancel,
    session: Session = Depends(get_session),
    current_user: User = Depends(get_current_active_user),
):
    return sales_service.cancel_installment(session, installment_id, data, current_user)


@router.get("/invoices/pending-cxc", response_model=list)
def list_pending_cxc(
    session: Session = Depends(get_session),
    current_user: User = Depends(get_current_active_user),
):
    return sales_service.list_pending_cxc(session)


@router.get("/invoices/cxc-report", response_model=list)
def cxc_report(
    client_id: Optional[int] = Query(None),
    date_from: Optional[str] = Query(None),
    date_to: Optional[str] = Query(None),
    include_paid: bool = Query(False),
    only_cancelled: bool = Query(False),
    session: Session = Depends(get_session),
    current_user: User = Depends(get_current_active_user),
):
    if only_cancelled:
        estados = [CXCStatus.CANCELLED]
    elif include_paid:
        estados = [CXCStatus.PENDING, CXCStatus.PAID]
    else:
        estados = [CXCStatus.PENDING]
    return sales_service.get_cxc_report(
        session, current_user, estados, client_id, date_from, date_to,
    )


@router.get("/orders/pending-progress")
def get_pending_progress_instances(
    session: Session = Depends(get_session),
    current_user: User = Depends(get_current_active_user),
):
    """
    Retorna todas las instancias en estado 🟢🟢 CLOSED que aún no tienen
    una Factura de Avance asignada (customer_payment_id IS NULL).
    Usado por la bandeja 'Avances por Facturar' en Administración.
    """
    instances = session.exec(_pending_progress_instances_base_stmt()).all()
    return [_instance_to_progress_dict(inst) for inst in instances]


@router.delete("/orders/{order_id}")
def delete_sales_order(order_id: int, session: Session = Depends(get_session)):
    """
    ELIMINAR COTIZACIÓN
    """
    order = session.get(SalesOrder, order_id)
    if not order:
        raise HTTPException(status_code=404, detail="Cotización no encontrada")
        
    session.delete(order)
    session.commit()
    return {"ok": True}

# ==========================================
# 7. CONTROL DE NÓMINA (TESORERÍA)
# ==========================================

@router.patch("/payments/{payment_id}")
def update_payment_commission(
    payment_id: int, 
    payload: PaymentCommissionUpdate, 
    session: Session = Depends(get_session)
):
    """
    Endpoint utilizado por Tesorería para marcar una comisión
    como 'Ya Pagada' al asesor de ventas.
    """
    payment = session.get(CustomerPayment, payment_id)
    if not payment:
        raise HTTPException(status_code=404, detail="El cobro no existe en la base de datos.")
    
    payment.commission_paid = payload.commission_paid
    session.add(payment)
    session.commit()
    session.refresh(payment)
    return {"ok": True, "commission_paid": payment.commission_paid}


@router.patch("/orders/{order_id}/payments/{payment_id}", response_model=CustomerPaymentRead)
def update_customer_payment(
    order_id: int,
    payment_id: int,
    data: CustomerPaymentUpdate,
    session: Session = Depends(get_session),
    current_user: User = Depends(get_current_active_user),
):
    return sales_service.update_customer_payment(session, order_id, payment_id, data, current_user)


@router.patch("/orders/{order_id}/payments/{payment_id}/cancel", response_model=CustomerPaymentRead)
def cancel_customer_payment(
    order_id: int,
    payment_id: int,
    data: CustomerPaymentCancel,
    session: Session = Depends(get_session),
    current_user: User = Depends(get_current_active_user),
):
    return sales_service.cancel_customer_payment(session, order_id, payment_id, data, current_user)


@router.patch("/payments/{payment_id}/retention", response_model=CustomerPaymentRead)
def patch_payment_retention(
    payment_id: int,
    data: RetentionUpdate,
    session: Session = Depends(get_session),
    current_user: User = Depends(get_current_active_user),
):
    return sales_service.update_retention(session, payment_id, data, current_user)


@router.post("/payments/{payment_id}/retention/invoice", response_model=CustomerPaymentRead)
def post_retention_invoice(
    payment_id: int,
    payload: RetentionInvoicePayload,
    session: Session = Depends(get_session),
    current_user: User = Depends(get_current_active_user),
):
    return sales_service.invoice_retention(session, payment_id, payload.folio, current_user)


@router.post("/payments/{payment_id}/retention/collect", response_model=CustomerPaymentRead)
def post_retention_collect(
    payment_id: int,
    session: Session = Depends(get_session),
    current_user: User = Depends(get_current_active_user),
):
    return sales_service.collect_retention(session, payment_id, current_user)


@router.post("/payments/{payment_id}/retention/waive", response_model=CustomerPaymentRead)
def post_retention_waive(
    payment_id: int,
    payload: RetentionWaivePayload,
    session: Session = Depends(get_session),
    current_user: User = Depends(get_current_active_user),
):
    return sales_service.waive_retention(session, payment_id, payload.reason, current_user)


@router.get("/retentions/alerts", response_model=List[RetentionAlertRead])
def get_retention_alerts(
    session: Session = Depends(get_session),
    current_user: User = Depends(get_current_active_user),
):
    return sales_service.get_retention_alerts(session, current_user)


@router.patch("/orders/{order_id}/retention-defaults", response_model=SalesOrderRead)
def patch_order_retention_defaults(
    order_id: int,
    data: RetentionDefaultsUpdate,
    session: Session = Depends(get_session),
    current_user: User = Depends(get_current_active_user),
):
    return sales_service.update_retention_defaults(session, order_id, data, current_user)


# ==========================================
# 8. REPORTE DE COMISIONES
# ==========================================

@router.get("/commissions/payroll-overview", response_model=CommissionsPayrollOverview)
def get_commissions_payroll_overview(
    session: Session = Depends(get_session),
    current_user: User = Depends(get_current_active_user),
):
    return sales_service.get_commissions_overview(session)


@router.patch("/commissions/{commission_id}/payroll")
def update_commission_payroll_fields(
    commission_id: int,
    payload: CommissionPayrollUpdate,
    session: Session = Depends(get_session),
    current_user: User = Depends(get_current_active_user),
):
    return sales_service.update_commission_payroll(session, commission_id, payload, current_user)


@router.get("/commissions", response_model=List[SalesCommissionRead])
def get_commissions_report(
    user_id: Optional[int] = None,
    commission_type: Optional[str] = None,
    is_paid: Optional[bool] = None,
    session: Session = Depends(get_session),
    current_user: User = Depends(get_current_active_user),
):
    return sales_service.get_commissions_report(
        session, current_user, user_id=user_id, commission_type=commission_type, is_paid=is_paid
    )


@router.patch("/commissions/{commission_id}/mark-paid")
def mark_commission_paid(
    commission_id: int,
    payload: CommissionPaidUpdate,
    session: Session = Depends(get_session),
    current_user: User = Depends(get_current_active_user),
):
    return sales_service.mark_commission_paid(session, commission_id, payload, current_user)


@router.post("/commissions/{commission_id}/release")
def release_commission(
    commission_id: int,
    session: Session = Depends(get_session),
    current_user: User = Depends(get_current_active_user),
):
    return sales_service.release_commission(session, commission_id, current_user)


# ================================================================
# SEGUIMIENTO DE OV — Estado de casas por OV o global
# ================================================================

ACTIVE_ORDER_STATUSES = [
    SalesOrderStatus.WAITING_ADVANCE,
    SalesOrderStatus.SOLD,
    SalesOrderStatus.IN_PRODUCTION,
]

ALL_INSTANCE_STATUSES = [
    "PENDING", "IN_PRODUCTION", "READY",
    "CARGADO", "INSTALLED", "CLOSED", "WARRANTY"
]

@router.get("/houses-status", response_model=List[OrderHousesStatus])
def get_houses_status(
    current_user: CurrentUser,
    order_id: Optional[int] = None,
    session: Session = Depends(get_session),
):
    """
    Devuelve el estado de todas las casas (agrupadas por street+lot) de las OVs
    activas. Si se pasa order_id, filtra solo esa OV.
    Soporta: Dirección, Gerencia, Admin, Ventas, Diseño, Producción.
    """
    # 1. Cargar las OVs
    stmt = select(SalesOrder).options(
        selectinload(SalesOrder.client),
        selectinload(SalesOrder.items).selectinload(SalesOrderItem.instances),
    )
    if order_id:
        stmt = stmt.where(SalesOrder.id == order_id)
    else:
        stmt = stmt.where(SalesOrder.status.in_(ACTIVE_ORDER_STATUSES))
    
    orders = session.exec(stmt).unique().all()

    result = []
    for order in orders:
        client_name = order.client.full_name if order.client else "—"
        order_folio = f"OV-{str(order.id).zfill(4)}"
        
        houses_map: dict = {}
        unassigned: list = []

        for item in (order.items or []):
            for inst in (item.instances or []):
                if inst.is_cancelled:
                    continue
                inst_summary = InstanceStatusSummary(
                    id=inst.id,
                    product_name=item.product_name,
                    custom_name=inst.custom_name or item.product_name,
                    production_status=inst.production_status,
                    production_batch_id=inst.production_batch_id,
                    qr_code=inst.qr_code,
                )
                if inst.street or inst.lot:
                    key = f"{inst.street or ''}||{inst.lot or ''}"
                    if key not in houses_map:
                        houses_map[key] = {
                            "street": inst.street or "",
                            "lot": inst.lot or "",
                            "key": key,
                            "instances": [],
                        }
                    houses_map[key]["instances"].append(inst_summary)
                else:
                    unassigned.append(inst_summary)

        # Armar el resumen por casa
        houses = []
        for key, house_data in sorted(houses_map.items()):
            by_status = {s: 0 for s in ALL_INSTANCE_STATUSES}
            for inst in house_data["instances"]:
                status = inst.production_status
                if status in by_status:
                    by_status[status] += 1
            houses.append(HouseStatusSummary(
                street=house_data["street"],
                lot=house_data["lot"],
                grouping_key=key,
                total=len(house_data["instances"]),
                by_status=by_status,
                instances=house_data["instances"],
            ))

        result.append(OrderHousesStatus(
            order_id=order.id,
            order_folio=order_folio,
            project_name=order.project_name,
            client_name=client_name,
            status=order.status,
            houses=houses,
            unassigned=unassigned,
        ))

    return result