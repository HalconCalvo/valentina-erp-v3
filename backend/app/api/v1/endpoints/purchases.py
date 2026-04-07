from fastapi import APIRouter, Body, Depends, HTTPException, status
from fastapi.responses import StreamingResponse
from sqlmodel import Session, select, text, Field, SQLModel
from typing import List, Optional
from pydantic import BaseModel
from datetime import datetime, timedelta
from sqlalchemy import func
from types import SimpleNamespace

from app.models.inventory import PurchaseRequisition, PurchaseOrder, PurchaseOrderItem
from app.models.material import Material
from app.models.foundations import Provider, GlobalConfig
from app.models.users import UserRole
from app.core.deps import get_session, CurrentUser
from app.services.purchase_manager import PurchaseManager
from app.services.pdf_generator import PDFGenerator

router = APIRouter()

class RequisitionCreate(BaseModel):
    material_id: int | None = None
    custom_description: str | None = None
    requested_quantity: float
    notes: str | None = None
    requested_by_user_id: int | None = None

class POCreateFromPlanning(BaseModel):
    provider_id: int | None
    items: List[dict]

@router.post("/requisitions/", response_model=PurchaseRequisition, status_code=status.HTTP_201_CREATED)
def create_requisition(*, db: Session = Depends(get_session), req_in: RequisitionCreate):
    if not req_in.material_id and not req_in.custom_description:
        raise HTTPException(status_code=400, detail="Debe indicar un material o una descripción.")
        
    requisition = PurchaseRequisition(
        material_id=req_in.material_id,
        custom_description=req_in.custom_description,
        requested_quantity=req_in.requested_quantity,
        notes=req_in.notes,
        requested_by_user_id=req_in.requested_by_user_id,
        status="PENDIENTE"
    )
    db.add(requisition)
    db.commit()
    db.refresh(requisition)
    return requisition

@router.get("/requisitions/", response_model=List[dict])
def read_requisitions(db: Session = Depends(get_session), skip: int = 0, limit: int = 100):
    PurchaseManager.evaluate_and_create_automatic_requisitions(db)
    
    result = db.execute(
        text("SELECT * FROM purchase_requisitions LIMIT :limit OFFSET :skip"),
        {"limit": limit, "skip": skip}
    ).mappings().all()
    
    return [dict(r) for r in result]

@router.delete("/requisitions/{req_id}")
def delete_purchase_requisition(*, db: Session = Depends(get_session), req_id: int, current_user: CurrentUser):
    req = db.get(PurchaseRequisition, req_id)
    if not req:
        raise HTTPException(status_code=404, detail="Solicitud no encontrada")
    if req.status == "PROCESADA":
        raise HTTPException(status_code=400, detail="No se puede eliminar una solicitud procesada.")
    db.delete(req)
    db.commit()
    return {"status": "success"}

@router.put("/requisitions/{req_id}/transfer")
def transfer_critical_requisition(*, db: Session = Depends(get_session), req_id: int, current_user: CurrentUser):
    req = db.get(PurchaseRequisition, req_id)
    if not req: raise HTTPException(status_code=404)
    req.provider_id = None 
    db.add(req)
    db.commit()
    return {"status": "success"}

@router.put("/requisitions/{req_id}/status")
def update_requisition_status(*, db: Session = Depends(get_session), req_id: int, status: str, current_user: CurrentUser):
    req = db.get(PurchaseRequisition, req_id)
    if not req:
        raise HTTPException(status_code=404, detail="Requisición no encontrada")
    req.status = status
    db.add(req)
    db.commit()
    db.refresh(req)
    return req

@router.get("/orders/", response_model=List[dict])
def read_purchase_orders(*, db: Session = Depends(get_session), status: str | None = None, skip: int = 0, limit: int = 100):
    statement = select(PurchaseOrder)
    if status:
        search_status = f"%{status.strip()}%"
        statement = statement.where(PurchaseOrder.status.ilike(search_status))
    
    orders = db.exec(statement.offset(skip).limit(limit)).all()
    results = []
    
    for o in orders:
        prov = db.get(Provider, o.provider_id)
        item_statement = select(PurchaseOrderItem).where(PurchaseOrderItem.purchase_order_id == o.id)
        db_items = db.exec(item_statement).all()
        
        items_formatted = []
        for it in db_items:
            sku_val = "S/SKU"
            if it.material_id:
                mat = db.get(Material, it.material_id)
                if mat: sku_val = mat.sku
            
            items_formatted.append({
                "id": it.id,
                "material_id": it.material_id, 
                "sku": sku_val,
                "name": it.custom_description or "Material",
                "qty": it.quantity_ordered,
                "expected_cost": it.expected_unit_cost,
                "subtotal": (it.quantity_ordered or 0) * (it.expected_unit_cost or 0)
            })

        results.append({
            "id": o.id,
            "folio": o.folio,
            "status": o.status,
            "provider_name": prov.business_name if prov else "Proveedor Desconocido",
            "credit_days": getattr(prov, 'credit_days', 0) if prov else 0,
            "total_estimated_amount": o.total_estimated_amount or 0,
            "items": items_formatted,
            "authorized_by": getattr(o, 'authorized_by', None),
            "authorized_at": o.authorized_at.isoformat() if getattr(o, 'authorized_at', None) else None,
            "invoice_folio_reported": getattr(o, 'invoice_folio_reported', None),
            "is_advance": getattr(o, 'is_advance', False),
            "invoice_total_reported": getattr(o, 'invoice_total_reported', 0.0)
        })
        
    return results

