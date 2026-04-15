from typing import Optional, List, Any, Dict
from pydantic import BaseModel
from datetime import datetime
import math
from fastapi import APIRouter, Depends, HTTPException, status, Body
from sqlmodel import Session, select, delete
from sqlalchemy.orm import selectinload
from fastapi.responses import StreamingResponse

from app.core.database import get_session
from app.core.deps import get_current_active_user 

# Importamos los modelos
from app.models.sales import (
    SalesOrder, SalesOrderItem, SalesOrderItemInstance, 
    SalesOrderStatus, InstanceStatus, CustomerPayment, PaymentType, PaymentMethod, CXCStatus,
    SalesCommission, CommissionType
)
from app.models.design import ProductVersion
from app.models.material import Material
from app.models.foundations import TaxRate, GlobalConfig, Client
from app.models.users import User, UserRole
from app.services.pdf_generator import PDFGenerator

# --- IMPORTAMOS LOS MOTORES (V3.5) ---
from app.services.cost_engine import CostEngine
from app.services.traceability import TraceabilityManager

from app.schemas.sales_schema import (
    SalesOrderCreate, SalesOrderRead, SalesOrderUpdate,
    SalesOrderItemCreate
)

class PaymentPayload(BaseModel):
    invoice_folio: Optional[str] = None
    amount: float = 0.0                 
    amortized_advance: float = 0.0      
    instance_ids: List[int] = []

router = APIRouter()

def normalize_commission(rate: float | None) -> float:
    if rate is None: return 0.0
    if rate > 1.0: return rate / 100.0
    return rate

# ==========================================
# 1. CREAR ORDEN
# ==========================================
@router.post("/orders", response_model=SalesOrderRead)
def create_sales_order(
    order_in: SalesOrderCreate,
    session: Session = Depends(get_session),
    current_user: User = Depends(get_current_active_user)
):
    try:
        tax_rate = session.get(TaxRate, order_in.tax_rate_id)
        if not tax_rate: raise HTTPException(status_code=400, detail="Tasa de impuestos inválida")

        raw_commission = current_user.commission_rate if current_user.commission_rate is not None else 0.0
        applied_commission = normalize_commission(raw_commission)

        db_order = SalesOrder(
            project_name=order_in.project_name,
            client_id=order_in.client_id,
            tax_rate_id=order_in.tax_rate_id,
            user_id=current_user.id,
            applied_commission_percent=applied_commission,
            valid_until=order_in.valid_until,
            delivery_date=order_in.delivery_date,
            applied_margin_percent=order_in.applied_margin_percent,
            applied_tolerance_percent=order_in.applied_tolerance_percent,
            advance_percent=order_in.advance_percent,
            has_advance_invoice=order_in.has_advance_invoice,
            currency=order_in.currency,
            notes=order_in.notes,
            conditions=order_in.conditions,
            external_invoice_ref=order_in.external_invoice_ref,
            is_warranty=order_in.is_warranty,
            status=SalesOrderStatus.DRAFT, 
            created_at=datetime.utcnow()
        )
        session.add(db_order)
        session.commit()
        session.refresh(db_order)

        items_sum = 0.0 
        for item_in in order_in.items:
            snapshot_data = {}
            calculated_frozen_cost = 0.0

            if item_in.origin_version_id:
                version = session.get(ProductVersion, item_in.origin_version_id)
                if version:
                    snapshot_data = {
                        "source_version": version.version_name,
                        "captured_at": datetime.now().isoformat(),
                        "ingredients": []
                    }
                    for component in version.components:
                        mat = session.get(Material, component.material_id)
                        if mat:
                            current_cost = mat.current_cost
                            line_cost = component.quantity * current_cost
                            calculated_frozen_cost += line_cost
                            snapshot_data["ingredients"].append({
                                "material_id": mat.id,  # <--- EL DATO FALTANTE
                                "sku": mat.sku, "name": mat.name, "qty_recipe": component.quantity,
                                "frozen_unit_cost": current_cost, "line_total": line_cost
                            })
            else:
                snapshot_data = item_in.cost_snapshot or {"type": "MANUAL_ENTRY"}
                calculated_frozen_cost = item_in.frozen_unit_cost

            line_amount = item_in.quantity * item_in.unit_price
            items_sum += line_amount

            db_item = SalesOrderItem(
                sales_order_id=db_order.id,
                product_name=item_in.product_name,
                origin_version_id=item_in.origin_version_id,
                quantity=item_in.quantity,
                unit_price=item_in.unit_price,
                subtotal_price=line_amount,
                cost_snapshot=snapshot_data,
                frozen_unit_cost=calculated_frozen_cost
            )
            session.add(db_item)
            session.flush()

            qty_int = int(item_in.quantity) if item_in.quantity > 0 else 1
            for i in range(1, qty_int + 1):
                session.add(SalesOrderItemInstance(
                    sales_order_item_id=db_item.id,
                    custom_name=f"{item_in.product_name} - Instancia {i}",
                    production_status=InstanceStatus.PENDING
                ))

        commission_amount = items_sum * applied_commission
        final_subtotal = items_sum + commission_amount
        tax_amount = final_subtotal * tax_rate.rate
        total_price = final_subtotal + tax_amount

        db_order.commission_amount = commission_amount 
        db_order.subtotal = final_subtotal 
        db_order.tax_amount = tax_amount
        db_order.total_price = total_price
        db_order.outstanding_balance = total_price 
        
        session.add(db_order)
        session.commit()
        session.refresh(db_order)
        return db_order
    except Exception as e:
        session.rollback()
        raise HTTPException(status_code=500, detail=str(e))

