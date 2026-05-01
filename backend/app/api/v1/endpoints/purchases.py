from fastapi import APIRouter, Body, Depends, HTTPException, status
from fastapi.responses import StreamingResponse
from sqlmodel import Session, select, text, Field, SQLModel
from typing import List, Optional
from pydantic import BaseModel
from datetime import datetime, timedelta, date
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

# --- ESQUEMAS ---
class ManualOrderItemCreate(BaseModel):
    sku: Optional[str] = ""
    name: str
    qty: float
    expected_cost: float

class ManualOrderCreate(BaseModel):
    provider_name: str
    items: List[ManualOrderItemCreate]
    overhead_category: Optional[str] = None

class RequisitionCreate(BaseModel):
    material_id: int | None = None
    custom_description: str | None = None
    requested_quantity: float
    notes: str | None = None
    requested_by_user_id: int | None = None

class POCreateFromPlanning(BaseModel):
    provider_id: int | None
    items: List[dict]
    overhead_category: Optional[str] = None

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

@router.put("/requisitions/{req_id}/assign")
def assign_requisition_provider(
    *,
    db: Session = Depends(get_session),
    req_id: int,
    provider_id: int = Body(...),
    expected_unit_cost: float = Body(...),
    current_user: CurrentUser
):
    req = db.get(PurchaseRequisition, req_id)
    if not req:
        raise HTTPException(status_code=404, detail="Requisición no encontrada")
    req.provider_id = provider_id
    req.expected_unit_cost = expected_unit_cost
    db.add(req)
    db.commit()
    db.refresh(req)
    return {"ok": True, "req_id": req_id}

@router.get("/orders/", response_model=List[dict])
def read_purchase_orders(*, db: Session = Depends(get_session), status: str | None = None, skip: int = 0, limit: int = 200):
    statement = select(PurchaseOrder).order_by(PurchaseOrder.id.desc())
    
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
        status="DRAFT",
        total_estimated_amount=0.0,
        is_advance=True,
        created_by_user_id=current_user.id,
        overhead_category=data.overhead_category
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

@router.put("/orders/{po_id}/authorize")
def authorize_purchase_order(*, db: Session = Depends(get_session), po_id: int, current_user: CurrentUser):
    allowed_roles = ["DIRECTOR", "GERENCIA"]
    if current_user.role.upper() not in allowed_roles:
        raise HTTPException(
            status_code=403,
            detail="Solo Dirección y Gerencia pueden autorizar órdenes de compra."
        )

    po = db.get(PurchaseOrder, po_id)
    if not po: raise HTTPException(status_code=404)

    user_id = getattr(current_user, 'email', None) or getattr(current_user, 'username', 'USUARIO')
    po.status = "AUTORIZADA"
    po.authorized_by = user_id
    po.authorized_at = datetime.now()

    db.add(po)
    db.commit() 
    db.refresh(po)
    return po

@router.put("/orders/{po_id}/revoke")
def revoke_purchase_order(*, db: Session = Depends(get_session), po_id: int, current_user: CurrentUser):
    po = db.get(PurchaseOrder, po_id)
    if not po: raise HTTPException(status_code=404)
    if po.status != "AUTORIZADA": raise HTTPException(status_code=400)

    po.status = "DRAFT"
    po.authorized_by = None
    po.authorized_at = None
    db.add(po)
    db.commit()
    return {"status": "success"}

@router.post("/orders/{po_id}/reject")
def reject_purchase_order(*, db: Session = Depends(get_session), po_id: int, action: str, current_user: CurrentUser):
    po = db.get(PurchaseOrder, po_id)
    if not po: raise HTTPException(status_code=404, detail="Orden no encontrada")
    if po.status != "DRAFT": raise HTTPException(status_code=400, detail="Solo se pueden rechazar órdenes en Borrador")

    items = db.exec(select(PurchaseOrderItem).where(PurchaseOrderItem.purchase_order_id == po.id)).all()
    
    for item in items:
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
    if po.status not in ["DRAFT", "RECHAZADA"]:
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
    if not po: raise HTTPException(status_code=404, detail="Orden no encontrada")
    if po.status != "AUTORIZADA": raise HTTPException(status_code=400, detail="Solo se pueden enviar órdenes Autorizadas")
    
    po.status = "ENVIADA"
    db.add(po)
    db.commit()
    return {"status": "success", "message": "Orden despachada exitosamente."}

