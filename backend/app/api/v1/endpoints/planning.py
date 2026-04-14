"""
planning.py  –  Endpoints del Módulo de Planeación Estratégica: Matriz de 4 Carriles

Rutas:
  GET  /planning/calendar              → Feed de píldoras para el Calendario Maestro
  GET  /planning/instances/health      → Panel de Salud agrupado por semáforo
  PATCH /planning/instances/{id}       → Editar custom_name y fechas programadas
  PATCH /planning/instances/{id}/reschedule → Drag & Drop con recálculo proporcional
  POST /planning/instances/{id}/close  → Evento Maestro: Doble Verde 🟢🟢
  POST /planning/instances/{id}/reopen-warranty → Reabrir como Garantía ⚠️
  PATCH /planning/orders/{order_id}/baptize → Bautizo masivo de instancias (custom_names)
"""
from datetime import datetime
from typing import Optional, List, Any

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlmodel import Session, select
from sqlalchemy.orm import selectinload

from app.core.database import get_session
from app.core.deps import get_current_active_user
from app.models.users import User
from app.models.sales import (
    SalesOrderItemInstance, SalesOrderItem, SalesOrder,
    InstanceStatus, SalesOrderStatus,
)
from app.services.planning_service import (
    compute_semaphore, compute_semaphore_label,
    trigger_double_green, reopen_as_warranty,
    recalculate_dates_proportionally, LANE_CODES,
)

router = APIRouter()


# ============================================================
# SCHEMAS
# ============================================================

class InstanceScheduleUpdate(BaseModel):
    custom_name: Optional[str] = None
    scheduled_prod_mdf: Optional[datetime] = None
    scheduled_prod_stone: Optional[datetime] = None
    scheduled_inst_mdf: Optional[datetime] = None
    scheduled_inst_stone: Optional[datetime] = None


class ReschedulePayload(BaseModel):
    """Payload para el Drag & Drop del calendario."""
    field: str          # 'scheduled_prod_mdf' | 'scheduled_prod_stone' | ...
    new_date: datetime
    proportional: bool = True   # True = recalcular cadena; False = solo mover esa píldora


class CloseInstancePayload(BaseModel):
    signed_at: Optional[datetime] = None  # Si no se envía, usa datetime.utcnow()


class BaptismEntry(BaseModel):
    instance_id: int
    custom_name: str


class BaptismPayload(BaseModel):
    instances: List[BaptismEntry]


# ============================================================
# HELPERS
# ============================================================

def _serialize_instance(inst: SalesOrderItemInstance, now: datetime, session: Optional[Session] = None) -> dict:
    """Serializa una instancia con semáforo calculado.
    Si se provee `session`, enriquece con product_name y order_folio del padre."""
    semaphore = compute_semaphore(inst, now)
    schedule = {
        "PM": inst.scheduled_prod_mdf.isoformat() if inst.scheduled_prod_mdf else None,
        "PP": inst.scheduled_prod_stone.isoformat() if inst.scheduled_prod_stone else None,
        "IM": inst.scheduled_inst_mdf.isoformat() if inst.scheduled_inst_mdf else None,
        "IP": inst.scheduled_inst_stone.isoformat() if inst.scheduled_inst_stone else None,
    }

    # Enrich with parent item / order data when session is available
    product_name: Optional[str] = None
    order_folio:  Optional[str] = None
    if session:
        item = session.get(SalesOrderItem, inst.sales_order_item_id)
        if item:
            product_name = item.product_name
            order = session.get(SalesOrder, item.sales_order_id)
            if order:
                order_folio = f"OV-{str(order.id).zfill(4)}"

    return {
        "id": inst.id,
        "custom_name": inst.custom_name,
        "product_name": product_name,
        "order_folio": order_folio,
        "production_status": inst.production_status,
        "semaphore": semaphore,
        "semaphore_label": compute_semaphore_label(semaphore),
        "schedule": schedule,
        "sales_order_item_id": inst.sales_order_item_id,
        "delivery_deadline": inst.delivery_deadline.isoformat() if inst.delivery_deadline else None,
        "signed_received_at": inst.signed_received_at.isoformat() if inst.signed_received_at else None,
        "warranty_started_at": inst.warranty_started_at.isoformat() if inst.warranty_started_at else None,
        "is_warranty_reopened": inst.is_warranty_reopened,
        "warranty_reopened_at": inst.warranty_reopened_at.isoformat() if inst.warranty_reopened_at else None,
        "original_signed_at": inst.original_signed_at.isoformat() if inst.original_signed_at else None,
        "is_cancelled": inst.is_cancelled,
    }


def _get_instance_or_404(instance_id: int, session: Session) -> SalesOrderItemInstance:
    inst = session.get(SalesOrderItemInstance, instance_id)
    if not inst:
        raise HTTPException(status_code=404, detail=f"Instancia {instance_id} no encontrada.")
    return inst


# ============================================================
# 1. FEED CALENDARIO MAESTRO
# ============================================================