# ==========================================
# 2. LISTAR ORDENES
# ==========================================
@router.get("/orders", response_model=List[SalesOrderRead])
def read_sales_orders(
    status: SalesOrderStatus | None = None,
    client_id: int | None = None,
    session: Session = Depends(get_session),
    current_user: User = Depends(get_current_active_user)
):
    query = select(SalesOrder).options(
        selectinload(SalesOrder.client),
        selectinload(SalesOrder.items).selectinload(SalesOrderItem.instances),
        selectinload(SalesOrder.payments),
        selectinload(SalesOrder.user)
    )
    if current_user.role and current_user.role.upper() == "SALES":
        query = query.where(SalesOrder.user_id == current_user.id)
    if status: query = query.where(SalesOrder.status == status)
    if client_id: query = query.where(SalesOrder.client_id == client_id)
    
    return session.exec(query.order_by(SalesOrder.id.desc())).unique().all()

# ==========================================
# 3. DETALLE ORDEN
# ==========================================
@router.get("/orders/{order_id}", response_model=SalesOrderRead)
def read_order_detail(
    order_id: int,
    session: Session = Depends(get_session),
    current_user: User = Depends(get_current_active_user)
):
    query = select(SalesOrder).where(SalesOrder.id == order_id).options(
        selectinload(SalesOrder.client),
        selectinload(SalesOrder.items).selectinload(SalesOrderItem.instances),
        selectinload(SalesOrder.payments)
    )
    order = session.exec(query).unique().first()
    if not order: raise HTTPException(status_code=404, detail="Orden no encontrada")
    if current_user.role and current_user.role.upper() == "SALES" and order.user_id != current_user.id:
        raise HTTPException(status_code=403, detail="Acceso denegado")
    return order

