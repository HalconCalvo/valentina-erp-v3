"""Purchase domain — business logic (no direct HTTP, queries via repository)."""
from datetime import datetime
from typing import List, Optional

from fastapi import HTTPException
from sqlmodel import Session

from app.models.inventory import PurchaseOrder, PurchaseOrderItem, PurchaseRequisition
from app.repositories import purchase_repository as purchase_repo
from app.services.purchase_manager import PurchaseManager


def list_requisitions(db: Session, skip: int = 0, limit: int = 100) -> List[dict]:
    PurchaseManager.evaluate_and_create_automatic_requisitions(db)
    return purchase_repo.get_requisitions(db, skip=skip, limit=limit)


def list_purchase_orders(
    db: Session,
    status: Optional[str] = None,
    search: Optional[str] = None,
    date_from: Optional[str] = None,
    date_to: Optional[str] = None,
    skip: int = 0,
    limit: int = 200,
) -> List[dict]:
    data = purchase_repo.get_purchase_orders(
        db, status=status, search=search, date_from=date_from,
        date_to=date_to, skip=skip, limit=limit,
    )
    orders = data["orders"]
    if not orders:
        return []

    prov_map = data["prov_map"]
    items_by_po = data["items_by_po"]
    mat_map = data["mat_map"]
    folios_by_po = data["folios_by_po"]
    advance_paid_by_po = data["advance_paid_by_po"]

    results: List[dict] = []
    for o in orders:
        prov = prov_map.get(o.provider_id)
        items_formatted = []
        for it in items_by_po.get(o.id, []):
            sku_val = "S/SKU"
            if it.material_id:
                mat = mat_map.get(it.material_id)
                if mat:
                    sku_val = mat.sku
            items_formatted.append({
                "id": it.id,
                "material_id": it.material_id,
                "sku": sku_val,
                "name": it.custom_description or "Material",
                "qty": it.quantity_ordered,
                "quantity_ordered": it.quantity_ordered,
                "quantity_received": it.quantity_received or 0,
                "expected_cost": it.expected_unit_cost,
                "subtotal": (it.quantity_ordered or 0) * (it.expected_unit_cost or 0),
            })
        results.append({
            "id": o.id,
            "folio": o.folio,
            "status": o.status,
            "created_at": o.created_at.isoformat() if getattr(o, "created_at", None) else None,
            "provider_name": prov.business_name if prov else "Proveedor Desconocido",
            "provider_email": getattr(prov, "contact_email", None) if prov else None,
            "credit_days": getattr(prov, "credit_days", 0) if prov else 0,
            "total_estimated_amount": o.total_estimated_amount or 0,
            "items": items_formatted,
            "authorized_by": getattr(o, "authorized_by", None),
            "authorized_at": o.authorized_at.isoformat() if getattr(o, "authorized_at", None) else None,
            "invoice_folio_reported": getattr(o, "invoice_folio_reported", None),
            "invoice_folios": folios_by_po.get(o.id),
            "is_advance": getattr(o, "is_advance", False),
            "invoice_total_reported": getattr(o, "invoice_total_reported", 0.0),
            "advance_paid": advance_paid_by_po.get(o.id, 0.0),
        })
    return results


def get_purchase_planning(db: Session) -> List[dict]:
    PurchaseManager.evaluate_and_create_automatic_requisitions(db)
    reqs = purchase_repo.get_pending_requisitions(db)

    groups: dict = {}
    for req in reqs:
        prov_id = 0
        mat_sku = "S/SKU"
        mat_name = req.custom_description or "Material"
        exp_cost = 0.0

        if req.material_id:
            mat = purchase_repo.get_material_by_id(db, req.material_id)
            if mat:
                mat_sku = mat.sku
                mat_name = mat.name
                mat_cost = (
                    getattr(mat, "current_cost", getattr(mat, "standard_cost", getattr(mat, "cost", 0.0)))
                    or 0.0
                )
                exp_cost = req.expected_unit_cost if req.expected_unit_cost else mat_cost
                prov_id = req.provider_id if req.provider_id else (getattr(mat, "provider_id", 0) or 0)

        if not req.material_id:
            prov_id = req.provider_id or 0
            exp_cost = req.expected_unit_cost or 0.0

        if prov_id not in groups:
            prov_name = ""
            if prov_id > 0:
                prov = purchase_repo.get_provider_by_id(db, prov_id)
                prov_name = prov.business_name if prov else "Proveedor Desconocido"
            groups[prov_id] = {
                "provider_id": prov_id if prov_id > 0 else None,
                "provider_name": prov_name,
                "items": [],
            }

        groups[prov_id]["items"].append({
            "requisition_id": req.id,
            "material_id": req.material_id,
            "sku": mat_sku,
            "name": mat_name,
            "qty": req.requested_quantity,
            "expected_cost": exp_cost,
            "project_name": getattr(req, "project_name", None),
            "notes": req.notes,
            "original_desc": req.custom_description,
        })

    return list(groups.values())