@router.get("/calendar")
def get_calendar_feed(
    year: int,
    month: int,
    session: Session = Depends(get_session),
    current_user: User = Depends(get_current_active_user),
) -> Any:
    """
    Retorna todas las píldoras (eventos programados) para un mes dado.
    Cada píldora incluye: qué carril, qué instancia, fecha, semáforo.
    """
    # Construir rango del mes
    from calendar import monthrange
    _, days_in_month = monthrange(year, month)
    month_start = datetime(year, month, 1)
    month_end = datetime(year, month, days_in_month, 23, 59, 59)

    now = datetime.utcnow()

    # Buscar todas las instancias que tengan al menos una fecha en el mes
    stmt = select(SalesOrderItemInstance).where(
        SalesOrderItemInstance.is_cancelled == False
    ).where(
        (
            (SalesOrderItemInstance.scheduled_prod_mdf >= month_start) &
            (SalesOrderItemInstance.scheduled_prod_mdf <= month_end)
        ) | (
            (SalesOrderItemInstance.scheduled_prod_stone >= month_start) &
            (SalesOrderItemInstance.scheduled_prod_stone <= month_end)
        ) | (
            (SalesOrderItemInstance.scheduled_inst_mdf >= month_start) &
            (SalesOrderItemInstance.scheduled_inst_mdf <= month_end)
        ) | (
            (SalesOrderItemInstance.scheduled_inst_stone >= month_start) &
            (SalesOrderItemInstance.scheduled_inst_stone <= month_end)
        )
    )
    instances = session.exec(stmt).all()

    # Construir píldoras por día
    pills_by_day: dict = {}
    field_map = {
        "scheduled_prod_mdf":   "PM",
        "scheduled_prod_stone": "PP",
        "scheduled_inst_mdf":   "IM",
        "scheduled_inst_stone": "IP",
    }

    for inst in instances:
        semaphore = compute_semaphore(inst, now)
        for field, code in field_map.items():
            dt: Optional[datetime] = getattr(inst, field)
            if dt is None:
                continue
            if not (month_start <= dt <= month_end):
                continue
            day_key = dt.strftime("%Y-%m-%d")
            if day_key not in pills_by_day:
                pills_by_day[day_key] = []
            pills_by_day[day_key].append({
                "instance_id": inst.id,
                "custom_name": inst.custom_name,
                "lane": code,
                "lane_label": f"{code} {inst.custom_name}",
                "datetime": dt.isoformat(),
                "semaphore": semaphore,
                "semaphore_label": compute_semaphore_label(semaphore),
                "production_status": inst.production_status,
                "sales_order_item_id": inst.sales_order_item_id,
                "is_warranty_reopened": inst.is_warranty_reopened,
            })

    return {
        "year": year,
        "month": month,
        "total_pills": sum(len(v) for v in pills_by_day.values()),
        "calendar": pills_by_day,
    }


# ============================================================
# 2. PANEL DE SALUD (Semáforo preventivo)
# ============================================================

@router.get("/instances/health")
def get_health_panel(
    session: Session = Depends(get_session),
    current_user: User = Depends(get_current_active_user),
) -> Any:
    """
    Agrupa todas las instancias activas por color de semáforo.
    Usado por el Panel Lateral de Salud con sus 3 pestañas: 🔴 🟡 🔘
    """
    now = datetime.utcnow()

    stmt = select(SalesOrderItemInstance).where(
        SalesOrderItemInstance.is_cancelled == False
    ).where(
        SalesOrderItemInstance.production_status.notin_([
            InstanceStatus.CLOSED,
        ])
    )
    instances = session.exec(stmt).all()

    groups: dict = {
        "RED": [],
        "YELLOW": [],
        "GRAY": [],
        "BLUE": [],
        "BLUE_GREEN": [],
        "DOUBLE_BLUE": [],
        "GREEN": [],
        "WARRANTY": [],
    }

    for inst in instances:
        color = compute_semaphore(inst, now)
        if color in groups:
            groups[color].append(_serialize_instance(inst, now, session))

    return {
        "timestamp": now.isoformat(),
        "counts": {k: len(v) for k, v in groups.items()},
        "critical": groups["RED"],
        "alerts": groups["YELLOW"],
        "planned": groups["GRAY"],
        "in_process": groups["BLUE"],
        "ready_to_install": groups["BLUE_GREEN"],
        "in_transit": groups["DOUBLE_BLUE"],
        "installed": groups["GREEN"],
        "warranty": groups["WARRANTY"],
    }


# ============================================================
# 3. EDITAR INSTANCIA (custom_name + fechas)
# ============================================================

