"""Purchase domain — business logic (no direct HTTP, queries via repository)."""
from datetime import datetime
from typing import List, Optional

from fastapi import HTTPException
from sqlmodel import Session

from app.models.finance import InvoiceStatus, PurchaseInvoice
from app.models.foundations import Provider
from app.models.inventory import PurchaseOrder, PurchaseOrderItem, PurchaseRequisition
from app.repositories import purchase_repository as purchase_repo
from app.schemas.finance_schema import (
    OperationalExpenseCancel,
    OperationalExpenseUpdate,
    PurchaseInvoiceUpdate,
)
from app.schemas.inventory_schema import (
    PurchaseOrderItemCancel,
    PurchaseOrderItemUpdate,
    PurchaseOrderUpdate,
    RequisitionCreate,
)
from app.schemas.treasury_schema import OperationalExpenseCreate
from app.services.purchase_manager import PurchaseManager

OVERHEAD_CATEGORIES = [
    "MATERIALES", "PLANTA", "COMUNICACIONES", "COMBUSTIBLES", "TRANSPORTE",
    "INSUMOS", "MAQUINARIA", "EXTERNOS", "MAQUILA", "OTRO",
]


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


def _resolve_role(current_user) -> str:
    role = current_user.role
    return (role.value if hasattr(role, "value") else str(role)).upper()


def _require_roles(current_user, roles: list[str]) -> None:
    if _resolve_role(current_user) not in roles:
        raise HTTPException(status_code=403, detail="Sin permisos.")


def create_requisition(db: Session, req_in: RequisitionCreate) -> PurchaseRequisition:
    if not req_in.material_id and not req_in.custom_description:
        raise HTTPException(status_code=400, detail="Debe indicar un material o una descripción.")
    requisition = PurchaseRequisition(
        material_id=req_in.material_id,
        custom_description=req_in.custom_description,
        requested_quantity=req_in.requested_quantity,
        notes=req_in.notes,
        requested_by_user_id=req_in.requested_by_user_id,
        status="PENDIENTE",
    )
    db.add(requisition)
    db.commit()
    db.refresh(requisition)
    return requisition


def cancel_requisition(db: Session, req_id: int, current_user) -> dict:
    _ = current_user
    req = purchase_repo.get_requisition_by_id(db, req_id)
    if not req:
        raise HTTPException(status_code=404, detail="Requisición no encontrada")
    if req.status == "PROCESADA":
        raise HTTPException(
            status_code=400,
            detail="No se puede cancelar una requisición ya procesada en una OC",
        )
    req.status = "CANCELADA"
    db.add(req)
    db.commit()
    db.refresh(req)
    return {"ok": True, "message": "Requisición cancelada"}


def delete_requisition(db: Session, req_id: int, current_user) -> dict:
    _ = current_user
    req = purchase_repo.get_requisition_by_id(db, req_id)
    if not req:
        raise HTTPException(status_code=404, detail="Solicitud no encontrada")
    if req.status == "PROCESADA":
        raise HTTPException(status_code=400, detail="No se puede eliminar una solicitud procesada.")
    req.status = "CANCELADA"
    db.add(req)
    db.commit()
    return {"status": "success"}


def update_requisition(db: Session, req_id: int, data: dict, current_user) -> PurchaseRequisition:
    _ = current_user
    req = purchase_repo.get_requisition_by_id(db, req_id)
    if not req:
        raise HTTPException(status_code=404, detail="Requisición no encontrada")
    if req.status in ("PROCESADA", "CANCELADA"):
        raise HTTPException(
            status_code=400,
            detail="No se puede editar una requisición procesada o cancelada",
        )
    if "material_id" in data:
        req.material_id = data["material_id"]
    if "custom_description" in data:
        req.custom_description = data["custom_description"]
    if "requested_quantity" in data:
        req.requested_quantity = float(data["requested_quantity"])
    if "notes" in data:
        req.notes = data["notes"]
    db.add(req)
    db.commit()
    db.refresh(req)
    return req


def transfer_requisition(db: Session, req_id: int, current_user) -> dict:
    _ = current_user
    req = purchase_repo.get_requisition_by_id(db, req_id)
    if not req:
        raise HTTPException(status_code=404)
    req.provider_id = None
    db.add(req)
    db.commit()
    return {"status": "success"}


def update_requisition_status(db: Session, req_id: int, status: str, current_user) -> PurchaseRequisition:
    _ = current_user
    req = purchase_repo.get_requisition_by_id(db, req_id)
    if not req:
        raise HTTPException(status_code=404, detail="Requisición no encontrada")
    req.status = status
    db.add(req)
    db.commit()
    db.refresh(req)
    return req