def get_pending_tasks(db: Session) -> dict:
    PurchaseManager.evaluate_and_create_automatic_requisitions(db)
    counts = purchase_repo.get_pending_tasks_counts(db)
    return {
        "pending_requisitions": counts["pending_requisitions"],
        "orders_to_authorize": counts["orders_to_authorize"],
        "total_alerts": counts["total_alerts"],
    }


def check_invoice_folio(db: Session, po_id: int, folio: str) -> dict:
    po = purchase_repo.get_purchase_order_by_id(db, po_id)
    if not po:
        raise HTTPException(status_code=404, detail="Orden no encontrada")
    folio_clean = (folio or "").strip()
    if not folio_clean:
        return {"duplicado": False}
    coincidencias_raw = purchase_repo.check_folio_duplicate(db, po.provider_id, folio_clean)
    if not coincidencias_raw:
        return {"duplicado": False}
    coincidencias = [
        {
            "ap_id": r["id"],
            "total": float(r["total_amount"] or 0),
            "status": r["status"],
            "fecha": r["created_at"].isoformat() if r["created_at"] else None,
            "purchase_order_id": r["purchase_order_id"],
        }
        for r in coincidencias_raw
    ]
    return {"duplicado": True, "coincidencias": coincidencias}


def _item_requisition_id(item: PurchaseOrderItem) -> Optional[int]:
    return getattr(item, "requisition_id", getattr(item, "purchase_requisition_id", None))


def _recalc_po_status(db: Session, po: PurchaseOrder, po_id: int) -> None:
    all_items = purchase_repo.get_po_items(db, po_id)
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


def authorize_po(db: Session, po_id: int, current_user) -> PurchaseOrder:
    allowed_roles = ["DIRECTOR", "MANAGER"]
    if current_user.role.upper() not in allowed_roles:
        raise HTTPException(
            status_code=403,
            detail="Solo Dirección y Gerencia pueden autorizar órdenes de compra.",
        )
    po = purchase_repo.get_purchase_order_by_id(db, po_id)
    if not po:
        raise HTTPException(status_code=404)
    if not purchase_repo.get_po_items(db, po.id):
        raise HTTPException(status_code=400, detail="No se puede autorizar una orden de compra sin partidas.")
    user_id = getattr(current_user, "email", None) or getattr(current_user, "username", "USUARIO")
    po.status = "AUTORIZADA"
    po.authorized_by = user_id
    po.authorized_at = datetime.now()
    db.add(po)
    db.commit()
    db.refresh(po)
    return po


def revoke_po(db: Session, po_id: int, current_user) -> dict:
    _ = current_user
    po = purchase_repo.get_purchase_order_by_id(db, po_id)
    if not po:
        raise HTTPException(status_code=404)
    if po.status != "AUTORIZADA":
        raise HTTPException(status_code=400)
    po.status = "DRAFT"
    po.authorized_by = None
    po.authorized_at = None
    db.add(po)
    db.commit()
    return {"status": "success"}


def reject_po(db: Session, po_id: int, action: str, current_user) -> dict:
    _ = current_user
    po = purchase_repo.get_purchase_order_by_id(db, po_id)
    if not po:
        raise HTTPException(status_code=404, detail="Orden no encontrada")
    if po.status != "DRAFT":
        raise HTTPException(status_code=400, detail="Solo se pueden rechazar órdenes en Borrador")
    try:
        for item in purchase_repo.get_po_items(db, po.id):
            req_id = _item_requisition_id(item)
            if req_id:
                req = purchase_repo.get_requisition_by_id(db, req_id)
                if req:
                    if action == "RE-COTIZAR":
                        req.status = "PENDIENTE"
                        db.add(req)
                    elif action == "CANCELAR":
                        notes = req.notes or ""
                        desc = req.custom_description or ""
                        if "Valentina" in notes or "[AUTO]" in notes or desc == "REPOSICIÓN AUTOMÁTICA":
                            req.status = "APLAZADA"
                            db.add(req)
                        else:
                            db.delete(req)
            db.delete(item)
        db.flush()
        db.delete(po)
        db.commit()
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=500, detail=f"Error al rechazar la orden: {str(e)}") from e
    return {"status": "success", "message": f"Orden rechazada. Acción: {action}"}


def remove_po_item(db: Session, po_id: int, item_id: int, current_user) -> dict:
    _ = current_user
    po = purchase_repo.get_purchase_order_by_id(db, po_id)
    if not po:
        raise HTTPException(status_code=404, detail="Orden de compra no encontrada.")
    if po.status not in ["DRAFT", "RECHAZADA"]:
        raise HTTPException(status_code=400, detail="Solo se pueden modificar órdenes en Borrador.")
    po_item = purchase_repo.get_po_item_by_id(db, item_id)
    if not po_item or po_item.purchase_order_id != po.id:
        raise HTTPException(status_code=404, detail="Partida no encontrada en esta orden.")
    req_id = _item_requisition_id(po_item)
    if req_id:
        requisition = purchase_repo.get_requisition_by_id(db, req_id)
        if requisition:
            requisition.status = "PENDIENTE"
            db.add(requisition)
    db.delete(po_item)
    db.commit()
    remaining_items = purchase_repo.get_po_items(db, po.id)
    if not remaining_items:
        db.delete(po)
    else:
        po.total_estimated_amount = sum(
            (getattr(it, "quantity_ordered", 0) or 0) * (getattr(it, "expected_unit_cost", 0) or 0)
            for it in remaining_items
        )
        db.add(po)
    db.commit()
    return {"status": "success", "message": "Partida removida exitosamente."}