# --- BOTÓN DE PÁNICO Y RESCATE ---
@router.put("/orders/{po_id}/cancel")
def cancel_dispatched_order(*, db: Session = Depends(get_session), po_id: int, current_user: CurrentUser):
    po = db.get(PurchaseOrder, po_id)
    if not po: raise HTTPException(status_code=404)
    if po.status != "ENVIADA": raise HTTPException(status_code=400)

    po.status = "CANCELADA"
    
    items = db.exec(select(PurchaseOrderItem).where(PurchaseOrderItem.purchase_order_id == po.id)).all()
    for item in items:
        req_id = getattr(item, 'requisition_id', getattr(item, 'purchase_requisition_id', None))
        if req_id:
            req = db.get(PurchaseRequisition, req_id)
            if req:
                req.status = "PENDIENTE"  
                db.add(req)
        else:
            # Rescate automático si la OC fue directa
            new_req = PurchaseRequisition(
                material_id=item.material_id,
                custom_description=item.custom_description,
                requested_quantity=item.quantity_ordered,
                status="PENDIENTE",
                notes="Rescate automático por Cancelación de OC Directa"
            )
            db.add(new_req)
    
    db.add(po)
    db.commit()
    return {"status": "success", "message": "Orden cancelada y materiales devueltos a Planeación."}

@router.put("/orders/{po_id}/receive")
def receive_purchase_order(*, db: Session = Depends(get_session), po_id: int, current_user: CurrentUser, data: dict = Body(...)):
    from app.models.finance import PurchaseInvoice, SupplierPayment, PaymentStatus, InvoiceStatus
    
    po = db.get(PurchaseOrder, po_id)
    if not po: raise HTTPException(status_code=404, detail="Orden no encontrada")

    po.status = "RECIBIDA_TOTAL"
    setattr(po, 'invoice_folio_reported', data.get("invoice_folio"))
    setattr(po, 'invoice_total_reported', data.get("invoice_total"))
    
    # 1. Ingresar stock físico
    items = db.exec(select(PurchaseOrderItem).where(PurchaseOrderItem.purchase_order_id == po.id)).all()
    for item in items:
        if item.material_id:
            mat = db.get(Material, item.material_id)
            if mat:
                mat.physical_stock = (mat.physical_stock or 0) + item.quantity_ordered
                db.add(mat)

    # 2. MATEMÁTICAS DE ANTICIPO VS SALDO
    ant_invoices = db.exec(select(PurchaseInvoice).where(PurchaseInvoice.invoice_number == f"ANT-{po.folio}")).all()
    total_pagado_anticipos = 0.0
    
    for ant in ant_invoices:
        # Sumamos solo lo que Tesorería realmente pagó y aprobó
        pagos = db.exec(select(func.sum(SupplierPayment.amount)).where(
            SupplierPayment.purchase_invoice_id == ant.id,
            SupplierPayment.status == getattr(PaymentStatus, "PAID", "PAID")
        )).one() or 0.0
        total_pagado_anticipos += float(pagos)

        # Matamos el documento proforma en Finanzas
        ant.status = getattr(InvoiceStatus, "PAID", "PAID")
        ant.outstanding_balance = 0
        db.add(ant)

    # 3. La Resta: Total Real - Lo que ya pagó Finanzas
    total_recibido_con_iva = float(data.get("invoice_total", 0))
    saldo_restante = total_recibido_con_iva - total_pagado_anticipos

    # Si hay saldo vivo, se genera la deuda en CxP
    if saldo_restante > 0.01:
        prov = db.get(Provider, po.provider_id)
        credit_days = getattr(prov, 'credit_days', 0) or 0
        due_date = datetime.now() + timedelta(days=credit_days)

        new_payable = text("""
            INSERT INTO accounts_payable (
                provider_id, purchase_order_id, invoice_folio,
                total_amount, due_date, status, created_at,
                overhead_category
            ) VALUES (
                :prov_id, :po_id, :folio, :total, :due, 'PENDIENTE', :now,
                :category
            )
        """)
        db.exec(new_payable.bindparams(
            prov_id=po.provider_id,
            po_id=po.id,
            folio=data.get("invoice_folio"),
            total=saldo_restante,
            due=due_date,
            now=datetime.now(),
            category=getattr(po, 'overhead_category', None)
        ))

    db.add(po)
    db.commit()
    return {"status": "success", "message": "Inventario ingresado y finanzas conciliadas."}

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