def assign_requisition_provider(
    db: Session, req_id: int, provider_id: int, expected_unit_cost: float, current_user
) -> dict:
    _ = current_user
    req = purchase_repo.get_requisition_by_id(db, req_id)
    if not req:
        raise HTTPException(status_code=404, detail="Requisición no encontrada")
    req.provider_id = provider_id
    req.expected_unit_cost = expected_unit_cost
    db.add(req)
    db.commit()
    db.refresh(req)
    return {"ok": True, "req_id": req_id}


def request_advance(db: Session, po_id: int, data: dict, current_user) -> dict:
    _ = current_user
    po = purchase_repo.get_purchase_order_by_id(db, po_id)
    if not po:
        raise HTTPException(status_code=404, detail="Orden no encontrada")
    if purchase_repo.get_pending_advance_invoice(db, po.folio):
        raise HTTPException(
            status_code=400,
            detail="Ya solicitaste un anticipo para esta OC. Tesorería lo está procesando.",
        )
    amount = float(data.get("amount", 0))
    if amount <= 0:
        raise HTTPException(status_code=400, detail="El monto debe ser mayor a 0")
    inv = PurchaseInvoice(
        provider_id=po.provider_id,
        invoice_number=f"ANT-{po.folio}",
        issue_date=datetime.now().date(),
        due_date=datetime.now().date(),
        total_amount=amount,
        outstanding_balance=amount,
        status=InvoiceStatus.PENDING,
    )
    db.add(inv)
    db.commit()
    return {"status": "success", "message": "Anticipo solicitado a Tesorería"}


def create_operational_expense(db: Session, data: OperationalExpenseCreate, current_user) -> dict:
    _require_roles(current_user, ["DIRECTOR", "MANAGER", "ADMIN"])
    if data.overhead_category not in OVERHEAD_CATEGORIES:
        raise HTTPException(
            status_code=400,
            detail=f"Categoría inválida. Opciones: {OVERHEAD_CATEGORIES}",
        )
    if data.total_amount <= 0:
        raise HTTPException(status_code=400, detail="El monto debe ser mayor a 0.")
    provider_id = None
    if data.provider_name:
        prov = purchase_repo.find_provider_by_name_ilike(db, data.provider_name)
        if not prov:
            prov = Provider(business_name=data.provider_name, credit_days=0, is_active=True)
            db.add(prov)
            db.flush()
        provider_id = prov.id
    folio = f"GASTO-{datetime.now().strftime('%y%m%d%H%M%S')}"
    purchase_repo.insert_operational_expense(
        db,
        provider_id=provider_id,
        folio=folio,
        total=data.total_amount,
        due_date=data.due_date,
        overhead_category=data.overhead_category,
        instance_id=data.instance_id,
        now=datetime.now(),
    )
    db.commit()
    return {"ok": True, "folio": folio, "message": "Gasto operativo registrado en CXP."}


def get_operational_expenses(
    db: Session, current_user, skip: int = 0, limit: int = 100
) -> List[dict]:
    _require_roles(current_user, ["DIRECTOR", "MANAGER", "ADMIN"])
    return purchase_repo.get_operational_expenses(db, {"skip": skip, "limit": limit})


def update_operational_expense(
    db: Session, expense_id: int, data: OperationalExpenseUpdate, current_user
) -> dict:
    _require_roles(current_user, ["DIRECTOR", "MANAGER", "ADMIN"])
    expense_row = purchase_repo.get_operational_expense_core(db, expense_id)
    if not expense_row:
        raise HTTPException(status_code=404, detail="Operational expense not found")
    if expense_row.get("status") == "CANCELADO":
        raise HTTPException(status_code=422, detail="Cannot edit a cancelled expense")
    payments_total = purchase_repo.get_operational_expense_payments_sum(db, expense_id)
    updates = data.model_dump(exclude_unset=True)
    if not updates:
        refreshed = purchase_repo.get_operational_expense_by_id(db, expense_id)
        return refreshed or expense_row
    if payments_total > 0:
        forbidden = set(updates.keys()) - {"due_date"}
        if forbidden:
            raise HTTPException(
                status_code=422,
                detail="This expense has payments applied. Only due_date can be edited.",
            )
    purchase_repo.update_operational_expense_fields(db, expense_id, updates)
    db.commit()
    refreshed = purchase_repo.get_operational_expense_by_id(db, expense_id)
    return refreshed or expense_row


def cancel_operational_expense(
    db: Session, expense_id: int, data: OperationalExpenseCancel, current_user
) -> dict:
    _require_roles(current_user, ["DIRECTOR", "MANAGER", "ADMIN"])
    expense_row = purchase_repo.get_operational_expense_core(db, expense_id)
    if not expense_row:
        raise HTTPException(status_code=404, detail="Operational expense not found")
    if expense_row.get("status") == "CANCELADO":
        raise HTTPException(status_code=422, detail="Expense is already cancelled")
    if purchase_repo.get_operational_expense_payments_sum(db, expense_id) > 0:
        raise HTTPException(
            status_code=422,
            detail="This expense has payments applied. Cannot cancel.",
        )
    existing_notes = expense_row.get("notes")
    new_notes = (
        f"{existing_notes}\nCANCELADO: {data.cancel_reason}"
        if existing_notes
        else f"CANCELADO: {data.cancel_reason}"
    )
    purchase_repo.cancel_operational_expense_row(db, expense_id, new_notes)
    db.commit()
    refreshed = purchase_repo.get_operational_expense_by_id(db, expense_id)
    return refreshed or expense_row


