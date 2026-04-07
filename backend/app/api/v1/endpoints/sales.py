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
    SalesOrderStatus, InstanceStatus, CustomerPayment, PaymentType, PaymentMethod, CXCStatus
)
from app.models.design import ProductVersion
from app.models.material import Material
from app.models.foundations import TaxRate, GlobalConfig, Client
from app.models.users import User 
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
    AL COBRAR DINERO, LIBERAMOS COMISIÓN AL VENDEDOR
    """
    order = session.get(SalesOrder, order_id)
    cxc = session.get(CustomerPayment, cxc_id)
    
    cxc.status = CXCStatus.PAID
    cxc.payment_date = datetime.utcnow()
    
    # Restar saldo
    order.outstanding_balance -= cxc.amount
    
    # ---> NUEVO: LA COMISIÓN SE MARCA COMO 'EXIGIBLE' EN EL REPORTE <---
    # Esta es una marca lógica para que Tesorería sepa que este pago ya generó comisión pagable.
    cxc.commission_paid = False # Significa: "Listo para que Tesorería le pague al vendedor"
    
    if order.outstanding_balance <= 0.1:
        order.status = SalesOrderStatus.FINISHED
        
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
    # 1. Buscamos el cobro exacto que originó esta comisión
    payment = session.get(CustomerPayment, payment_id)
    
    if not payment:
        raise HTTPException(status_code=404, detail="El cobro no existe en la base de datos.")
    
    # 2. Actualizamos la bandera
    payment.commission_paid = payload.commission_paid
    
    # 3. Guardamos y devolvemos
    session.add(payment)
    session.commit()
    session.refresh(payment)
    
    return {"ok": True, "commission_paid": payment.commission_paid}