# ==========================================
# 4. ACTUALIZAR ORDEN
# ==========================================
@router.patch("/orders/{order_id}", response_model=SalesOrderRead)
def update_sales_order(
    order_id: int,
    order_update: SalesOrderUpdate,
    session: Session = Depends(get_session),
    current_user: User = Depends(get_current_active_user)
):
    db_order = session.get(SalesOrder, order_id)
    if not db_order: raise HTTPException(404, "No encontrada")
    if current_user.role and current_user.role.upper() == "SALES" and db_order.user_id != current_user.id:
        raise HTTPException(403, "Acceso denegado")

    update_data = order_update.model_dump(exclude_unset=True)
    items_data = update_data.pop("items", None) 
    
    for key, value in update_data.items(): setattr(db_order, key, value)
    if "applied_commission_percent" in update_data:
        db_order.applied_commission_percent = normalize_commission(update_data["applied_commission_percent"])

    if items_data is not None:
        # 1. Limpieza profunda: Borrar instancias primero para evitar registros fantasma
        old_items = session.exec(select(SalesOrderItem).where(SalesOrderItem.sales_order_id == order_id)).all()
        for old_item in old_items:
            session.exec(delete(SalesOrderItemInstance).where(SalesOrderItemInstance.sales_order_item_id == old_item.id))
            
        session.exec(delete(SalesOrderItem).where(SalesOrderItem.sales_order_id == order_id))
        session.flush() 
        
        items_sum = 0.0
        product_counters = {} # <-- El nuevo contador inteligente global
        
        for item_in in order_update.items:
            snapshot_data = {}
            calculated_frozen_cost = 0.0

            if item_in.origin_version_id:
                version = session.get(ProductVersion, item_in.origin_version_id)
                if version:
                    snapshot_data = {
                        "source_version": version.version_name,
                        "captured_at": datetime.now().isoformat(),
                        "ingredients": []
                    }
                    for component in version.components:
                        mat = session.get(Material, component.material_id)
                        if mat:
                            current_cost = mat.current_cost
                            line_cost = component.quantity * current_cost
                            calculated_frozen_cost += line_cost
                            snapshot_data["ingredients"].append({
                                "material_id": mat.id,
                                "sku": mat.sku, "name": mat.name, "qty_recipe": component.quantity,
                                "frozen_unit_cost": current_cost, "line_total": line_cost
                            })
            else:
                snapshot_data = item_in.cost_snapshot or {"type": "MANUAL_ENTRY"}
                calculated_frozen_cost = item_in.frozen_unit_cost or 0.0

            qty = item_in.quantity or 0
            price = item_in.unit_price or 0
            line_amount = qty * price
            items_sum += line_amount

            # 3. GUARDAMOS EL ITEM
            db_item = SalesOrderItem(
                sales_order_id=db_order.id,
                product_name=item_in.product_name,
                origin_version_id=item_in.origin_version_id,
                quantity=qty,
                unit_price=price,
                subtotal_price=line_amount,
                cost_snapshot=snapshot_data,
                frozen_unit_cost=calculated_frozen_cost
            )
            session.add(db_item)
            session.flush()

            # 4. GUARDAMOS LAS INSTANCIAS CON LA NUEVA LÓGICA CONTINUA
            qty_int = int(qty) if qty > 0 else 1
            base_name = item_in.product_name
            
            if base_name not in product_counters:
                product_counters[base_name] = 1
                
            for i in range(qty_int):
                current_num = product_counters[base_name]
                session.add(SalesOrderItemInstance(
                    sales_order_item_id=db_item.id,
                    custom_name=f"{base_name} - Instancia {current_num}",
                    production_status=InstanceStatus.PENDING
                ))
                product_counters[base_name] += 1
        
        # 5. RECALCULAR TOTALES FINANCIEROS (CON COMISIÓN E IVA)
        
        # El subtotal base es la suma de todos los productos
        base_products_sum = items_sum 
        
        # Calculamos cuánto dinero es de comisión (ej. 0.05 * 630,451.60)
        # Usamos el porcentaje que ya está guardado en la db_order
        comm_percent = db_order.applied_commission_percent or 0.0
        commission_amount = base_products_sum * comm_percent
        
        # El subtotal real para el cliente es Productos + Comisión
        real_subtotal = base_products_sum + commission_amount
        
        # Obtenemos la tasa de IVA (por defecto 16%)
        tax_rate_obj = session.get(TaxRate, db_order.tax_rate_id)
        tax_multiplier = tax_rate_obj.rate if tax_rate_obj else 0.16
        
        # Calculamos el IVA sobre el subtotal que ya incluye la comisión
        tax_total = real_subtotal * tax_multiplier
        
        # Seteamos los valores finales en la base de datos
        db_order.subtotal = real_subtotal
        db_order.commission_amount = commission_amount
        db_order.tax_amount = tax_total
        db_order.total_price = real_subtotal + tax_total
        db_order.outstanding_balance = db_order.total_price
        
    session.add(db_order)
    session.commit()
    session.refresh(db_order)
    return db_order

# ==========================================
# 5. WORKFLOW: AUTORIZACIÓN Y SEMÁFORO
# ==========================================
@router.post("/orders/{order_id}/request-auth", response_model=SalesOrderRead)
def request_order_authorization(order_id: int, session: Session = Depends(get_session)):
    order = session.get(SalesOrder, order_id)
    order.status = SalesOrderStatus.SENT
    session.add(order)
    session.commit()
    return order

