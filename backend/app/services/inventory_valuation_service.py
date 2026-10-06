"""Inventory valuation in three buckets (all assets): raw materials, work in progress, finished goods.

- Raw materials: warehouse stock × cost per usage unit.
- Work in progress: consumed recipe material of instances whose batch is in production.
- Finished goods: consumed material of instances in packing or ready to install.
Truck load moves the material to cost of sales (reported separately, not an asset).
"""
from datetime import datetime
from typing import Optional

from fastapi import HTTPException
from sqlmodel import Session

from app.models.material import Material
from app.models.production import ProductionBatchStatus
from app.models.sales import InstanceStatus
from app.repositories import production_inventory_repository as prod_inv_repo
from app.services import inventory_service

VALUATION_ROLES = {"DIRECTOR", "MANAGER", "ADMIN"}
WORK_IN_PROGRESS = "WORK_IN_PROGRESS"
FINISHED_GOODS = "FINISHED_GOODS"
FINISHED_BATCH_STATUSES = {
    ProductionBatchStatus.PACKING,
    ProductionBatchStatus.READY_TO_INSTALL,
    ProductionBatchStatus.FINISHED,
    ProductionBatchStatus.DEAD,
}


def _assert_roles(user) -> None:
    role = user.role.value if hasattr(user.role, "value") else str(user.role)
    if role.upper() not in VALUATION_ROLES:
        raise HTTPException(status_code=403, detail="Solo Dirección, Gerencia y Administración ven la valuación.")


def _material_line(material: Material) -> dict:
    cost = inventory_service.usage_unit_cost(material)
    stock = float(material.physical_stock or 0.0)
    return {
        "material_id": material.id,
        "sku": material.sku,
        "name": material.name,
        "usage_unit": material.usage_unit,
        "stock": stock,
        "usage_unit_cost": round(cost, 6),
        "value": round(stock * cost, 2),
    }


def _bucket(instance_status, batch_status) -> str:
    if instance_status == InstanceStatus.READY or batch_status in FINISHED_BATCH_STATUSES:
        return FINISHED_GOODS
    return WORK_IN_PROGRESS


def _reservation_value(reservation) -> float:
    return float(reservation.quantity_reserved or 0.0) * float(reservation.consumed_unit_cost or 0.0)


def _in_process_lines(session: Session) -> dict[str, list[dict]]:
    grouped: dict[tuple[str, int, int], dict] = {}
    for reservation, instance, batch in prod_inv_repo.get_open_consumed_rows(session):
        bucket = _bucket(instance.production_status, batch.status)
        key = (bucket, instance.id, batch.id)
        line = grouped.setdefault(key, {
            "instance_id": instance.id,
            "instance_name": instance.custom_name,
            "batch_folio": batch.folio,
            "value": 0.0,
        })
        line["value"] += _reservation_value(reservation)
    lines: dict[str, list[dict]] = {WORK_IN_PROGRESS: [], FINISHED_GOODS: []}
    for (bucket, _, _), line in sorted(grouped.items(), key=lambda item: item[1]["instance_name"]):
        line["value"] = round(line["value"], 2)
        lines[bucket].append(line)
    return lines


def get_valuation_summary(
    session: Session, user, date_from: Optional[datetime] = None, date_to: Optional[datetime] = None
) -> dict:
    _assert_roles(user)
    raw_lines = [_material_line(m) for m in prod_inv_repo.get_positive_stock_materials(session)]
    in_process = _in_process_lines(session)
    raw_total = round(sum(line["value"] for line in raw_lines), 2)
    wip_total = round(sum(line["value"] for line in in_process[WORK_IN_PROGRESS]), 2)
    finished_total = round(sum(line["value"] for line in in_process[FINISHED_GOODS]), 2)
    cogs = prod_inv_repo.get_reservations_in_range(session, "cogs_at", date_from, date_to)
    reversed_rows = prod_inv_repo.get_reservations_in_range(session, "reversed_at", date_from, date_to)
    waste = [r for r in reversed_rows if r.reversal_disposition == "WASTE"]
    return {
        "raw_materials": raw_total,
        "work_in_progress": wip_total,
        "finished_goods": finished_total,
        "total": round(raw_total + wip_total + finished_total, 2),
        "cost_of_sales": round(sum(_reservation_value(r) for r in cogs), 2),
        "waste": round(sum(_reservation_value(r) for r in waste), 2),
        "negative_stock_materials": len(prod_inv_repo.get_negative_stock_materials(session)),
        "raw_material_lines": raw_lines,
        "work_in_progress_lines": in_process[WORK_IN_PROGRESS],
        "finished_goods_lines": in_process[FINISHED_GOODS],
    }


def get_negative_stock_report(session: Session, user) -> dict:
    _assert_roles(user)
    authorizations = [
        {
            "id": auth.id,
            "batch_folio": folio,
            "authorized_by": user_name,
            "reason": auth.reason,
            "shortages": auth.shortages or [],
            "created_at": auth.created_at,
        }
        for auth, user_name, folio in prod_inv_repo.get_stock_authorizations(session)
    ]
    return {
        "materials": [_material_line(m) for m in prod_inv_repo.get_negative_stock_materials(session)],
        "authorizations": authorizations,
    }
