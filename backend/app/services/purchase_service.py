"""Purchase domain — business logic (no direct HTTP, queries via repository)."""
from typing import List, Optional

from fastapi import HTTPException
from sqlmodel import Session

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