@router.post("/orders/{order_id}/authorize", response_model=SalesOrderRead)
def authorize_order(order_id: int, session: Session = Depends(get_session)):
    order = session.get(SalesOrder, order_id)
    order.status = SalesOrderStatus.ACCEPTED
    
    # ---> V3.5: BLOQUEO DE ALMACÉN AL AUTORIZAR <---
    TraceabilityManager.create_inventory_reservations(session, order)
    
    session.add(order)
    session.commit()
    return order

@router.post("/orders/{order_id}/mark_waiting_advance", response_model=SalesOrderRead)
def mark_as_waiting_advance(
    order_id: int, 
    session: Session = Depends(get_session)
):
    """
    EL SEMÁFORO DEL 3% (Centralizado en el Motor)
    """
    order = session.get(SalesOrder, order_id)
    if not order: raise HTTPException(404, "No encontrada")
    
    # LLAMADA AL MOTOR DE COSTOS
    analysis = CostEngine.analyze_order_drift(session, order)

    if not analysis["is_safe"]:
        order.status = SalesOrderStatus.CHANGE_REQUESTED
        session.add(order)
        session.commit()
        raise HTTPException(
            status_code=409, 
            detail=f"SEMÁFORO ROJO: Inflación del {analysis['variation_percent']}%. Supera el {analysis['tolerance_percent']}%. Requiere re-cotizar."
        )

    order.status = SalesOrderStatus.WAITING_ADVANCE
    session.add(order)
    session.commit()
    return order

# ==========================================
# 6. PAGOS Y COMISIONES (CÓDIGO HÍBRIDO)
# ==========================================
@router.post("/orders/{order_id}/mark_sold", response_model=SalesOrderRead)
def register_advance(order_id: int, payload: PaymentPayload, session: Session = Depends(get_session), current_user: User = Depends(get_current_active_user)):
    order = session.get(SalesOrder, order_id)
    order.status = SalesOrderStatus.SOLD
    new_cxc = CustomerPayment(
        sales_order_id=order.id, payment_type=PaymentType.ADVANCE,
        invoice_folio=payload.invoice_folio, amount=payload.amount,
        status=CXCStatus.PENDING, created_by_user_id=current_user.id
    )
    session.add(new_cxc)
    session.commit()
    return order

@router.post("/orders/{order_id}/confirm_payment/{cxc_id}", response_model=SalesOrderRead)
def confirm_cxc_payment(order_id: int, cxc_id: int, session: Session = Depends(get_session)):
    """
    AL COBRAR DINERO, LIBERAMOS COMISIÓN AL VENDEDOR Y GENERAMOS
    COMISIONES GLOBALES PARA TODOS LOS DIRECTORES.
    """
    order = session.get(SalesOrder, order_id)
    cxc = session.get(CustomerPayment, cxc_id)

    cxc.status = CXCStatus.PAID
    cxc.payment_date = datetime.utcnow()

    order.outstanding_balance -= cxc.amount
    cxc.commission_paid = False

    if order.outstanding_balance <= 0.1:
        order.status = SalesOrderStatus.FINISHED

    # --- BASE ANTES DE IVA ---
    tax_rate_obj = session.get(TaxRate, order.tax_rate_id)
    tax_multiplier = tax_rate_obj.rate if tax_rate_obj else 0.16
    base_before_tax = cxc.amount / (1.0 + tax_multiplier)

    # --- COMISIÓN DEL VENDEDOR ASIGNADO ---
    seller_commission_rate = normalize_commission(order.applied_commission_percent or 0.0)
    if order.user_id and seller_commission_rate > 0:
        seller_commission_amount = base_before_tax * seller_commission_rate
        session.add(SalesCommission(
            customer_payment_id=cxc_id,
            user_id=order.user_id,
            commission_type=CommissionType.SELLER,
            base_amount=base_before_tax,
            rate=seller_commission_rate,
            commission_amount=seller_commission_amount,
        ))

    # --- COMISIONES GLOBALES PARA DIRECTORES ---
    directors = session.exec(
        select(User).where(User.role == UserRole.DIRECTOR, User.is_active == True)
    ).all()
    for director in directors:
        dir_rate = normalize_commission(director.global_commission_rate or 0.0)
        if dir_rate > 0:
            session.add(SalesCommission(
                customer_payment_id=cxc_id,
                user_id=director.id,
                commission_type=CommissionType.DIRECTOR_GLOBAL,
                base_amount=base_before_tax,
                rate=dir_rate,
                commission_amount=base_before_tax * dir_rate,
            ))

    session.add(cxc)
    session.add(order)
    session.commit()
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

    pdf_gen = PDFGenerator()
    pdf_buffer = pdf_gen.generate_quote_pdf(
        order=order, 
        client=client, 
        config=config, 
        seller_name=seller_name, 
        seller_email=seller_email
    )

    filename = f"Cotizacion_{order.id}.pdf"
    return StreamingResponse(
        pdf_buffer, 
        media_type="application/pdf", 
        headers={"Content-Disposition": f'inline; filename="{filename}"'}
    )