# --- CEREBRO DE PLANEACIÓN (Corregido el error 500) ---
@router.get("/planning/consolidated", response_model=List[dict])
def get_purchase_planning(db: Session = Depends(get_session)):
    PurchaseManager.evaluate_and_create_automatic_requisitions(db)
    
    reqs = db.exec(
        select(PurchaseRequisition)
        .where(PurchaseRequisition.status.in_(["PENDIENTE", "EN_COMPRA"]))
    ).all()

    groups = {}
    for req in reqs:
        prov_id = 0
        mat_sku = "S/SKU"
        mat_name = req.custom_description or "Material"
        exp_cost = 0.0

        if req.material_id:
            mat = db.get(Material, req.material_id)
            if mat:
                mat_sku = mat.sku
                mat_name = mat.name
                mat_cost = getattr(mat, 'current_cost', getattr(mat, 'standard_cost', getattr(mat, 'cost', 0.0))) or 0.0
                exp_cost = req.expected_unit_cost if req.expected_unit_cost else mat_cost
                prov_id = req.provider_id if req.provider_id else (getattr(mat, 'provider_id', 0) or 0)

        # Para requisiciones sin material (descripción libre):
        # usar provider_id y expected_unit_cost de la propia requisición
        if not req.material_id:
            prov_id = req.provider_id or 0
            exp_cost = req.expected_unit_cost or 0.0

        if prov_id not in groups:
            prov_name = ""
            if prov_id > 0:
                prov = db.get(Provider, prov_id)
                prov_name = prov.business_name if prov else "Proveedor Desconocido"
            groups[prov_id] = {
                "provider_id": prov_id if prov_id > 0 else None, 
                "provider_name": prov_name,
                "items": []
            }

        groups[prov_id]["items"].append({
            "requisition_id": req.id,
            "material_id": req.material_id,
            "sku": mat_sku,
            "name": mat_name,
            "qty": req.requested_quantity,
            "expected_cost": exp_cost,
            "project_name": getattr(req, 'project_name', None),
            "notes": req.notes,
            "original_desc": req.custom_description
        })

    return list(groups.values())

# --- SINCRONIZADOR DE MENÚ LATERAL (Sin Fantasmas) ---
@router.get("/notifications/pending-tasks")
def get_admin_pending_tasks(db: Session = Depends(get_session)):
    PurchaseManager.evaluate_and_create_automatic_requisitions(db)
    
    # 1. Cuenta solo las pendientes reales (Card A)
    reqs_pendientes = db.execute(
        text("SELECT COUNT(id) FROM purchase_requisitions WHERE UPPER(status) IN ('PENDIENTE', 'EN_COMPRA')")
    ).scalar() or 0
    
    # 2. Cuenta solo las que están en borrador (Card B)
    orders_to_authorize = db.execute(
        text("SELECT COUNT(id) FROM purchase_orders WHERE UPPER(status) = 'DRAFT'")
    ).scalar() or 0

    # 3. Cuenta solo las autorizadas por despachar (Card C)
    orders_to_dispatch = db.execute(
        text("SELECT COUNT(id) FROM purchase_orders WHERE UPPER(status) = 'AUTORIZADA'")
    ).scalar() or 0
    
    # Total exacto y transparente
    total_general = reqs_pendientes + orders_to_authorize + orders_to_dispatch
    
    return {
        "pending_requisitions": reqs_pendientes,
        "orders_to_authorize": orders_to_authorize,
        "total_alerts": total_general 
    }