def update_purchase_order(
    db: Session, po_id: int, data: PurchaseOrderUpdate, current_user
) -> PurchaseOrder:
    _require_roles(current_user, ["DIRECTOR", "MANAGER", "ADMIN"])
    po = purchase_repo.get_purchase_order_by_id(db, po_id)
    if not po:
        raise HTTPException(status_code=404, detail="Orden de compra no encontrada.")
    if po.status == "CANCELADA" or "RECIBIDA_TOTAL" in po.status:
        raise HTTPException(
            status_code=422,
            detail="Purchase order cannot be edited in its current status",
        )
    if po.status == "AUTORIZADA":
        po.status = "DRAFT"
    for field, value in data.model_dump(exclude_unset=True).items():
        setattr(po, field, value)
    db.add(po)
    db.commit()
    db.refresh(po)
    return po


def update_po_item(
    db: Session, po_id: int, item_id: int, data: PurchaseOrderItemUpdate, current_user
) -> PurchaseOrderItem:
    _require_roles(current_user, ["DIRECTOR", "MANAGER", "ADMIN"])
    po = purchase_repo.get_purchase_order_by_id(db, po_id)
    if not po:
        raise HTTPException(status_code=404, detail="Orden de compra no encontrada.")
    item = purchase_repo.get_po_item_by_id(db, item_id)
    if not item or item.purchase_order_id != po_id:
        raise HTTPException(status_code=404, detail="Partida no encontrada en esta orden.")
    if item.is_cancelled:
        raise HTTPException(status_code=422, detail="Cannot edit a cancelled item")
    incoming = data.model_dump(exclude_unset=True)
    new_qty = incoming.get("quantity_ordered")
    if new_qty is not None and new_qty < (item.quantity_received or 0):
        raise HTTPException(
            status_code=422,
            detail="Cannot reduce quantity below already received amount",
        )
    if po.status == "AUTORIZADA":
        po.status = "DRAFT"
        db.add(po)
    for field, value in incoming.items():
        setattr(item, field, value)
    db.add(item)
    db.commit()
    db.refresh(item)
    return item


def cancel_po_item(
    db: Session, po_id: int, item_id: int, data: PurchaseOrderItemCancel, current_user
) -> PurchaseOrderItem:
    _require_roles(current_user, ["DIRECTOR", "MANAGER", "ADMIN"])
    po = purchase_repo.get_purchase_order_by_id(db, po_id)
    if not po:
        raise HTTPException(status_code=404, detail="Orden de compra no encontrada.")
    item = purchase_repo.get_po_item_by_id(db, item_id)
    if not item or item.purchase_order_id != po_id:
        raise HTTPException(status_code=404, detail="Partida no encontrada en esta orden.")
    if (item.quantity_received or 0) > 0:
        raise HTTPException(
            status_code=422,
            detail="Cannot cancel an item that has already been received",
        )
    item.is_cancelled = True
    item.cancel_reason = data.cancel_reason
    db.add(item)
    db.flush()
    all_items = purchase_repo.get_po_items(db, po_id)
    if all(it.is_cancelled for it in all_items):
        po.status = "CANCELADA"
        db.add(po)
    db.commit()
    db.refresh(item)
    return item


def update_purchase_invoice(
    db: Session, invoice_id: int, data: PurchaseInvoiceUpdate, current_user
) -> PurchaseInvoice:
    _require_roles(current_user, ["DIRECTOR", "MANAGER", "ADMIN"])
    invoice = purchase_repo.get_purchase_invoice_by_id(db, invoice_id)
    if not invoice:
        raise HTTPException(status_code=404, detail="Factura no encontrada.")
    updates = data.model_dump(exclude_unset=True)
    pagos_aplicados = invoice.total_amount - invoice.outstanding_balance
    if pagos_aplicados >= invoice.total_amount:
        forbidden = set(updates.keys()) - {"due_date"}
        if forbidden:
            raise HTTPException(
                status_code=422,
                detail="This invoice is fully paid. Only due_date can be edited.",
            )
    elif pagos_aplicados > 0:
        if "total_amount" in updates:
            raise HTTPException(
                status_code=422,
                detail="This invoice has partial payments. Amount cannot be edited.",
            )
    else:
        if "total_amount" in updates:
            invoice.outstanding_balance = updates["total_amount"]
    for field, value in updates.items():
        setattr(invoice, field, value)
    db.add(invoice)
    db.commit()
    db.refresh(invoice)
    return invoice