# ==========================================
# RECHAZAR COTIZACIÓN (REGRESAR A BORRADORES)
# ==========================================
@router.post("/orders/{order_id}/request_changes", response_model=SalesOrderRead)
def request_order_changes(order_id: int, session: Session = Depends(get_session)):
    """
    Cuando se rechaza, regresa al estatus DRAFT (Borrador) 
    para que el Vendedor la edite y vuelva a pedir autorización.
    """
    order = session.get(SalesOrder, order_id)
    if not order:
        raise HTTPException(status_code=404, detail="Cotización no encontrada")
    
    # La devolvemos a la mesa de trabajo
    order.status = getattr(SalesOrderStatus, "DRAFT", "DRAFT")
    
    session.add(order)
    session.commit()
    session.refresh(order)
    return order

# ==========================================
# MARCAR COMO PERDIDA (CLIENTE NO ACEPTÓ)
# ==========================================
@router.post("/orders/{order_id}/mark_lost", response_model=SalesOrderRead)
def mark_order_lost(order_id: int, session: Session = Depends(get_session)):
    """
    El vendedor marca la cotización como perdida (el cliente no aceptó ni rechazó
    formalmente, simplemente se cerró la negociación). Equivale a CLIENT_REJECTED.
    """
    order = session.get(SalesOrder, order_id)
    if not order:
        raise HTTPException(status_code=404, detail="Cotización no encontrada")
    order.status = SalesOrderStatus.CLIENT_REJECTED
    session.add(order)
    session.commit()
    session.refresh(order)
    return order


# ==========================================
# RECHAZAR COTIZACIÓN (DIRECCIÓN → VENDEDOR)
# ==========================================
@router.post("/orders/{order_id}/reject", response_model=SalesOrderRead)
def reject_order(order_id: int, session: Session = Depends(get_session)):
    """
    Dirección rechaza formalmente la cotización. Se registra como REJECTED
    (distinto de CLIENT_REJECTED que es cuando el cliente no acepta).
    """
    order = session.get(SalesOrder, order_id)
    if not order:
        raise HTTPException(status_code=404, detail="Cotización no encontrada")
    order.status = SalesOrderStatus.REJECTED
    session.add(order)
    session.commit()
    session.refresh(order)
    return order


# ==========================================
# REGISTRAR AVANCE DE OBRA (🟢🟢 → FACTURA DE AVANCE)
# ==========================================
class RegisterProgressPayload(BaseModel):
    invoice_folio: Optional[str] = None
    amount: float = 0.0
    instance_ids: List[int] = []      # Si está vacío, toma todas las instancias CLOSED sin pago


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
    - Vincula las instancias a ese cobro (instance.payment_id).
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
            and i.production_status == InstanceStatus.CLOSED
            and i.payment_id is None
        ]
    else:
        candidates = [
            i for i in all_instances
            if i.production_status == InstanceStatus.CLOSED
            and i.payment_id is None
        ]

    if not candidates:
        raise HTTPException(
            status_code=422,
            detail="No hay instancias en estado 🟢🟢 CERRADO pendientes de facturación para esta orden."
        )

    # Crear el CXC de avance
    new_cxc = CustomerPayment(
        sales_order_id=order.id,
        payment_type=PaymentType.PROGRESS,
        invoice_folio=payload.invoice_folio,
        amount=payload.amount,
        status=CXCStatus.PENDING,
        created_by_user_id=current_user.id,
    )
    session.add(new_cxc)
    session.flush()  # Obtener el ID del CXC

    # Vincular instancias al cobro de avance
    linked = []
    for inst in candidates:
        inst.payment_id = new_cxc.id
        session.add(inst)
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


