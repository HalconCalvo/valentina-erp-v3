from typing import List, Any
from datetime import datetime
from fastapi import APIRouter, Depends, HTTPException
from sqlmodel import Session, select, delete 
from fastapi.responses import StreamingResponse

from app.core.database import get_session
# --- 1. IMPORT DE SEGURIDAD (TOKEN) ---
from app.core.deps import get_current_active_user 

# --- MODELOS ---
from app.models.sales import SalesOrder, SalesOrderItem, SalesOrderStatus
from app.models.design import ProductVersion
from app.models.material import Material
from app.models.foundations import TaxRate
from app.models.foundations import GlobalConfig, Client
from app.models.users import User 
from app.services.pdf_generator import PDFGenerator

# --- SCHEMAS ---
from app.schemas.sales_schema import (
    SalesOrderCreate, SalesOrderRead, SalesOrderUpdate,
    SalesOrderItemCreate
)

router = APIRouter()

# ==========================================
# 1. CREAR ORDEN (COTIZACIÓN) - BLINDADO
# ==========================================
@router.post("/orders", response_model=SalesOrderRead)
def create_sales_order(
    order_in: SalesOrderCreate,
    session: Session = Depends(get_session),
    current_user: User = Depends(get_current_active_user)
):
    try:
        tax_rate = session.get(TaxRate, order_in.tax_rate_id)
        if not tax_rate:
            raise HTTPException(status_code=400, detail="Tasa de impuestos inválida")

        users_commission = current_user.commission_rate if current_user.commission_rate is not None else 0.0

        db_order = SalesOrder(
            project_name=order_in.project_name,
            client_id=order_in.client_id,
            tax_rate_id=order_in.tax_rate_id,
            
            # INYECCIÓN AUTOMÁTICA DEL USUARIO
            user_id=current_user.id,
            applied_commission_percent=users_commission,
            
            valid_until=order_in.valid_until,
            delivery_date=order_in.delivery_date,
            applied_margin_percent=order_in.applied_margin_percent,
            applied_tolerance_percent=order_in.applied_tolerance_percent,
            
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

        running_subtotal = 0.0

        for item_in in order_in.items:
            snapshot_data = {}
            calculated_frozen_cost = 0.0

            if item_in.origin_version_id:
                version = session.get(ProductVersion, item_in.origin_version_id)
                if not version:
                    snapshot_data = {"error": f"Versión ID {item_in.origin_version_id} no encontrada"}
                else:
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
                                "sku": mat.sku,
                                "name": mat.name,
                                "qty_recipe": component.quantity,
                                "frozen_unit_cost": current_cost,
                                "line_total": line_cost
                            })
            else:
                snapshot_data = item_in.cost_snapshot or {"type": "MANUAL_ENTRY", "note": "Sin receta vinculada"}
                calculated_frozen_cost = item_in.frozen_unit_cost

            line_subtotal = item_in.quantity * item_in.unit_price
            running_subtotal += line_subtotal

            db_item = SalesOrderItem(
                sales_order_id=db_order.id,
                product_name=item_in.product_name,
                origin_version_id=item_in.origin_version_id,
                quantity=item_in.quantity,
                unit_price=item_in.unit_price,
                subtotal_price=line_subtotal,
                cost_snapshot=snapshot_data,
                frozen_unit_cost=calculated_frozen_cost
            )
            session.add(db_item)

        tax_amount = running_subtotal * tax_rate.rate
        total_price = running_subtotal + tax_amount

        db_order.subtotal = running_subtotal
        db_order.tax_amount = tax_amount
        db_order.total_price = total_price
        
        session.add(db_order)
        session.commit()
        session.refresh(db_order)

        return db_order
    except Exception as e:
        print(f"ERROR CREATING ORDER: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))

# ==========================================
# 2. LISTAR ORDENES
# ==========================================
@router.get("/orders", response_model=List[SalesOrderRead])
def read_sales_orders(
    status: SalesOrderStatus | None = None,
    client_id: int | None = None,
    session: Session = Depends(get_session)
):
    query = select(SalesOrder)
    if status:
        query = query.where(SalesOrder.status == status)
    if client_id:
        query = query.where(SalesOrder.client_id == client_id)
    
    orders = session.exec(query.order_by(SalesOrder.id.desc())).all()
    return orders

# ==========================================
# 3. DETALLE DE ORDEN
# ==========================================
@router.get("/orders/{order_id}", response_model=SalesOrderRead)
def read_order_detail(
    order_id: int,
    session: Session = Depends(get_session)
):
    order = session.get(SalesOrder, order_id)
    if not order:
        raise HTTPException(status_code=404, detail="Orden no encontrada")
    return order

# ==========================================
# 4. ACTUALIZAR (EDICIÓN COMPLETA)
# ==========================================
@router.patch("/orders/{order_id}", response_model=SalesOrderRead)
def update_sales_order(
    order_id: int,
    order_update: SalesOrderUpdate,
    session: Session = Depends(get_session)
):
    try:
        db_order = session.get(SalesOrder, order_id)
        if not db_order:
            raise HTTPException(status_code=404, detail="Orden no encontrada")

        editable_statuses = [
            SalesOrderStatus.DRAFT, 
            SalesOrderStatus.CHANGE_REQUESTED, 
            SalesOrderStatus.REJECTED,
            SalesOrderStatus.SENT 
        ]
        
        if db_order.status not in editable_statuses:
             raise HTTPException(
                 status_code=400, 
                 detail=f"No puedes editar una cotización en estatus {db_order.status}."
             )

        update_data = order_update.model_dump(exclude_unset=True)
        items_data = update_data.pop("items", None) 

        for key, value in update_data.items():
            setattr(db_order, key, value)

        if items_data is not None:
            statement = delete(SalesOrderItem).where(SalesOrderItem.sales_order_id == order_id)
            session.exec(statement)
            
            running_subtotal = 0.0
            
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
                                    "sku": mat.sku,
                                    "name": mat.name,
                                    "qty_recipe": component.quantity,
                                    "frozen_unit_cost": current_cost,
                                    "line_total": line_cost
                                })
                else:
                    snapshot_data = item_in.cost_snapshot or {"type": "MANUAL_ENTRY"}
                    calculated_frozen_cost = item_in.frozen_unit_cost or 0.0

                qty = item_in.quantity or 0
                price = item_in.unit_price or 0
                line_subtotal = qty * price
                running_subtotal += line_subtotal

                new_db_item = SalesOrderItem(
                    sales_order_id=order_id,
                    product_name=item_in.product_name,
                    origin_version_id=item_in.origin_version_id,
                    quantity=qty,
                    unit_price=price,
                    subtotal_price=line_subtotal,
                    cost_snapshot=snapshot_data,
                    frozen_unit_cost=calculated_frozen_cost
                )
                session.add(new_db_item)
            
            tax_rate = session.get(TaxRate, db_order.tax_rate_id)
            tax_rate_val = tax_rate.rate if tax_rate else 0.16

            tax_amount = running_subtotal * tax_rate_val
            total_price = running_subtotal + tax_amount

            db_order.subtotal = running_subtotal
            db_order.tax_amount = tax_amount
            db_order.total_price = total_price

        session.add(db_order)
        session.commit()
        session.refresh(db_order)
        return db_order

    except HTTPException as he:
        raise he
    except Exception as e:
        print(f"CRITICAL ERROR UPDATING ORDER: {str(e)}") 
        raise HTTPException(status_code=500, detail=f"Error interno: {str(e)}")