@router.post("/orders/bulk-emit")
def emit_bulk_purchase_order(*, db: Session = Depends(get_session), data: POCreateFromPlanning, current_user: CurrentUser):
    if not data.provider_id: raise HTTPException(status_code=400)
    timestamp = datetime.now().strftime('%y%m%d%H%M')
    new_folio = f"OC-{timestamp}"
    po = PurchaseOrder(
        provider_id=data.provider_id,
        folio=new_folio,
        status="BORRADOR",
        total_estimated_amount=0.0,
        is_advance=True,
        created_by_user_id=current_user.id 
    )
    db.add(po)
    db.flush() 

    total_amount = 0.0
    for item in data.items:
        po_item = PurchaseOrderItem(
            purchase_order_id=po.id,
            material_id=item.get("material_id"),
            custom_description=item.get("name"),
            quantity_ordered=item.get("qty"),
            expected_unit_cost=item.get("expected_cost"),
            # Se ignora de forma segura si la propiedad no está en el modelo
            requisition_id=item.get("requisition_id") 
        )
        db.add(po_item)
        total_amount += (float(item.get("qty")) * float(item.get("expected_cost")))

        req_id = item.get("requisition_id")
        if req_id:
            requisition = db.get(PurchaseRequisition, req_id)
            if requisition:
                requisition.status = "PROCESADA"
                db.add(requisition)

    po.total_estimated_amount = total_amount
    db.commit()
    return {"status": "success", "po_id": po.id, "folio": new_folio}

# =================================================================
# AQUÍ ESTÁ EL PARCHE APLICADO (SE REMOVIÓ EL BLOQUE SQL QUE FALLABA)
# =================================================================
@router.put("/orders/{po_id}/authorize")
def authorize_purchase_order(*, db: Session = Depends(get_session), po_id: int, current_user: CurrentUser):
    po = db.get(PurchaseOrder, po_id)
    if not po: raise HTTPException(status_code=404)

    user_id = getattr(current_user, 'email', None) or getattr(current_user, 'username', 'USUARIO')
    po.status = "AUTORIZADA"
    po.authorized_by = user_id
    po.authorized_at = datetime.now()

    # Ya no ejecutamos la consulta RAW hacia requisition_id porque no existe.
    db.add(po)
    db.commit() 
    db.refresh(po)
    return po

@router.put("/orders/{po_id}/revoke")
def revoke_purchase_order(*, db: Session = Depends(get_session), po_id: int, current_user: CurrentUser):
    po = db.get(PurchaseOrder, po_id)
    if not po: raise HTTPException(status_code=404)
    if po.status != "AUTORIZADA": raise HTTPException(status_code=400)

    po.status = "BORRADOR"
    po.authorized_by = None
    po.authorized_at = None
    db.add(po)
    db.commit()
    return {"status": "success"}

@router.post("/orders/{po_id}/reject")
def reject_purchase_order(
    *, 
    db: Session = Depends(get_session), 
    po_id: int, 
    action: str, 
    current_user: CurrentUser
):
    po = db.get(PurchaseOrder, po_id)
    if not po: raise HTTPException(status_code=404, detail="Orden no encontrada")
    if po.status != "BORRADOR": raise HTTPException(status_code=400, detail="Solo se pueden rechazar órdenes en Borrador")

    items = db.exec(select(PurchaseOrderItem).where(PurchaseOrderItem.purchase_order_id == po.id)).all()
    
    for item in items:
        # Extraer el ID de la solicitud original de forma segura (sin fallos SQL)
        req_id = getattr(item, 'requisition_id', getattr(item, 'purchase_requisition_id', None))
        if req_id:
            req = db.get(PurchaseRequisition, req_id)
            if req:
                if action == "RE-COTIZAR":
                    req.status = "PENDIENTE"
                    db.add(req)
                elif action == "CANCELAR":
                    notes = req.notes or ''
                    desc = req.custom_description or ''
                    if 'Valentina' in notes or '[AUTO]' in notes or desc == 'REPOSICIÓN AUTOMÁTICA':
                        req.status = "APLAZADA"
                        db.add(req)
                    else:
                        db.delete(req)
        db.delete(item)
        
    db.delete(po)
    db.commit()
    return {"status": "success", "message": f"Orden rechazada. Acción: {action}"}