@router.get("/orders/pending-progress")
def get_pending_progress_instances(
    session: Session = Depends(get_session),
    current_user: User = Depends(get_current_active_user),
):
    """
    Retorna todas las instancias en estado 🟢🟢 CLOSED que aún no tienen
    una Factura de Avance asignada (payment_id == None).
    Usado por la bandeja 'Avances por Facturar' en Administración.
    """
    stmt = (
        select(SalesOrderItemInstance)
        .where(
            SalesOrderItemInstance.production_status == InstanceStatus.CLOSED,
            SalesOrderItemInstance.payment_id == None,  # noqa: E711
        )
        .options(
            selectinload(SalesOrderItemInstance.item)
                .selectinload(SalesOrderItem.order)
                .selectinload(SalesOrder.client)
        )
    )
    instances = session.exec(stmt).all()

    result = []
    for inst in instances:
        item = inst.item
        order = item.order if item else None
        client = order.client if order else None
        result.append({
            "instance_id": inst.id,
            "custom_name": inst.custom_name or f"Instancia #{inst.id}",
            "production_status": inst.production_status,
            "signed_received_at": inst.signed_received_at.isoformat() if inst.signed_received_at else None,
            "order_id": order.id if order else None,
            "order_folio": f"OV-{str(order.id).zfill(4)}" if order else "—",
            "project_name": order.project_name if order else None,
            "client_name": client.full_name if client else "Sin Cliente",
            "item_product_name": item.product_name if item else None,
        })

    return result


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
class PaymentCommissionUpdate(BaseModel):
    commission_paid: bool

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

# ==========================================
# 8. REPORTE DE COMISIONES
# ==========================================
class SalesCommissionRead(BaseModel):
    id: int
    customer_payment_id: int
    user_id: int
    user_name: Optional[str]
    user_role: Optional[str]
    commission_type: str
    base_amount: float
    rate: float
    commission_amount: float
    is_paid: bool
    created_at: datetime

    sales_order_id: Optional[int] = None
    project_name: Optional[str] = None
    payment_amount: Optional[float] = None
    admin_notes: Optional[str] = None
    payroll_deferred: bool = False

    class Config:
        from_attributes = True


def _days_waiting(reference: Optional[datetime]) -> int:
    if not reference:
        return 0
    now = datetime.utcnow()
    ref = reference.replace(tzinfo=None) if getattr(reference, "tzinfo", None) else reference
    return max(0, (now - ref).days)


class PayrollCommissionRow(BaseModel):
    """Fila de auditoría de nómina de comisiones (totales independientes por bucket)."""
    kind: str  # PROVISIONAL | ACCRUED
    id: Optional[int] = None
    sales_order_id: int
    project_name: Optional[str] = None
    seller_name: Optional[str] = None
    amount: float
    days_waiting: int
    reference_label: str
    customer_payment_id: Optional[int] = None
    cxc_status: Optional[str] = None
    admin_notes: Optional[str] = None
    payroll_deferred: bool = False


class CommissionsPayrollOverview(BaseModel):
    retained_total: float
    payable_total: float
    paid_total: float
    retained: List[PayrollCommissionRow]
    payable: List[PayrollCommissionRow]
    paid: List[PayrollCommissionRow]