# ==========================================
# 5. FLUJO DE AUTORIZACIÓN (FASE 1)
# ==========================================

@router.post("/orders/{order_id}/request-auth", response_model=SalesOrderRead)
def request_order_authorization(
    order_id: int,
    session: Session = Depends(get_session)
):
    order = session.get(SalesOrder, order_id)
    if not order: raise HTTPException(404, "Orden no encontrada")
    
    if order.status not in [SalesOrderStatus.DRAFT, SalesOrderStatus.CHANGE_REQUESTED, SalesOrderStatus.REJECTED]:
         raise HTTPException(400, "Estatus inválido para solicitar autorización")

    order.status = SalesOrderStatus.SENT
    session.add(order)
    session.commit()
    session.refresh(order)
    return order

@router.post("/orders/{order_id}/authorize", response_model=SalesOrderRead)
def authorize_order(
    order_id: int,
    session: Session = Depends(get_session)
):
    order = session.get(SalesOrder, order_id)
    if not order: raise HTTPException(404, "Orden no encontrada")
    
    order.status = SalesOrderStatus.ACCEPTED
    session.add(order)
    session.commit()
    session.refresh(order)
    return order

@router.post("/orders/{order_id}/reject", response_model=SalesOrderRead)
def reject_order(
    order_id: int,
    session: Session = Depends(get_session)
):
    order = session.get(SalesOrder, order_id)
    if not order: raise HTTPException(404, "Orden no encontrada")

    order.status = SalesOrderStatus.REJECTED
    session.add(order)
    session.commit()
    session.refresh(order)
    return order

