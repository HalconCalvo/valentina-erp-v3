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
from app.services.email_service import send_purchase_order_email
from app.services.inventory_manager import registrar_movimiento_inventario

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
    if not orders:
        return []

    # --- PRECARGA EN LOTE (elimina N+1) ---
    provider_ids = {o.provider_id for o in orders if o.provider_id is not None}
    order_ids = [o.id for o in orders]

    # 1. Proveedores en una sola consulta
    if provider_ids:
        providers = db.exec(select(Provider).where(Provider.id.in_(provider_ids))).all()
    else:
        providers = []
    prov_map = {p.id: p for p in providers}

    # 2. Todos los items de esas órdenes en una sola consulta
    if order_ids:
        all_items = db.exec(
            select(PurchaseOrderItem).where(PurchaseOrderItem.purchase_order_id.in_(order_ids))
        ).all()
    else:
        all_items = []
    items_by_po: dict = {}
    for it in all_items:
        items_by_po.setdefault(it.purchase_order_id, []).append(it)

    # 3. Todos los materiales referenciados en una sola consulta
    material_ids = {it.material_id for it in all_items if it.material_id is not None}
    if material_ids:
        materials = db.exec(select(Material).where(Material.id.in_(material_ids))).all()
    else:
        materials = []
    mat_map = {m.id: m for m in materials}

    # --- CONSTRUCCIÓN EN MEMORIA (sin db.get/db.exec dentro de los loops) ---
    results = []
    for o in orders:
        prov = prov_map.get(o.provider_id)

        items_formatted = []
        for it in items_by_po.get(o.id, []):
            sku_val = "S/SKU"
            if it.material_id:
                mat = mat_map.get(it.material_id)
                if mat: sku_val = mat.sku

            items_formatted.append({
                "id": it.id,
                "material_id": it.material_id, 
                "sku": sku_val,
                "name": it.custom_description or "Material",
                "qty": it.quantity_ordered,
                "quantity_ordered": it.quantity_ordered,
                "quantity_received": it.quantity_received or 0,
                "expected_cost": it.expected_unit_cost,
                "subtotal": (it.quantity_ordered or 0) * (it.expected_unit_cost or 0)
            })

        results.append({
            "id": o.id,
            "folio": o.folio,
            "status": o.status,
            "provider_name": prov.business_name if prov else "Proveedor Desconocido",
            "provider_email": getattr(prov, 'contact_email', None) if prov else None,
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
    if not data.items or len(data.items) == 0:
        raise HTTPException(status_code=400, detail="No se puede crear una orden de compra sin partidas.")
    timestamp = datetime.now().strftime('%y%m%d%H%M')
    new_folio = f"OC-{timestamp}"
    po = PurchaseOrder(
        provider_id=data.provider_id,
        folio=new_folio,
        status="DRAFT",
        total_estimated_amount=0.0,
        is_advance=False,
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

    items_count = db.exec(
        select(PurchaseOrderItem).where(PurchaseOrderItem.purchase_order_id == po.id)
    ).all()
    if not items_count:
        raise HTTPException(status_code=400, detail="No se puede autorizar una orden de compra sin partidas.")

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

    try:
        items = db.exec(select(PurchaseOrderItem).where(PurchaseOrderItem.purchase_order_id == po.id)).all()
        for item in items:
            req_id = getattr(item, 'requisition_id', getattr(item, 'purchase_requisition_id', None))
            if req_id:
                req = db.get(PurchaseRequisition, req_id)
                if req:
                    if action == "RE-COTIZAR":
                        req.status = "PENDIENTE"; db.add(req)
                    elif action == "CANCELAR":
                        notes = req.notes or ''
                        desc = req.custom_description or ''
                        if 'Valentina' in notes or '[AUTO]' in notes or desc == 'REPOSICIÓN AUTOMÁTICA':
                            req.status = "APLAZADA"; db.add(req)
                        else:
                            db.delete(req)
            db.delete(item)
        db.flush()
        db.delete(po)
        db.commit()
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=500, detail=f"Error al rechazar la orden: {str(e)}")

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

    items_count = db.exec(
        select(PurchaseOrderItem).where(PurchaseOrderItem.purchase_order_id == po.id)
    ).all()
    if not items_count:
        raise HTTPException(status_code=400, detail="No se puede enviar una orden de compra sin partidas.")
    
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

    po.status = "RECIBIDA_PARCIAL"  # Se ajustará después según items
    setattr(po, 'invoice_folio_reported', data.get("invoice_folio"))
    setattr(po, 'invoice_total_reported', data.get("invoice_total"))
    po.is_advance = False
    
    # 1. Ingresar stock físico
    # Construir diccionario de cantidades recibidas por SKU
    received_map = {}       # sku -> qty (se mantiene para la lógica de stock existente)
    edited_by_sku = {}      # sku -> dict con los campos editados del renglón
    for ri in (data.get("received_items") or []):
        _sku = ri.get("sku", "")
        _rq = ri.get("received_qty")
        if _rq is None:
            _rq = ri.get("expected_qty") or 0
        received_map[_sku] = float(_rq)
        edited_by_sku[_sku] = {
            "sku": ri.get("sku"),
            "description": ri.get("description"),
            "unit_cost": ri.get("unit_cost"),
        }

    # --- 5c parte A: sembrar renglones NUEVOS agregados en la recepción ---
    # El frontend marca cada renglón agregado con is_new=True y su material_id.
    # Se crea su PurchaseOrderItem en la OC (quantity_ordered=0) ANTES del loop,
    # para que el flujo normal (stock, kárdex, factura) lo procese como a cualquier renglón.
    for ri in (data.get("received_items") or []):
        if not ri.get("is_new"):
            continue
        _new_mat_id = ri.get("material_id")
        if not _new_mat_id:
            continue
        # Evitar duplicar si ya existe un renglón de ese material en la OC
        _exists = db.exec(
            select(PurchaseOrderItem).where(
                PurchaseOrderItem.purchase_order_id == po.id,
                PurchaseOrderItem.material_id == _new_mat_id,
            )
        ).first()
        if _exists:
            continue
        _new_cost = ri.get("unit_cost")
        _new_item = PurchaseOrderItem(
            purchase_order_id=po.id,
            material_id=_new_mat_id,
            quantity_ordered=0,
            quantity_received=0,
            expected_unit_cost=float(_new_cost) if _new_cost is not None else 0.0,
        )
        db.add(_new_item)
    db.flush()  # Asigna id y deja los nuevos items visibles al select siguiente

    items = db.exec(select(PurchaseOrderItem).where(PurchaseOrderItem.purchase_order_id == po.id)).all()
    all_complete = True
    invoice_detail_rows = []
    for item in items:
        qty_ordered = float(item.quantity_ordered or 0)
        qty_this_delivery = 0.0
        mat = db.get(Material, item.material_id) if item.material_id else None

        if item.material_id:
            mat = db.get(Material, item.material_id)
            if mat:
                mat_sku = mat.sku or ""
                route = (getattr(mat, 'production_route', 'MATERIAL') or 'MATERIAL').upper()
                qty_this_delivery = received_map.get(mat_sku, 0)

                # Solo ingresar stock para materiales físicos
                if route == 'MATERIAL' and qty_this_delivery > 0:
                    factor = float(getattr(mat, 'conversion_factor', 1) or 1)
                    qty_in_usage_units = qty_this_delivery * factor
                    mat.physical_stock = (mat.physical_stock or 0) + qty_in_usage_units
                    db.add(mat)

                    # Rastro fechado en el Kárdex (Fase 1): ENTRADA por recepción de OC.
                    # No altera physical_stock (ya sumado arriba); el commit lo hace el endpoint.
                    _edited_cost = edited_by_sku.get(mat_sku, {}).get("unit_cost")
                    _costo_kardex = float(_edited_cost) if _edited_cost is not None else float(getattr(item, 'expected_unit_cost', 0.0) or 0.0)
                    registrar_movimiento_inventario(
                        db,
                        material_id=mat.id,
                        cantidad=qty_in_usage_units,
                        tipo="ENTRADA_COMPRA",
                        costo_unitario=_costo_kardex,
                        reason_code="RECEPCION_OC",
                    )
        else:
            # Item sin material (descripción libre)
            qty_this_delivery = received_map.get(item.custom_description or "", 0)

        # Acumular quantity_received para TODOS los items
        prev_received = float(item.quantity_received or 0)
        item.quantity_received = prev_received + qty_this_delivery
        db.add(item)

        # Camino B: juntar snapshot de este renglón para guardarlo si se genera CxP
        if qty_this_delivery > 0:
            # Resolver el sku base para buscar lo editado
            _base_sku = (mat.sku if (item.material_id and mat) else None)
            _edited = edited_by_sku.get(_base_sku or "", {})
            # sku/description/unit_cost EDITADOS con respaldo al comportamiento actual
            if item.material_id and mat:
                _desc_default = mat.name
                _sku_default = mat.sku
            else:
                _desc_default = item.custom_description
                _sku_default = None
            _final_sku = _edited.get("sku") or _sku_default
            _final_desc = _edited.get("description") or _desc_default
            _final_cost = _edited.get("unit_cost")
            if _final_cost is None:
                _final_cost = float(getattr(item, 'expected_unit_cost', 0.0) or 0.0)
            else:
                _final_cost = float(_final_cost)
            invoice_detail_rows.append({
                "purchase_order_item_id": item.id,
                "material_id": item.material_id,
                "description": _final_desc,
                "sku": _final_sku,
                "quantity_received": qty_this_delivery,
                "unit_cost": _final_cost,
            })

        # Verificar completitud para TODOS los items
        if qty_ordered > 0 and item.quantity_received < qty_ordered:
            all_complete = False

    # Determinar status final
    po.status = "RECIBIDA_TOTAL" if all_complete else "RECIBIDA_PARCIAL"

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
    tax_rate = float(data.get("tax_rate", 0.16) or 0.16)
    # Subtotal calculado del detalle real (suma de qty*unit_cost editado)
    _subtotal_detalle = sum(r["quantity_received"] * r["unit_cost"] for r in invoice_detail_rows)
    if _subtotal_detalle > 0:
        # Hay detalle: el total se calcula del detalle + IVA
        total_recibido_con_iva = round(_subtotal_detalle * (1 + tax_rate), 2)
    else:
        # Respaldo: usar el invoice_total tecleado (comportamiento viejo)
        total_recibido_con_iva = float(data.get("invoice_total", 0))
    saldo_restante = total_recibido_con_iva - total_pagado_anticipos

    # Si hay saldo vivo, se genera la deuda en CxP
    if saldo_restante > 0.01:
        prov = db.get(Provider, po.provider_id)
        credit_days = getattr(prov, 'credit_days', 0) or 0
        due_date = datetime.now() + timedelta(days=credit_days)

        tax_rate = float(data.get("tax_rate", 0.16) or 0.16)
        _subtotal = round(saldo_restante / (1 + tax_rate), 2) if (1 + tax_rate) != 0 else saldo_restante
        _tax_amount = round(saldo_restante - _subtotal, 2)

        new_payable = text("""
            INSERT INTO accounts_payable (
                provider_id, purchase_order_id, invoice_folio,
                total_amount, subtotal, tax_rate, tax_amount,
                due_date, status, created_at, overhead_category
            ) VALUES (
                :prov_id, :po_id, :folio, :total, :subtotal, :tax_rate, :tax_amount,
                :due, 'PENDIENTE', :now, :category
            )
            RETURNING id
        """)
        result_ap = db.exec(new_payable.bindparams(
            prov_id=po.provider_id,
            po_id=po.id,
            folio=data.get("invoice_folio"),
            total=saldo_restante,
            subtotal=_subtotal,
            tax_rate=tax_rate,
            tax_amount=_tax_amount,
            due=due_date,
            now=datetime.now(),
            category=getattr(po, 'overhead_category', None)
        ))
        new_ap_id = result_ap.scalar() if hasattr(result_ap, "scalar") else result_ap.first()[0]

        # Camino B: guardar el detalle de materiales que ampara esta CxP/entrega
        from app.models.finance import PurchaseInvoiceItem
        for row in invoice_detail_rows:
            db.add(PurchaseInvoiceItem(
                accounts_payable_id=new_ap_id,
                purchase_order_item_id=row["purchase_order_item_id"],
                material_id=row["material_id"],
                description=row["description"],
                sku=row["sku"],
                quantity_received=row["quantity_received"],
                unit_cost=row["unit_cost"],
            ))

    # --- Cierre diferido de renglones marcados en la recepción ---
    # El frontend manda items_to_close: lista de purchase_order_item.id a cerrar.
    # Regla (misma que /no-more): recibido > 0 -> satisfecho; recibido 0 -> cancelado.
    # Se evalúa con quantity_received YA actualizado por esta recepción.
    items_to_close = data.get("items_to_close") or []
    for _item_id in items_to_close:
        _it = db.get(PurchaseOrderItem, _item_id)
        if not _it or _it.purchase_order_id != po_id:
            continue
        _recibido = float(_it.quantity_received or 0)
        if _recibido <= 0:
            _it.is_cancelled = True
            _it.is_fulfilled = False
        else:
            _it.is_fulfilled = True
            _it.is_cancelled = False
        _it.cancel_reason = "Cerrado durante recepción"
        db.add(_it)
    db.flush()

    # --- Recalcular estado real de la OC (mismo criterio que /no-more) ---
    _all_items = db.exec(select(PurchaseOrderItem).where(PurchaseOrderItem.purchase_order_id == po_id)).all()
    _hay_pendiente = False
    _hay_recibido = False
    for _it in _all_items:
        _rec = float(_it.quantity_received or 0)
        if _it.is_cancelled or _it.is_fulfilled:
            if _rec > 0:
                _hay_recibido = True
            continue
        _ord = float(_it.quantity_ordered or 0)
        if _rec > 0:
            _hay_recibido = True
        if _ord > 0 and _rec < _ord:
            _hay_pendiente = True
    if not _hay_pendiente:
        po.status = "RECIBIDA_TOTAL" if _hay_recibido else "CANCELADA"
    else:
        po.status = "RECIBIDA_PARCIAL"

    db.add(po)
    db.commit()
    return {"status": "success", "message": "Inventario ingresado y finanzas conciliadas."}

@router.put("/orders/{po_id}/items/{item_id}/no-more")
def mark_item_no_more(*, db: Session = Depends(get_session), po_id: int, item_id: int, current_user: CurrentUser, data: dict = Body(...)):
    try:
        po = db.get(PurchaseOrder, po_id)
        if not po:
            raise HTTPException(status_code=404, detail="Orden no encontrada")
        item = db.get(PurchaseOrderItem, item_id)
        if not item or item.purchase_order_id != po_id:
            raise HTTPException(status_code=404, detail="Renglón no encontrado en esta orden")

        reason = (data.get("reason") or "").strip()
        if not reason:
            raise HTTPException(status_code=400, detail="Debe indicar un motivo")

        recibido = float(item.quantity_received or 0)

        # El sistema decide segun lo recibido:
        if recibido <= 0:
            # Nunca llego nada -> CANCELADO
            item.is_cancelled = True
            item.is_fulfilled = False
            accion = "cancelado"
        else:
            # Llego parte -> SATISFECHO (se cierra el saldo, se respeta lo recibido y su CxP)
            item.is_fulfilled = True
            item.is_cancelled = False
            accion = "satisfecho"
        item.cancel_reason = reason
        db.add(item)
        db.flush()

        # Recalcular estado de la OC.
        # Un renglon esta "resuelto" si: cancelado, satisfecho, o recibido completo.
        all_items = db.exec(select(PurchaseOrderItem).where(PurchaseOrderItem.purchase_order_id == po_id)).all()
        hay_pendiente = False
        hay_recibido = False
        for it in all_items:
            if it.is_cancelled or it.is_fulfilled:
                if float(it.quantity_received or 0) > 0:
                    hay_recibido = True
                continue
            recibido_it = float(it.quantity_received or 0)
            ordenado_it = float(it.quantity_ordered or 0)
            if recibido_it > 0:
                hay_recibido = True
            if ordenado_it > 0 and recibido_it < ordenado_it:
                hay_pendiente = True

        if not hay_pendiente:
            po.status = "RECIBIDA_TOTAL" if hay_recibido else "CANCELADA"
        else:
            po.status = "RECIBIDA_PARCIAL"
        db.add(po)
        db.commit()
        return {"status": "success", "accion": accion, "po_status": po.status}
    except HTTPException:
        db.rollback()
        raise
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=500, detail=f"Error: {str(e)}")

@router.put("/orders/{po_id}/declare-satisfied")
def declare_order_satisfied(*, db: Session = Depends(get_session), po_id: int, current_user: CurrentUser):
    """Declara una OC parcialmente recibida como Satisfecha (cierre manual)."""
    if current_user.role.upper() not in ["ADMIN", "ADMINISTRACION", "ADMINISTRADOR", "GERENCIA", "DIRECTOR"]:
        raise HTTPException(status_code=403, detail="Solo Administración, Gerencia o Dirección pueden declarar una OC como satisfecha.")
    
    po = db.get(PurchaseOrder, po_id)
    if not po:
        raise HTTPException(status_code=404, detail="Orden no encontrada.")
    if po.status != "RECIBIDA_PARCIAL":
        raise HTTPException(status_code=400, detail="Solo se pueden declarar como satisfechas las OCs con entregas parciales.")
    
    po.status = "RECIBIDA_TOTAL"
    db.add(po)
    db.commit()
    return {"status": "success", "message": f"OC {po.folio} declarada como satisfecha."}


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
    if not order_in.items or len(order_in.items) == 0:
        raise HTTPException(status_code=400, detail="No se puede crear una orden de compra sin partidas.")

    provider = db.exec(select(Provider).where(Provider.business_name.ilike(order_in.provider_name))).first()
    if not provider:
        provider = Provider(business_name=order_in.provider_name, credit_days=0, is_active=True)
        db.add(provider)
        db.commit()
        db.refresh(provider)

    timestamp = datetime.now().strftime("%y%m%d%H%M%S")
    subtotal = sum(item.qty * item.expected_cost for item in order_in.items)

    try:
        new_order = PurchaseOrder(
            provider_id=provider.id,
            folio=f"OC-M{timestamp}",
            status="DRAFT",
            total_estimated_amount=subtotal,
            created_by_user_id=current_user.id,
            is_advance=False,
            overhead_category=order_in.overhead_category
        )
        db.add(new_order)
        db.flush()

        for item_in in order_in.items:
            material = None
            # Búsqueda robusta: por SKU con TRIM (ignora espacios), case-insensitive
            if item_in.sku:
                sku_limpio = item_in.sku.strip()
                material = db.exec(
                    select(Material).where(func.trim(Material.sku).ilike(sku_limpio))
                ).first()
            # Respaldo: por nombre con TRIM
            if not material and item_in.name:
                name_limpio = item_in.name.strip()
                material = db.exec(
                    select(Material).where(func.trim(Material.name).ilike(name_limpio))
                ).first()
            # Si no existe, NO crear material a medias: rechazar con mensaje claro
            if not material:
                raise HTTPException(
                    status_code=400,
                    detail=f"El material '{item_in.sku or item_in.name}' no existe en el catálogo. Debe darse de alta antes de crear la orden."
                )

            po_item = PurchaseOrderItem(
                purchase_order_id=new_order.id,
                material_id=material.id,
                custom_description=item_in.name,
                quantity_ordered=item_in.qty,
                expected_unit_cost=item_in.expected_cost
            )
            db.add(po_item)

        db.commit()
    except Exception:
        db.rollback()
        raise

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


@router.post("/orders/{po_id}/send-email")
def send_purchase_order_by_email(
    *,
    db: Session = Depends(get_session),
    po_id: int,
    data: dict = Body(...),
    current_user: CurrentUser
):
    from app.models.users import User
    from types import SimpleNamespace

    po = db.get(PurchaseOrder, po_id)
    if not po:
        raise HTTPException(status_code=404, detail="Orden no encontrada")
    if po.status != "AUTORIZADA":
        raise HTTPException(
            status_code=400,
            detail="Solo se pueden enviar órdenes Autorizadas"
        )

    to_email = data.get("to_email", "").strip()
    if not to_email or "@" not in to_email:
        raise HTTPException(status_code=400, detail="Correo del proveedor inválido")

    config = db.exec(select(GlobalConfig)).first()
    if not config or not config.smtp_email or not config.smtp_password:
        raise HTTPException(
            status_code=400,
            detail="Configura el correo de envío en Ajustes antes de usar esta función (smtp_email y smtp_password en GlobalConfig)."
        )

    # Generar PDF
    items = db.exec(
        select(PurchaseOrderItem).where(PurchaseOrderItem.purchase_order_id == po.id)
    ).all()

    creator = None
    if getattr(po, "created_by_user_id", None):
        creator = db.get(User, po.created_by_user_id)
    elaborado_por = "Sistema"
    if creator:
        elaborado_por = getattr(
            creator, "full_name",
            getattr(creator, "username", getattr(creator, "email", "Sistema"))
        )

    mock_items = []
    for it in items:
        mat = db.get(Material, it.material_id) if it.material_id else None
        mock_items.append(SimpleNamespace(
            material=mat,
            custom_description=it.custom_description,
            quantity_ordered=it.quantity_ordered,
            expected_unit_cost=it.expected_unit_cost,
            sku=getattr(it, "sku", None)
        ))

    mock_po = SimpleNamespace(
        folio=po.folio,
        created_at=po.created_at,
        authorized_by=getattr(po, "authorized_by", None),
        created_by=elaborado_por,
        items=mock_items
    )

    provider = db.get(Provider, po.provider_id)
    if not provider:
        raise HTTPException(status_code=404, detail="Proveedor no encontrado")

    company_name = getattr(config, "company_name", "Valentina") or "Valentina"
    smtp_host = getattr(config, "smtp_host", None) or "smtp.gmail.com"

    pdf_gen = PDFGenerator()
    pdf_buffer = pdf_gen.generate_po_pdf(
        order=mock_po, provider=provider, config=config
    )

    try:
        send_purchase_order_email(
            smtp_host=smtp_host,
            smtp_email=config.smtp_email,
            smtp_password=config.smtp_password,
            to_email=to_email,
            provider_name=provider.business_name,
            folio=po.folio,
            pdf_buffer=pdf_buffer,
            company_name=company_name
        )
    except Exception as e:
        raise HTTPException(
            status_code=500,
            detail=f"Error al enviar el correo: {str(e)}"
        )

    # Marcar como ENVIADA automáticamente
    po.status = "ENVIADA"
    db.add(po)
    db.commit()

    return {
        "status": "success",
        "message": f"OC {po.folio} enviada por correo a {to_email}"
    }