@router.delete("/orders/{po_id}/items/{item_id}")
def remove_item_from_purchase_order(*, db: Session = Depends(get_session), po_id: int, item_id: int, current_user: CurrentUser):
    po = db.get(PurchaseOrder, po_id)
    if not po: raise HTTPException(status_code=404, detail="Orden de compra no encontrada.")
    if po.status not in ["BORRADOR", "RECHAZADA"]:
        raise HTTPException(status_code=400, detail="Solo se pueden modificar órdenes en Borrador.")

    po_item = db.get(PurchaseOrderItem, item_id)
    if not po_item or po_item.purchase_order_id != po.id:
        raise HTTPException(status_code=404, detail="Partida no encontrada en esta orden.")

    req_id = getattr(po_item, 'requisition_id', getattr(po_item, 'purchase_requisition_id', None))
    if req_id:
        requisition = db.get(PurchaseRequisition, req_id)
        if requisition:
            requisition.status = "PENDIENTE" 
            db.add(requisition)

    db.delete(po_item)
    db.commit()

    remaining_items = db.exec(select(PurchaseOrderItem).where(PurchaseOrderItem.purchase_order_id == po.id)).all()
    if not remaining_items:
        db.delete(po)
    else:
        new_total = sum((getattr(it, 'quantity_ordered', 0) or 0) * (getattr(it, 'expected_unit_cost', 0) or 0) for it in remaining_items)
        po.total_estimated_amount = new_total
        db.add(po)
        
    db.commit()
    return {"status": "success", "message": "Partida removida exitosamente."}

@router.put("/orders/{po_id}/dispatch")
def dispatch_purchase_order(*, db: Session = Depends(get_session), po_id: int, current_user: CurrentUser):
    po = db.get(PurchaseOrder, po_id)
    if not po or po.status != "AUTORIZADA": raise HTTPException(status_code=400)
    po.status = "ENVIADA"
    db.add(po)
    db.commit()
    return {"status": "success"}

@router.put("/orders/{po_id}/receive")
def receive_purchase_order(*, db: Session = Depends(get_session), po_id: int, current_user: CurrentUser, data: dict = Body(...)):
    po = db.get(PurchaseOrder, po_id)
    if not po: raise HTTPException(status_code=404, detail="Orden no encontrada")

    po.status = "RECIBIDA_TOTAL"
    setattr(po, 'invoice_folio_reported', data.get("invoice_folio"))
    setattr(po, 'invoice_total_reported', data.get("invoice_total"))
    
    items = db.exec(select(PurchaseOrderItem).where(PurchaseOrderItem.purchase_order_id == po.id)).all()
    for item in items:
        if item.material_id:
            mat = db.get(Material, item.material_id)
            if mat:
                mat.physical_stock = (mat.physical_stock or 0) + item.quantity_ordered
                db.add(mat)

    prov = db.get(Provider, po.provider_id)
    credit_days = getattr(prov, 'credit_days', 0)
    due_date = datetime.now() + timedelta(days=credit_days)

    new_payable = text("""
        INSERT INTO accounts_payable (
            provider_id, purchase_order_id, invoice_folio, total_amount, due_date, status, created_at
        ) VALUES (
            :prov_id, :po_id, :folio, :total, :due, 'PENDIENTE', :now
        )
    """)
    db.exec(new_payable.bindparams(prov_id=po.provider_id, po_id=po.id, folio=data.get("invoice_folio"), total=data.get("invoice_total"), due=due_date, now=datetime.now()))
    db.add(po)
    db.commit()
    return {"status": "success", "message": "Inventario y CxP actualizados."}

@router.put("/orders/{po_id}/report-discrepancy")
def report_cost_discrepancy(*, db: Session = Depends(get_session), po_id: int, data: dict = Body(...), current_user: CurrentUser):
    po = db.get(PurchaseOrder, po_id)
    if not po: raise HTTPException(status_code=404)

    po.status = "DISCREPANCIA_COSTO"
    setattr(po, 'invoice_folio_reported', data.get("reported_folio"))
    setattr(po, 'invoice_total_reported', data.get("reported_total"))
    db.add(po)
    db.commit()
    return {"status": "warning", "message": "Discrepancia registrada."}