@router.get("/commissions/payroll-overview", response_model=CommissionsPayrollOverview)
def get_commissions_payroll_overview(
    session: Session = Depends(get_session),
    current_user: User = Depends(get_current_active_user),
):
    """
    Tres bandejas con sumas independientes (sin duplicar montos entre tarjetas):
    - Retenidas: OV en espera de anticipo (provisional) + comisiones ligadas a CXC aún PENDING.
    - Por pagar: comisiones de vendedor cobradas (CXC PAID), no pagadas al asesor, no diferidas.
    - Pagadas: comisiones marcadas is_paid.
    """
    retained: List[PayrollCommissionRow] = []
    payable: List[PayrollCommissionRow] = []
    paid: List[PayrollCommissionRow] = []

    # --- A) Provisional: órdenes esperando anticipo (sin desglose por cobro aún) ---
    waiting = session.exec(
        select(SalesOrder).where(SalesOrder.status == SalesOrderStatus.WAITING_ADVANCE)
    ).all()
    for o in waiting:
        seller = session.get(User, o.user_id) if o.user_id else None
        est = float(o.commission_amount or 0.0)
        if est <= 0 and o.applied_commission_percent and o.total_price:
            est = float(o.total_price) * float(o.applied_commission_percent)
        retained.append(PayrollCommissionRow(
            kind="PROVISIONAL",
            id=None,
            sales_order_id=o.id,
            project_name=o.project_name,
            seller_name=seller.full_name if seller else None,
            amount=est,
            days_waiting=_days_waiting(o.created_at),
            reference_label="Anticipo pendiente (OV)",
            customer_payment_id=None,
            cxc_status="WAITING_ADVANCE",
            admin_notes=None,
            payroll_deferred=False,
        ))

    # --- B) Comisiones con CXC aún no liquidado (retenidas) ---
    pending_cxc = session.exec(
        select(SalesCommission, CustomerPayment)
        .join(CustomerPayment, SalesCommission.customer_payment_id == CustomerPayment.id)
        .where(
            SalesCommission.commission_type == CommissionType.SELLER,
            SalesCommission.is_paid == False,  # noqa: E712
            CustomerPayment.status == CXCStatus.PENDING,
        )
    ).all()
    for c, cx in pending_cxc:
        user = session.get(User, c.user_id)
        order = session.get(SalesOrder, cx.sales_order_id)
        retained.append(PayrollCommissionRow(
            kind="ACCRUED",
            id=c.id,
            sales_order_id=order.id if order else cx.sales_order_id,
            project_name=order.project_name if order else None,
            seller_name=user.full_name if user else None,
            amount=float(c.commission_amount),
            days_waiting=_days_waiting(cx.created_at),
            reference_label=f"CXC #{cx.id} pendiente de cobro",
            customer_payment_id=cx.id,
            cxc_status=cx.status.value if hasattr(cx.status, "value") else str(cx.status),
            admin_notes=c.admin_notes,
            payroll_deferred=bool(c.payroll_deferred),
        ))

    # --- C) Por pagar: cobro confirmado, comisión aún no liquidada al vendedor ---
    ready = session.exec(
        select(SalesCommission, CustomerPayment)
        .join(CustomerPayment, SalesCommission.customer_payment_id == CustomerPayment.id)
        .where(
            SalesCommission.commission_type == CommissionType.SELLER,
            SalesCommission.is_paid == False,  # noqa: E712
            SalesCommission.payroll_deferred == False,  # noqa: E712
            CustomerPayment.status == CXCStatus.PAID,
        )
    ).all()
    for c, cx in ready:
        user = session.get(User, c.user_id)
        order = session.get(SalesOrder, cx.sales_order_id)
        payable.append(PayrollCommissionRow(
            kind="ACCRUED",
            id=c.id,
            sales_order_id=order.id if order else cx.sales_order_id,
            project_name=order.project_name if order else None,
            seller_name=user.full_name if user else None,
            amount=float(c.commission_amount),
            days_waiting=_days_waiting(c.created_at),
            reference_label=f"Cobro #{cx.id} liquidado",
            customer_payment_id=cx.id,
            cxc_status=cx.status.value if hasattr(cx.status, "value") else str(cx.status),
            admin_notes=c.admin_notes,
            payroll_deferred=bool(c.payroll_deferred),
        ))

    # --- D) Histórico pagado ---
    done = session.exec(
        select(SalesCommission)
        .where(
            SalesCommission.commission_type == CommissionType.SELLER,
            SalesCommission.is_paid == True,  # noqa: E712
        )
        .order_by(SalesCommission.created_at.desc())
    ).all()
    for c in done:
        cx = session.get(CustomerPayment, c.customer_payment_id)
        user = session.get(User, c.user_id)
        order = session.get(SalesOrder, cx.sales_order_id) if cx else None
        paid.append(PayrollCommissionRow(
            kind="ACCRUED",
            id=c.id,
            sales_order_id=order.id if order else (cx.sales_order_id if cx else 0),
            project_name=order.project_name if order else None,
            seller_name=user.full_name if user else None,
            amount=float(c.commission_amount),
            days_waiting=0,
            reference_label="Comisión pagada",
            customer_payment_id=c.customer_payment_id,
            cxc_status=(cx.status.value if cx and hasattr(cx.status, "value") else (str(cx.status) if cx else None)),
            admin_notes=c.admin_notes,
            payroll_deferred=False,
        ))

    return CommissionsPayrollOverview(
        retained_total=sum(r.amount for r in retained),
        payable_total=sum(r.amount for r in payable),
        paid_total=sum(r.amount for r in paid),
        retained=retained,
        payable=payable,
        paid=paid,
    )