@router.get("/orders/{po_id}/pdf")
def download_purchase_order_pdf(po_id: int, db: Session = Depends(get_session)):
    from app.models.users import User 
    
    po = db.get(PurchaseOrder, po_id)
    if not po: raise HTTPException(status_code=404, detail="Orden de Compra no encontrada")
        
    items = db.exec(select(PurchaseOrderItem).where(PurchaseOrderItem.purchase_order_id == po.id)).all()
    
    creator = None
    if getattr(po, 'created_by_user_id', None):
        creator = db.get(User, po.created_by_user_id)
        
    elaborado_por = "Sistema"
    if creator:
        elaborado_por = getattr(creator, 'full_name', getattr(creator, 'username', getattr(creator, 'email', 'Sistema')))

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
        created_by=elaborado_por, 
        items=mock_items
    )
        
    provider = db.get(Provider, po.provider_id)
    if not provider: raise HTTPException(status_code=404, detail="Proveedor no encontrado")
        
    config = db.exec(select(GlobalConfig)).first()
    
    pdf_gen = PDFGenerator()
    pdf_buffer = pdf_gen.generate_po_pdf(order=mock_po, provider=provider, config=config)
    
    filename = f"OC_{po.folio}.pdf"
    return StreamingResponse(
        pdf_buffer, 
        media_type="application/pdf", 
        headers={"Content-Disposition": f'inline; filename="{filename}"'}
    )

@router.post("/orders/manual")
def create_manual_order(
    *,
    order_in: ManualOrderCreate,
    db: Session = Depends(get_session),
    current_user: CurrentUser
):
    provider = db.exec(select(Provider).where(Provider.business_name.ilike(order_in.provider_name))).first()
    if not provider:
        provider = Provider(business_name=order_in.provider_name, credit_days=0, is_active=True)
        db.add(provider)
        db.commit()
        db.refresh(provider)

    timestamp = datetime.now().strftime("%y%m%d%H%M%S")
    subtotal = sum(item.qty * item.expected_cost for item in order_in.items)
    
    new_order = PurchaseOrder(
        provider_id=provider.id,
        folio=f"OC-M{timestamp}",
        status="DRAFT",
        total_estimated_amount=subtotal,
        created_by_user_id=current_user.id,
        is_advance=True,
        overhead_category=order_in.overhead_category
    )
    db.add(new_order)
    db.commit()
    db.refresh(new_order)

    for item_in in order_in.items:
        material = None
        if item_in.sku:
            material = db.exec(select(Material).where(Material.sku.ilike(item_in.sku))).first()
        if not material:
            material = db.exec(select(Material).where(Material.name.ilike(item_in.name))).first()
        
        if not material:
            generated_sku = item_in.sku if item_in.sku else f"SKU-M{datetime.now().strftime('%M%S%f')[:6]}"
            material = Material(
                sku=generated_sku,
                name=item_in.name,
                standard_cost=item_in.expected_cost
            )
            db.add(material)
            db.commit()
            db.refresh(material)

        po_item = PurchaseOrderItem(
            purchase_order_id=new_order.id,
            material_id=material.id,
            custom_description=item_in.name,
            quantity_ordered=item_in.qty,
            expected_unit_cost=item_in.expected_cost
        )
        db.add(po_item)
        
    db.commit()
    return {"message": "Orden manual creada con éxito", "order_id": new_order.id}

@router.post("/orders/{po_id}/request-advance")
def request_order_advance(*, db: Session = Depends(get_session), po_id: int, current_user: CurrentUser, data: dict = Body(...)):
    from app.models.finance import PurchaseInvoice, InvoiceStatus
    
    po = db.get(PurchaseOrder, po_id)
    if not po: raise HTTPException(status_code=404, detail="Orden no encontrada")

    # --- CANDADO ANTI-DUPLICADOS ---
    # Verificamos si ya hay un anticipo flotando en Finanzas para este folio
    existing_ant = db.exec(select(PurchaseInvoice).where(
        PurchaseInvoice.invoice_number == f"ANT-{po.folio}",
        PurchaseInvoice.status == getattr(InvoiceStatus, "PENDING", "PENDING")
    )).first()

    if existing_ant:
        raise HTTPException(
            status_code=400, 
            detail="Ya solicitaste un anticipo para esta OC. Tesorería lo está procesando."
        )
    # -------------------------------

    amount = float(data.get("amount", 0))
    if amount <= 0: raise HTTPException(status_code=400, detail="El monto debe ser mayor a 0")

    # Creamos la "Factura Proforma" de Anticipo
    inv = PurchaseInvoice(
        provider_id=po.provider_id,
        invoice_number=f"ANT-{po.folio}",
        issue_date=datetime.now().date(),
        due_date=datetime.now().date(), 
        total_amount=amount,
        outstanding_balance=amount,
        status=getattr(InvoiceStatus, "PENDING", "PENDING")
    )
    db.add(inv)
    db.commit()
    return {"status": "success", "message": "Anticipo solicitado a Tesorería"}