@router.get("/planning/consolidated", response_model=List[dict])
def get_purchase_planning(db: Session = Depends(get_session)):
    PurchaseManager.evaluate_and_create_automatic_requisitions(db)
    return PurchaseManager.get_consolidated_requisitions(db)

@router.get("/notifications/pending-tasks")
def get_admin_pending_tasks(db: Session = Depends(get_session)):
    PurchaseManager.evaluate_and_create_automatic_requisitions(db)
    
    reqs_pendientes = db.execute(
        text("SELECT COUNT(id) FROM purchase_requisitions WHERE UPPER(status) IN ('PENDIENTE', 'EN_COMPRA')")
    ).scalar() or 0
    
    reqs_congeladas = db.execute(
        text("SELECT COUNT(id) FROM purchase_requisitions WHERE UPPER(status) = 'APLAZADA'")
    ).scalar() or 0
    
    orders_to_authorize = db.execute(
        text("SELECT COUNT(id) FROM purchase_orders WHERE UPPER(status) = 'BORRADOR'")
    ).scalar() or 0
    
    materials = db.execute(text("SELECT id, physical_stock, min_stock FROM materials WHERE min_stock > 0")).mappings().all()
    active_pos = db.execute(text("SELECT id FROM purchase_orders WHERE UPPER(status) IN ('BORRADOR', 'AUTORIZADA', 'ENVIADA')")).mappings().all()
    
    active_po_ids = [str(po['id']) for po in active_pos]
    transit_dict = {}
    if active_po_ids:
        ids_str = ",".join(active_po_ids)
        items = db.execute(
            text(f"SELECT material_id, quantity_ordered FROM purchase_order_items WHERE purchase_order_id IN ({ids_str})")
        ).mappings().all()
        for item in items:
            m_id = item['material_id']
            if m_id is not None:
                qty = float(item['quantity_ordered'] or 0.0)
                transit_dict[m_id] = transit_dict.get(m_id, 0.0) + qty

    stock_critico = 0
    for mat in materials:
        m_id = mat['id']
        phys = float(mat['physical_stock'] or 0.0)
        min_s = float(mat['min_stock'] or 0.0)
        transit = transit_dict.get(m_id, 0.0)
        if (phys + transit) <= min_s:
            existing = db.execute(
                text("SELECT id FROM purchase_requisitions WHERE material_id = :m_id AND UPPER(status) IN ('PENDIENTE', 'EN_COMPRA', 'APLAZADA')"),
                {"m_id": m_id}
            ).first()
            if not existing:
                stock_critico += 1

    total_general = reqs_pendientes + stock_critico + reqs_congeladas + orders_to_authorize
    
    return {
        "pending_requisitions": reqs_pendientes + stock_critico + reqs_congeladas,
        "orders_to_authorize": orders_to_authorize,
        "total_alerts": total_general 
    }

@router.get("/orders/{po_id}/pdf")
def download_purchase_order_pdf(po_id: int, db: Session = Depends(get_session)):
    """Genera y descarga el PDF de la Orden de Compra"""
    po = db.get(PurchaseOrder, po_id)
    if not po:
        raise HTTPException(status_code=404, detail="Orden de Compra no encontrada")
        
    items = db.exec(select(PurchaseOrderItem).where(PurchaseOrderItem.purchase_order_id == po.id)).all()
    
    # --- SOLUCIÓN: Creamos "clones" ligeros sin las restricciones estrictas de SQLModel ---
    mock_items = []
    for it in items:
        mat = db.get(Material, it.material_id) if it.material_id else None
        mock_items.append(SimpleNamespace(
            material=mat,
            custom_description=it.custom_description,
            quantity_ordered=it.quantity_ordered,
            expected_unit_cost=it.expected_unit_cost,
            sku=getattr(it, 'sku', None)
        ))
        
    mock_po = SimpleNamespace(
        folio=po.folio,
        created_at=po.created_at,
        authorized_by=getattr(po, 'authorized_by', None),
        items=mock_items
    )
    # ------------------------------------------------------------------------------------
        
    provider = db.get(Provider, po.provider_id)
    if not provider:
        raise HTTPException(status_code=404, detail="Proveedor no encontrado")
        
    config = db.exec(select(GlobalConfig)).first()
    
    pdf_gen = PDFGenerator()
    # Le enviamos nuestro clon ligero al generador de PDF
    pdf_buffer = pdf_gen.generate_po_pdf(order=mock_po, provider=provider, config=config)
    
    filename = f"OC_{po.folio}.pdf"
    return StreamingResponse(
        pdf_buffer, 
        media_type="application/pdf", 
        headers={"Content-Disposition": f'inline; filename="{filename}"'}
    )