# ==========================================
# 6. FLUJO DE CIERRE CON CLIENTE (FASE 2)
# ==========================================

@router.post("/orders/{order_id}/mark_sold", response_model=SalesOrderRead)
def mark_as_sold(
    order_id: int,
    session: Session = Depends(get_session)
):
    order = session.get(SalesOrder, order_id)
    if not order: raise HTTPException(404, "Orden no encontrada")

    if order.status != SalesOrderStatus.ACCEPTED:
        raise HTTPException(400, "La cotización debe estar AUTORIZADA para poder venderse.")

    order.status = SalesOrderStatus.SOLD
    session.add(order)
    session.commit()
    session.refresh(order)
    return order

@router.post("/orders/{order_id}/mark_lost", response_model=SalesOrderRead)
def mark_as_lost(
    order_id: int,
    session: Session = Depends(get_session)
):
    order = session.get(SalesOrder, order_id)
    if not order: raise HTTPException(404, "Orden no encontrada")

    order.status = SalesOrderStatus.CLIENT_REJECTED
    session.add(order)
    session.commit()
    session.refresh(order)
    return order

@router.post("/orders/{order_id}/request_changes", response_model=SalesOrderRead)
def request_changes(
    order_id: int,
    session: Session = Depends(get_session)
):
    order = session.get(SalesOrder, order_id)
    if not order: raise HTTPException(404, "Orden no encontrada")

    order.status = SalesOrderStatus.CHANGE_REQUESTED
    session.add(order)
    session.commit()
    session.refresh(order)
    return order

# ==========================================
# 7. PDF y DELETE
# ==========================================
@router.get("/orders/{order_id}/pdf")
def download_quote_pdf(
    order_id: int,
    session: Session = Depends(get_session)
):
    try:
        order = session.get(SalesOrder, order_id)
        if not order: raise HTTPException(404, "Orden no encontrada")
        
        client = session.get(Client, order.client_id)
        if not client: client = Client(full_name="Cliente General", contact_name="")

        config = session.exec(select(GlobalConfig)).first()
        if not config: config = GlobalConfig(company_name="Mi Empresa", company_email="ventas@miempresa.com")

        generator = PDFGenerator()
        pdf_buffer = generator.generate_quote_pdf(order, client, config)
        
        safe_project_name = "".join([c for c in order.project_name if c.isalnum() or c in (' ', '-', '_')]).strip()
        filename = f"Cotizacion_{order_id}_{safe_project_name}.pdf"
        
        return StreamingResponse(
            pdf_buffer, 
            media_type="application/pdf",
            headers={"Content-Disposition": f"attachment; filename={filename}"}
        )
    except Exception as e:
        print(f"PDF ERROR: {str(e)}")
        raise HTTPException(status_code=500, detail="Error generando PDF")

@router.delete("/orders/{order_id}")
def delete_sales_order(
    order_id: int,
    session: Session = Depends(get_session)
):
    order = session.get(SalesOrder, order_id)
    if not order: raise HTTPException(404, "Orden no encontrada")
    
    if order.status in [SalesOrderStatus.ACCEPTED, SalesOrderStatus.SOLD, SalesOrderStatus.SENT]:
        raise HTTPException(status_code=400, detail="No se puede eliminar una orden activa, en revisión o cerrada.")

    statement = delete(SalesOrderItem).where(SalesOrderItem.sales_order_id == order_id)
    session.exec(statement)

    session.delete(order)
    session.commit()
    return {"message": "Orden eliminada correctamente"}