@router.patch("/instances/{instance_id}")
def update_instance_schedule(
    instance_id: int,
    payload: InstanceScheduleUpdate,
    session: Session = Depends(get_session),
    current_user: User = Depends(get_current_active_user),
) -> Any:
    inst = _get_instance_or_404(instance_id, session)

    if payload.custom_name is not None:
        inst.custom_name = payload.custom_name
    if payload.scheduled_prod_mdf is not None:
        inst.scheduled_prod_mdf = payload.scheduled_prod_mdf
    if payload.scheduled_prod_stone is not None:
        inst.scheduled_prod_stone = payload.scheduled_prod_stone
    if payload.scheduled_inst_mdf is not None:
        inst.scheduled_inst_mdf = payload.scheduled_inst_mdf
    if payload.scheduled_inst_stone is not None:
        inst.scheduled_inst_stone = payload.scheduled_inst_stone

    session.add(inst)
    session.commit()
    session.refresh(inst)

    now = datetime.utcnow()
    return _serialize_instance(inst, now, session)


# ============================================================
# 4. DRAG & DROP — REPROGRAMAR PÍLDORA
# ============================================================

@router.patch("/instances/{instance_id}/reschedule")
def reschedule_pill(
    instance_id: int,
    payload: ReschedulePayload,
    session: Session = Depends(get_session),
    current_user: User = Depends(get_current_active_user),
) -> Any:
    """
    Mueve una píldora a un nuevo día.
    Si proportional=True, recalcula proporcionalmente las fechas siguientes de la cadena.
    Si proportional=False, sólo mueve esa píldora (Horas Extra).
    """
    valid_fields = set(LANE_CODES.keys())
    if payload.field not in valid_fields:
        raise HTTPException(
            status_code=400,
            detail=f"Campo inválido '{payload.field}'. Válidos: {sorted(valid_fields)}"
        )

    inst = _get_instance_or_404(instance_id, session)

    if payload.proportional:
        updates = recalculate_dates_proportionally(inst, payload.field, payload.new_date)
    else:
        updates = {payload.field: payload.new_date}

    for field, value in updates.items():
        setattr(inst, field, value)

    session.add(inst)
    session.commit()
    session.refresh(inst)

    now = datetime.utcnow()
    return {
        "updated_fields": list(updates.keys()),
        "instance": _serialize_instance(inst, now, session),
    }


# ============================================================
# 5. EVENTO MAESTRO: DOBLE VERDE 🟢🟢
# ============================================================

@router.post("/instances/{instance_id}/close")
def close_instance(
    instance_id: int,
    payload: CloseInstancePayload,
    session: Session = Depends(get_session),
    current_user: User = Depends(get_current_active_user),
) -> Any:
    inst = _get_instance_or_404(instance_id, session)

    if inst.production_status != InstanceStatus.INSTALLED:
        raise HTTPException(
            status_code=400,
            detail=(
                f"Solo se puede cerrar una instancia en estado INSTALLED (🟢). "
                f"Estatus actual: {inst.production_status}"
            )
        )

    result = trigger_double_green(inst, session, signed_at=payload.signed_at)
    session.commit()

    return result


# ============================================================
# 6. REABRIR COMO GARANTÍA ⚠️
# ============================================================

@router.post("/instances/{instance_id}/reopen-warranty")
def reopen_warranty(
    instance_id: int,
    session: Session = Depends(get_session),
    current_user: User = Depends(get_current_active_user),
) -> Any:
    inst = _get_instance_or_404(instance_id, session)

    try:
        result = reopen_as_warranty(inst, session)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))

    session.commit()
    return result


# ============================================================
# 7. BAUTIZO MASIVO (asignar custom_names tras confirmar OV)
# ============================================================

@router.patch("/orders/{order_id}/baptize")
def baptize_instances(
    order_id: int,
    payload: BaptismPayload,
    session: Session = Depends(get_session),
    current_user: User = Depends(get_current_active_user),
) -> Any:
    """
    Permite asignar aliases (custom_names) a todas las instancias de una OV
    en un único request. Usado en la pantalla de 'Configuración de Instancias'
    que aparece al confirmar una Orden de Venta.
    """
    order = session.get(SalesOrder, order_id)
    if not order:
        raise HTTPException(status_code=404, detail=f"Orden de Venta {order_id} no encontrada.")

    # Validar que todas las instancias pertenecen a esta OV
    instance_ids = [e.instance_id for e in payload.instances]
    stmt = (
        select(SalesOrderItemInstance)
        .join(SalesOrderItem,
              SalesOrderItemInstance.sales_order_item_id == SalesOrderItem.id)
        .where(SalesOrderItem.sales_order_id == order_id)
        .where(SalesOrderItemInstance.id.in_(instance_ids))
    )
    db_instances = {inst.id: inst for inst in session.exec(stmt).all()}

    not_found = [iid for iid in instance_ids if iid not in db_instances]
    if not_found:
        raise HTTPException(
            status_code=400,
            detail=f"Las siguientes instancias no pertenecen a la OV {order_id}: {not_found}"
        )

    updated = []
    for entry in payload.instances:
        inst = db_instances[entry.instance_id]
        inst.custom_name = entry.custom_name.strip()
        session.add(inst)
        updated.append({"id": inst.id, "custom_name": inst.custom_name})

    session.commit()

    return {
        "order_id": order_id,
        "baptized_count": len(updated),
        "instances": updated,
    }