# ─────────────────────────────────────────────────────────────────────────────
# GASTOS OPERATIVOS (overhead directo a CxP sin OC)
# ─────────────────────────────────────────────────────────────────────────────

OVERHEAD_CATEGORIES = [
    'MATERIALES', 'PLANTA', 'COMUNICACIONES', 'COMBUSTIBLES', 'TRANSPORTE',
    'INSUMOS', 'MAQUINARIA', 'EXTERNOS', 'MAQUILA', 'OTRO'
]


class OperationalExpenseCreate(BaseModel):
    provider_name: Optional[str] = None
    concept: str
    overhead_category: str
    total_amount: float
    issue_date: date
    due_date: date
    notes: Optional[str] = None
    instance_id: Optional[int] = None


@router.post("/operational-expenses")
def create_operational_expense(
    *,
    db: Session = Depends(get_session),
    data: OperationalExpenseCreate,
    current_user: CurrentUser
):
    allowed = ["DIRECTOR", "GERENCIA", "ADMIN"]
    role = current_user.role.value if hasattr(current_user.role, "value") \
        else str(current_user.role)
    if role.upper() not in allowed:
        raise HTTPException(status_code=403, detail="Sin permisos.")

    if data.overhead_category not in OVERHEAD_CATEGORIES:
        raise HTTPException(
            status_code=400,
            detail=f"Categoría inválida. Opciones: {OVERHEAD_CATEGORIES}"
        )

    if data.total_amount <= 0:
        raise HTTPException(
            status_code=400, detail="El monto debe ser mayor a 0."
        )

    provider_id = None
    if data.provider_name:
        from app.models.foundations import Provider
        prov = db.exec(
            select(Provider).where(
                Provider.business_name.ilike(data.provider_name)
            )
        ).first()
        if not prov:
            prov = Provider(
                business_name=data.provider_name,
                credit_days=0,
                is_active=True
            )
            db.add(prov)
            db.flush()
        provider_id = prov.id

    folio = f"GASTO-{datetime.now().strftime('%y%m%d%H%M%S')}"
    new_expense = text("""
        INSERT INTO accounts_payable (
            provider_id, purchase_order_id, invoice_folio,
            total_amount, due_date, status, created_at,
            overhead_category, instance_id
        ) VALUES (
            :prov_id, NULL, :folio, :total, :due, 'PENDIENTE', :now,
            :category, :instance_id
        )
    """)
    db.exec(new_expense.bindparams(
        prov_id=provider_id,
        folio=folio,
        total=data.total_amount,
        due=data.due_date,
        now=datetime.now(),
        category=data.overhead_category,
        instance_id=data.instance_id
    ))
    db.commit()

    return {
        "ok": True,
        "folio": folio,
        "message": "Gasto operativo registrado en CXP."
    }


@router.get("/operational-expenses")
def get_operational_expenses(
    *,
    db: Session = Depends(get_session),
    current_user: CurrentUser,
    skip: int = 0,
    limit: int = 100
):
    allowed = ["DIRECTOR", "GERENCIA", "ADMIN"]
    role = current_user.role.value if hasattr(current_user.role, "value") \
        else str(current_user.role)
    if role.upper() not in allowed:
        raise HTTPException(status_code=403, detail="Sin permisos.")

    rows = db.exec(text("""
        SELECT ap.id, ap.invoice_folio, ap.total_amount, ap.due_date,
               ap.status, ap.created_at, ap.overhead_category,
               ap.instance_id, p.business_name as provider_name
        FROM accounts_payable ap
        LEFT JOIN providers p ON ap.provider_id = p.id
        WHERE ap.purchase_order_id IS NULL
        ORDER BY ap.created_at DESC
        LIMIT :limit OFFSET :skip
    """).bindparams(limit=limit, skip=skip)).all()

    return [dict(r._mapping) for r in rows]