def dispatch_po(db: Session, po_id: int, current_user) -> dict:
    _ = current_user
    po = purchase_repo.get_purchase_order_by_id(db, po_id)
    if not po:
        raise HTTPException(status_code=404, detail="Orden no encontrada")
    if po.status != "AUTORIZADA":
        raise HTTPException(status_code=400, detail="Solo se pueden enviar órdenes Autorizadas")
    if not purchase_repo.get_po_items(db, po.id):
        raise HTTPException(status_code=400, detail="No se puede enviar una orden de compra sin partidas.")
    po.status = "ENVIADA"
    db.add(po)
    db.commit()
    return {"status": "success", "message": "Orden despachada exitosamente."}


def cancel_dispatched_po(db: Session, po_id: int, current_user) -> dict:
    _ = current_user
    po = purchase_repo.get_purchase_order_by_id(db, po_id)
    if not po:
        raise HTTPException(status_code=404)
    if po.status != "ENVIADA":
        raise HTTPException(status_code=400)
    po.status = "CANCELADA"
    for item in purchase_repo.get_po_items(db, po.id):
        req_id = _item_requisition_id(item)
        if req_id:
            req = purchase_repo.get_requisition_by_id(db, req_id)
            if req:
                req.status = "PENDIENTE"
                db.add(req)
        else:
            db.add(PurchaseRequisition(
                material_id=item.material_id,
                custom_description=item.custom_description,
                requested_quantity=item.quantity_ordered,
                status="PENDIENTE",
                notes="Rescate automático por Cancelación de OC Directa",
            ))
    db.add(po)
    db.commit()
    return {"status": "success", "message": "Orden cancelada y materiales devueltos a Planeación."}


def declare_po_satisfied(db: Session, po_id: int, current_user) -> dict:
    if current_user.role.upper() not in ["ADMIN", "MANAGER", "DIRECTOR"]:
        raise HTTPException(
            status_code=403,
            detail="Solo Administración, Gerencia o Dirección pueden declarar una OC como satisfecha.",
        )
    po = purchase_repo.get_purchase_order_by_id(db, po_id)
    if not po:
        raise HTTPException(status_code=404, detail="Orden no encontrada.")
    if po.status != "RECIBIDA_PARCIAL":
        raise HTTPException(
            status_code=400,
            detail="Solo se pueden declarar como satisfechas las OCs con entregas parciales.",
        )
    po.status = "RECIBIDA_TOTAL"
    db.add(po)
    db.commit()
    return {"status": "success", "message": f"OC {po.folio} declarada como satisfecha."}


def report_cost_discrepancy(db: Session, po_id: int, data: dict, current_user) -> dict:
    _ = current_user
    po = purchase_repo.get_purchase_order_by_id(db, po_id)
    if not po:
        raise HTTPException(status_code=404)
    po.status = "DISCREPANCIA_COSTO"
    po.invoice_folio_reported = data.get("reported_folio")
    po.invoice_total_reported = data.get("reported_total")
    db.add(po)
    db.commit()
    return {"status": "warning", "message": "Discrepancia registrada."}


def mark_item_no_more(db: Session, po_id: int, item_id: int, data: dict, current_user) -> dict:
    _ = current_user
    try:
        po = purchase_repo.get_purchase_order_by_id(db, po_id)
        if not po:
            raise HTTPException(status_code=404, detail="Orden no encontrada")
        item = purchase_repo.get_po_item_by_id(db, item_id)
        if not item or item.purchase_order_id != po_id:
            raise HTTPException(status_code=404, detail="Renglón no encontrado en esta orden")
        reason = (data.get("reason") or "").strip()
        if not reason:
            raise HTTPException(status_code=400, detail="Debe indicar un motivo")
        recibido = float(item.quantity_received or 0)
        if recibido <= 0:
            item.is_cancelled = True
            item.is_fulfilled = False
            accion = "cancelado"
        else:
            item.is_fulfilled = True
            item.is_cancelled = False
            accion = "satisfecho"
        item.cancel_reason = reason
        db.add(item)
        db.flush()
        _recalc_po_status(db, po, po_id)
        db.add(po)
        db.commit()
        return {"status": "success", "accion": accion, "po_status": po.status}
    except HTTPException:
        db.rollback()
        raise
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=500, detail=f"Error: {str(e)}") from e