class CommissionPayrollUpdate(BaseModel):
    admin_notes: Optional[str] = None
    payroll_deferred: Optional[bool] = None


@router.patch("/commissions/{commission_id}/payroll")
def update_commission_payroll_fields(
    commission_id: int,
    payload: CommissionPayrollUpdate,
    session: Session = Depends(get_session),
    current_user: User = Depends(get_current_active_user),
):
    """Observaciones y aplazamiento de pago en bandeja Por Pagar."""
    commission = session.get(SalesCommission, commission_id)
    if not commission:
        raise HTTPException(status_code=404, detail="Comisión no encontrada.")
    if payload.admin_notes is not None:
        commission.admin_notes = payload.admin_notes
    if payload.payroll_deferred is not None:
        if payload.payroll_deferred and not (payload.admin_notes or commission.admin_notes):
            raise HTTPException(
                status_code=422,
                detail="Debes documentar el motivo en observaciones antes de aplazar u omitir el pago.",
            )
        commission.payroll_deferred = payload.payroll_deferred
    session.add(commission)
    session.commit()
    session.refresh(commission)
    return {"ok": True, "commission_id": commission_id}


class CommissionPaidUpdate(BaseModel):
    is_paid: bool

@router.get("/commissions", response_model=List[SalesCommissionRead])
def get_commissions_report(
    user_id: Optional[int] = None,
    commission_type: Optional[str] = None,
    is_paid: Optional[bool] = None,
    session: Session = Depends(get_session),
    current_user: User = Depends(get_current_active_user)
):
    """
    Reporte consolidado de comisiones (vendedor + globales de directores).
    Acepta filtros opcionales por usuario, tipo y estado de pago.
    """
    query = select(SalesCommission)
    if user_id:
        query = query.where(SalesCommission.user_id == user_id)
    if commission_type:
        query = query.where(SalesCommission.commission_type == commission_type)
    if is_paid is not None:
        query = query.where(SalesCommission.is_paid == is_paid)

    commissions = session.exec(query.order_by(SalesCommission.created_at.desc())).all()

    results = []
    for c in commissions:
        user = session.get(User, c.user_id)
        cxc = session.get(CustomerPayment, c.customer_payment_id)
        order = session.get(SalesOrder, cxc.sales_order_id) if cxc else None

        results.append(SalesCommissionRead(
            id=c.id,
            customer_payment_id=c.customer_payment_id,
            user_id=c.user_id,
            user_name=user.full_name if user else None,
            user_role=user.role if user else None,
            commission_type=c.commission_type,
            base_amount=c.base_amount,
            rate=c.rate,
            commission_amount=c.commission_amount,
            is_paid=c.is_paid,
            created_at=c.created_at,
            sales_order_id=order.id if order else None,
            project_name=order.project_name if order else None,
            payment_amount=cxc.amount if cxc else None,
            admin_notes=getattr(c, "admin_notes", None),
            payroll_deferred=bool(getattr(c, "payroll_deferred", False)),
        ))
    return results

@router.patch("/commissions/{commission_id}/mark-paid")
def mark_commission_paid(
    commission_id: int,
    payload: CommissionPaidUpdate,
    session: Session = Depends(get_session),
    current_user: User = Depends(get_current_active_user)
):
    """
    Tesorería marca una comisión como pagada o pendiente.
    """
    commission = session.get(SalesCommission, commission_id)
    if not commission:
        raise HTTPException(status_code=404, detail="Comisión no encontrada.")
    commission.is_paid = payload.is_paid
    session.add(commission)
    session.commit()
    return {"ok": True, "commission_id": commission_id, "is_paid": commission.is_paid}