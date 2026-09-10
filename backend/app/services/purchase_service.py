"""Purchase domain — business logic (no direct HTTP, queries via repository)."""
from datetime import datetime
from typing import List, Optional

from fastapi import HTTPException
from sqlmodel import Session

from app.models.finance import InvoiceStatus, PurchaseInvoice, SupplierPayment

AccountsPayable = SupplierPayment.AccountsPayable
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


def resolve_po_authorizer_display(db: Session, po: PurchaseOrder) -> Optional[str]:
    user = None
    approver_id = getattr(po, "approved_by_user_id", None)
    if approver_id:
        user = purchase_repo.get_user_by_id(db, approver_id)
    if not user:
        raw = getattr(po, "authorized_by", None)
        if not raw:
            return None
        raw_str = str(raw).strip()
        if raw_str.isdigit():
            user = purchase_repo.get_user_by_id(db, int(raw_str))
        if not user:
            user = purchase_repo.get_user_by_email(db, raw_str)
    if not user:
        return getattr(po, "authorized_by", None)
    name = (getattr(user, "full_name", None) or getattr(user, "email", None) or "Usuario").strip()
    role = str(getattr(user, "role", "") or "").strip()
    return f"{name} — {role}" if role else name


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
            "authorized_by": resolve_po_authorizer_display(db, o),
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
                            req.status = "CANCELADA"
                            db.add(req)
            item.is_cancelled = True
            item.cancel_reason = f"Orden rechazada. Acción: {action}"
            db.add(item)
        po.status = "CANCELADA"
        db.add(po)
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
    po_item.is_cancelled = True
    po_item.cancel_reason = "Partida removida de orden en borrador"
    db.add(po_item)
    db.commit()
    active_items = [
        it for it in purchase_repo.get_po_items(db, po.id) if not it.is_cancelled
    ]
    if not active_items:
        po.status = "CANCELADA"
        db.add(po)
    else:
        po.total_estimated_amount = sum(
            (getattr(it, "quantity_ordered", 0) or 0) * (getattr(it, "expected_unit_cost", 0) or 0)
            for it in active_items
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
    now = datetime.now()
    invoice_folio = f"ANT-{po.folio}"
    inv = PurchaseInvoice(
        provider_id=po.provider_id,
        invoice_number=invoice_folio,
        issue_date=now.date(),
        due_date=now.date(),
        total_amount=amount,
        outstanding_balance=amount,
        status=InvoiceStatus.PENDING,
        subtotal=amount,
        tax_rate=0.0,
        tax_amount=0.0,
    )
    db.add(inv)
    db.flush()
    ap = AccountsPayable(
        provider_id=po.provider_id,
        purchase_order_id=po.id,
        invoice_folio=invoice_folio,
        total_amount=amount,
        subtotal=amount,
        tax_rate=0.0,
        tax_amount=0.0,
        due_date=now,
        status="PENDIENTE",
    )
    db.add(ap)
    db.flush()
    inv.accounts_payable_id = ap.id
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


def generate_po_pdf(db: Session, po_id: int):
    from types import SimpleNamespace

    from fastapi.responses import StreamingResponse

    from app.services.pdf_generator import PDFGenerator

    po = purchase_repo.get_purchase_order_by_id(db, po_id)
    if not po:
        raise HTTPException(status_code=404, detail="Orden de Compra no encontrada")
    provider = purchase_repo.get_provider_by_id(db, po.provider_id)
    if not provider:
        raise HTTPException(status_code=404, detail="Proveedor no encontrado")

    items_with_materials = purchase_repo.get_po_items_with_materials(db, po.id)
    creator = None
    if getattr(po, "created_by_user_id", None):
        creator = purchase_repo.get_user_by_id(db, po.created_by_user_id)
    elaborado_por = "Sistema"
    if creator:
        elaborado_por = getattr(
            creator, "full_name", getattr(creator, "username", getattr(creator, "email", "Sistema"))
        )

    mock_items = []
    for row in items_with_materials:
        it = row["item"]
        mat = row["material"]
        mock_items.append(SimpleNamespace(
            material=mat,
            custom_description=it.custom_description,
            quantity_ordered=it.quantity_ordered,
            expected_unit_cost=it.expected_unit_cost,
            sku=getattr(it, "sku", None),
        ))

    mock_po = SimpleNamespace(
        folio=po.folio,
        created_at=po.created_at,
        authorized_by=getattr(po, "authorized_by", None),
        created_by=elaborado_por,
        items=mock_items,
    )
    config = purchase_repo.get_global_config(db)
    pdf_buffer = PDFGenerator().generate_po_pdf(order=mock_po, provider=provider, config=config)
    filename = f"OC_{po.folio}.pdf"
    return StreamingResponse(
        pdf_buffer,
        media_type="application/pdf",
        headers={"Content-Disposition": f'inline; filename="{filename}"'},
    )


def receive_purchase_order(db: Session, po_id: int, data: dict, current_user):
    from datetime import timedelta

    from app.models.finance import InvoiceStatus, PaymentStatus, PurchaseInvoice, PurchaseInvoiceItem

    _ = current_user
    po = purchase_repo.get_purchase_order_by_id(db, po_id)
    if not po:
        raise HTTPException(status_code=404, detail="Orden no encontrada")

    po.status = "RECIBIDA_PARCIAL"
    po.invoice_folio_reported = data.get("invoice_folio")
    po.invoice_total_reported = data.get("invoice_total")
    po.is_advance = False

    received_map: dict = {}
    edited_by_sku: dict = {}
    edited_by_item_id: dict = {}
    received_by_item_id: dict = {}
    for ri in (data.get("received_items") or []):
        _sku = ri.get("sku", "")
        _item_id = ri.get("item_id")
        _rq = ri.get("received_qty")
        if _rq is None:
            _rq = ri.get("expected_qty") or 0
        received_map[_sku] = received_map.get(_sku, 0) + float(_rq)
        _edit_data = {
            "sku": ri.get("sku"),
            "description": ri.get("description"),
            "unit_cost": ri.get("unit_cost"),
        }
        if _item_id:
            edited_by_item_id[int(_item_id)] = _edit_data
            received_by_item_id[int(_item_id)] = float(_rq)
        else:
            edited_by_sku[_sku] = _edit_data

    for ri in (data.get("received_items") or []):
        if not ri.get("is_new"):
            continue
        _new_mat_id = ri.get("material_id")
        if not _new_mat_id:
            continue
        if purchase_repo.get_po_item_by_po_and_material(db, po.id, _new_mat_id):
            continue
        _new_cost = ri.get("unit_cost")
        db.add(PurchaseOrderItem(
            purchase_order_id=po.id,
            material_id=_new_mat_id,
            quantity_ordered=0,
            quantity_received=0,
            expected_unit_cost=float(_new_cost) if _new_cost is not None else 0.0,
        ))
    db.flush()

    items_with_materials = purchase_repo.get_po_items_with_materials(db, po.id)
    all_complete = True
    invoice_detail_rows: list = []
    for row in items_with_materials:
        item = row["item"]
        mat = row["material"]
        qty_ordered = float(item.quantity_ordered or 0)
        qty_this_delivery = 0.0

        if item.material_id:
            mat = purchase_repo.get_material_by_id(db, item.material_id)
            if mat:
                mat_sku = mat.sku or ""
                route = (getattr(mat, "production_route", "MATERIAL") or "MATERIAL").upper()
                if item.id in received_by_item_id:
                    qty_this_delivery = received_by_item_id[item.id]
                else:
                    qty_this_delivery = received_map.get(mat_sku, 0)
                if route == "MATERIAL" and qty_this_delivery > 0:
                    factor = float(getattr(mat, "conversion_factor", 1) or 1)
                    qty_in_usage_units = qty_this_delivery * factor
                    _edited = edited_by_item_id.get(item.id) or edited_by_sku.get(mat_sku, {})
                    _edited_cost = _edited.get("unit_cost")
                    _costo_kardex = (
                        float(_edited_cost) if _edited_cost is not None
                        else float(getattr(item, "expected_unit_cost", 0.0) or 0.0)
                    )
                    from app.services import inventory_service

                    inventory_service.register_movement(
                        db,
                        mat.id,
                        "PURCHASE_ENTRY",
                        qty_in_usage_units,
                        unit_cost=_costo_kardex,
                        reason="RECEPCION_OC",
                        commit=False,
                    )
        else:
            if item.id in received_by_item_id:
                qty_this_delivery = received_by_item_id[item.id]
            else:
                qty_this_delivery = received_map.get(item.custom_description or "", 0)

        prev_received = float(item.quantity_received or 0)
        item.quantity_received = prev_received + qty_this_delivery
        db.add(item)

        if qty_this_delivery > 0:
            _base_sku = mat.sku if (item.material_id and mat) else None
            _edited = edited_by_item_id.get(item.id) or edited_by_sku.get(_base_sku or "", {})
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
                _final_cost = float(getattr(item, "expected_unit_cost", 0.0) or 0.0)
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

        if qty_ordered > 0 and item.quantity_received < qty_ordered:
            all_complete = False

    po.status = "RECIBIDA_TOTAL" if all_complete else "RECIBIDA_PARCIAL"

    ant_invoices = purchase_repo.get_advance_invoices_by_folio_pattern(db, f"ANT-{po.folio}")
    total_pagado_anticipos = 0.0
    paid_status = getattr(PaymentStatus, "PAID", "PAID")
    for ant in ant_invoices:
        total_pagado_anticipos += purchase_repo.sum_supplier_payments_by_invoice(
            db, ant.id, paid_status
        )
        ant.status = getattr(InvoiceStatus, "PAID", "PAID")
        ant.outstanding_balance = 0
        db.add(ant)

    tax_rate = float(data.get("tax_rate", 0.16) or 0.16)
    _subtotal_detalle = sum(r["quantity_received"] * r["unit_cost"] for r in invoice_detail_rows)
    if _subtotal_detalle > 0:
        total_recibido_con_iva = round(_subtotal_detalle * (1 + tax_rate), 2)
    else:
        total_recibido_con_iva = float(data.get("invoice_total", 0))
    saldo_restante = total_recibido_con_iva - total_pagado_anticipos

    if saldo_restante > 0.01:
        invoice_folio = data.get("invoice_folio")
        if invoice_folio:
            if purchase_repo.find_ap_by_po_folio(db, po.provider_id, invoice_folio, po_id):
                raise HTTPException(
                    status_code=400,
                    detail=f"La factura {invoice_folio} ya está registrada para esta OC.",
                )
        prov = purchase_repo.get_provider_by_id(db, po.provider_id)
        credit_days = getattr(prov, "credit_days", 0) or 0 if prov else 0
        due_date = datetime.now() + timedelta(days=credit_days)
        tax_rate = float(data.get("tax_rate", 0.16) or 0.16)
        _subtotal = round(saldo_restante / (1 + tax_rate), 2) if (1 + tax_rate) != 0 else saldo_restante
        _tax_amount = round(saldo_restante - _subtotal, 2)
        new_ap_id = purchase_repo.insert_reception_accounts_payable(
            db,
            provider_id=po.provider_id,
            po_id=po.id,
            folio=data.get("invoice_folio"),
            total=saldo_restante,
            subtotal=_subtotal,
            tax_rate=tax_rate,
            tax_amount=_tax_amount,
            due_date=due_date,
            now=datetime.now(),
            overhead_category=getattr(po, "overhead_category", None),
        )
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
    else:
        invoice_folio = data.get("invoice_folio")
        invoice_total = (
            total_recibido_con_iva if total_recibido_con_iva > 0 else float(data.get("invoice_total", 0))
        )
        if invoice_folio and invoice_total > 0:
            if purchase_repo.find_purchase_invoice_by_number_and_provider(
                db, invoice_folio, po.provider_id
            ):
                raise HTTPException(
                    status_code=400,
                    detail=f"La factura {invoice_folio} ya está registrada para este proveedor.",
                )
            tax_rate = float(data.get("tax_rate", 0.16) or 0.16)
            _subtotal = round(invoice_total / (1 + tax_rate), 2)
            _tax_amount = round(invoice_total - _subtotal, 2)
            db.add(PurchaseInvoice(
                provider_id=po.provider_id,
                invoice_number=invoice_folio,
                issue_date=datetime.now().date(),
                due_date=datetime.now().date(),
                total_amount=invoice_total,
                outstanding_balance=0.0,
                status=getattr(InvoiceStatus, "PAID", "PAID"),
                subtotal=_subtotal,
                tax_rate=tax_rate,
                tax_amount=_tax_amount,
            ))

    for _item_id in (data.get("items_to_close") or []):
        _it = purchase_repo.get_po_item_by_id(db, _item_id)
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

    _hay_pendiente = False
    _hay_recibido = False
    for _it in purchase_repo.get_po_items(db, po_id):
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
