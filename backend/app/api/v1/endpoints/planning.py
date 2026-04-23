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
from datetime import datetime, date
from typing import Optional, List, Any, Union

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlmodel import Session, select
from sqlalchemy.orm import selectinload

from app.core.database import get_session
from app.core.deps import get_current_active_user
from app.models.users import User, UserRole
from app.models.production import (
    InstallationAssignment,
    InstallationAssignmentStatus,
)
from app.models.sales import (
    SalesOrderItemInstance, SalesOrderItem, SalesOrder,
    InstanceStatus, SalesOrderStatus,
)
from app.models.foundations import Client
from app.models.design import ProductMaster, ProductVersion
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
    model_config = {"populate_by_name": True}

    custom_name: Optional[str] = None
    scheduled_prod_mdf: Union[datetime, None] = None
    scheduled_prod_stone: Union[datetime, None] = None
    scheduled_inst_mdf: Union[datetime, None] = None
    scheduled_inst_stone: Union[datetime, None] = None

    # Campos explícitos para indicar "borrar esta fecha"
    clear_prod_mdf: bool = False
    clear_prod_stone: bool = False
    clear_inst_mdf: bool = False
    clear_inst_stone: bool = False


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


class AssignTeamPayload(BaseModel):
    leader_user_id: int
    helper_1_user_id: Optional[int] = None
    helper_2_user_id: Optional[int] = None
    assignment_date: date  # Fecha de la jornada de instalación
    lane: str = "IM"  # "IM" o "IP"


# ============================================================
# HELPERS
# ============================================================

def _serialize_instance(inst: SalesOrderItemInstance, now: datetime, session: Optional[Session] = None) -> dict:
    """Serializa una instancia con semáforo calculado.
    Si se provee `session`, enriquece con product_name y order_folio del padre."""
    semaphore = compute_semaphore(inst, now, session=session)
    schedule = {
        "PM": inst.scheduled_prod_mdf.isoformat() if inst.scheduled_prod_mdf else None,
        "PP": inst.scheduled_prod_stone.isoformat() if inst.scheduled_prod_stone else None,
        "IM": inst.scheduled_inst_mdf.isoformat() if inst.scheduled_inst_mdf else None,
        "IP": inst.scheduled_inst_stone.isoformat() if inst.scheduled_inst_stone else None,
    }

    # Enrich with parent item / order / client / product category when session is available
    product_name:     Optional[str] = None
    product_category: Optional[str] = None
    order_folio:      Optional[str] = None
    client_name:      Optional[str] = None
    project_name:     Optional[str] = None
    if session:
        item = session.get(SalesOrderItem, inst.sales_order_item_id)
        if item:
            product_name = item.product_name
            # Walk version → master to get category from design_product_masters
            if item.origin_version_id:
                version = session.get(ProductVersion, item.origin_version_id)
                if version:
                    master = session.get(ProductMaster, version.master_id)
                    if master:
                        product_category = master.category
            order = session.get(SalesOrder, item.sales_order_id)
            if order:
                order_folio  = f"OV-{str(order.id).zfill(4)}"
                project_name = order.project_name
                if order.client_id:
                    client = session.get(Client, order.client_id)
                    if client:
                        client_name = client.full_name

    return {
        "id": inst.id,
        "custom_name": inst.custom_name,
        "product_name": product_name,
        "product_category": product_category,
        "order_folio": order_folio,
        "client_name": client_name,
        "project_name": project_name,
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

    # ── Bulk category lookup: 3 queries instead of N×3 ──────────────────────
    # Chain: SalesOrderItem.origin_version_id → ProductVersion → ProductMaster.category
    item_ids = list({inst.sales_order_item_id for inst in instances})
    category_by_item: dict = {}
    if item_ids:
        items_q = session.exec(
            select(SalesOrderItem).where(SalesOrderItem.id.in_(item_ids))
        ).all()
        version_ids = [it.origin_version_id for it in items_q if it.origin_version_id]
        versions_map: dict = {}
        if version_ids:
            versions_map = {
                v.id: v for v in session.exec(
                    select(ProductVersion).where(ProductVersion.id.in_(version_ids))
                ).all()
            }
        master_ids = list({v.master_id for v in versions_map.values()})
        masters_map: dict = {}
        if master_ids:
            masters_map = {
                m.id: m for m in session.exec(
                    select(ProductMaster).where(ProductMaster.id.in_(master_ids))
                ).all()
            }
        for it in items_q:
            cat = None
            if it.origin_version_id:
                ver = versions_map.get(it.origin_version_id)
                if ver:
                    mst = masters_map.get(ver.master_id)
                    if mst:
                        cat = mst.category
            category_by_item[it.id] = cat
    # ────────────────────────────────────────────────────────────────────────

    # Construir píldoras por día
    pills_by_day: dict = {}
    field_map = {
        "scheduled_prod_mdf":   "PM",
        "scheduled_prod_stone": "PP",
        "scheduled_inst_mdf":   "IM",
        "scheduled_inst_stone": "IP",
    }

    for inst in instances:
        semaphore = compute_semaphore(inst, now, session=session)
        product_category = category_by_item.get(inst.sales_order_item_id)
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
                "product_category": product_category,
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
        color = compute_semaphore(inst, now, session=session)
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

    # Prod MDF
    if payload.clear_prod_mdf:
        inst.scheduled_prod_mdf = None
    elif payload.scheduled_prod_mdf is not None:
        inst.scheduled_prod_mdf = payload.scheduled_prod_mdf

    # Prod Stone
    if payload.clear_prod_stone:
        inst.scheduled_prod_stone = None
    elif payload.scheduled_prod_stone is not None:
        inst.scheduled_prod_stone = payload.scheduled_prod_stone

    # Inst MDF
    if payload.clear_inst_mdf:
        inst.scheduled_inst_mdf = None
    elif payload.scheduled_inst_mdf is not None:
        inst.scheduled_inst_mdf = payload.scheduled_inst_mdf

    # Inst Stone
    if payload.clear_inst_stone:
        inst.scheduled_inst_stone = None
    elif payload.scheduled_inst_stone is not None:
        inst.scheduled_inst_stone = payload.scheduled_inst_stone

    # Validación de orden lógico: IM y IP no pueden ser anteriores a PM.
    # Mismo día es válido (comparación >=).
    if inst.scheduled_inst_mdf and inst.scheduled_prod_mdf:
        if inst.scheduled_inst_mdf < inst.scheduled_prod_mdf:
            raise HTTPException(
                status_code=400,
                detail="IM no puede ser anterior a PM. No se puede instalar MDF antes de producir MDF.",
            )
    if inst.scheduled_inst_stone and inst.scheduled_prod_mdf:
        if inst.scheduled_inst_stone < inst.scheduled_prod_mdf:
            raise HTTPException(
                status_code=400,
                detail="IP no puede ser anterior a PM. No se puede instalar Piedra antes de producir MDF.",
            )

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


# ============================================================
# 8. ASIGNAR / REASIGNAR EQUIPO INSTALADOR (IM/IP)
# ============================================================

@router.post("/instances/{instance_id}/assign-team")
def assign_installation_team(
    instance_id: int,
    payload: AssignTeamPayload,
    session: Session = Depends(get_session),
    current_user: User = Depends(get_current_active_user),
) -> Any:
    """
    (DIRECTOR / GERENCIA / DESIGN)
    Asigna o reasigna el equipo instalador a un evento IM/IP del calendario.
    Solo guarda la asignación provisional — NO cambia el status de la instancia
    ni genera nómina. El equipo puede reasignarse hasta el momento del escaneo QR.
    """
    # Permisos
    allowed = {UserRole.DIRECTOR, UserRole.GERENCIA, UserRole.DESIGN}
    if current_user.role not in allowed:
        raise HTTPException(
            status_code=403,
            detail="Solo DIRECTOR, GERENCIA o DISEÑO pueden asignar equipos.",
        )

    # Validar instancia
    inst = _get_instance_or_404(instance_id, session)

    if payload.lane not in ("IM", "IP"):
        raise HTTPException(
            status_code=400,
            detail="El carril debe ser IM (Instalación MDF) o IP (Instalación Piedra).",
        )

    if payload.lane == "IM" and not inst.scheduled_inst_mdf:
        raise HTTPException(
            status_code=400,
            detail="La instancia no tiene fecha IM programada en el calendario.",
        )
    if payload.lane == "IP" and not inst.scheduled_inst_stone:
        raise HTTPException(
            status_code=400,
            detail="La instancia no tiene fecha IP programada en el calendario.",
        )

    # Validar usuarios — todos deben existir y tener rol LOGISTICS
    leader = session.get(User, payload.leader_user_id)
    if not leader:
        raise HTTPException(status_code=404, detail="Usuario Líder no encontrado.")
    if leader.role != UserRole.LOGISTICS:
        raise HTTPException(
            status_code=400,
            detail=f"El Líder debe tener rol LOGISTICS. Rol actual: {leader.role}",
        )
    if payload.helper_1_user_id:
        h1 = session.get(User, payload.helper_1_user_id)
        if not h1:
            raise HTTPException(status_code=404, detail="Ayudante 1 no encontrado.")
        if h1.role != UserRole.LOGISTICS:
            raise HTTPException(
                status_code=400,
                detail=f"Ayudante 1 debe tener rol LOGISTICS. Rol actual: {h1.role}",
            )
    if payload.helper_2_user_id:
        h2 = session.get(User, payload.helper_2_user_id)
        if not h2:
            raise HTTPException(status_code=404, detail="Ayudante 2 no encontrado.")
        if h2.role != UserRole.LOGISTICS:
            raise HTTPException(
                status_code=400,
                detail=f"Ayudante 2 debe tener rol LOGISTICS. Rol actual: {h2.role}",
            )

    # Buscar asignación existente para esta instancia, carril (IM/IP) y SCHEDULED
    # Si existe → reasignar (update). Si no → crear nueva.
    assignment_dt = datetime.combine(payload.assignment_date, datetime.min.time())
    stmt = select(InstallationAssignment).where(
        InstallationAssignment.instance_id == instance_id,
        InstallationAssignment.lane == payload.lane,
        InstallationAssignment.status == InstallationAssignmentStatus.SCHEDULED,
    )
    existing = session.exec(stmt).first()

    if existing:
        existing.leader_user_id = payload.leader_user_id
        existing.helper_1_user_id = payload.helper_1_user_id
        existing.helper_2_user_id = payload.helper_2_user_id
        existing.assignment_date = assignment_dt
        existing.lane = payload.lane
        session.add(existing)
        assignment = existing
    else:
        assignment = InstallationAssignment(
            instance_id=instance_id,
            lane=payload.lane,
            leader_user_id=payload.leader_user_id,
            helper_1_user_id=payload.helper_1_user_id,
            helper_2_user_id=payload.helper_2_user_id,
            assignment_date=assignment_dt,
            status=InstallationAssignmentStatus.SCHEDULED,
        )
        session.add(assignment)

    session.commit()
    session.refresh(assignment)

    # Serializar respuesta enriquecida
    leader_name = leader.full_name
    h1_name = session.get(User, payload.helper_1_user_id).full_name if payload.helper_1_user_id else None
    h2_name = session.get(User, payload.helper_2_user_id).full_name if payload.helper_2_user_id else None

    return {
        "assignment_id": assignment.id,
        "instance_id": instance_id,
        "instance_name": inst.custom_name,
        "assignment_date": payload.assignment_date.isoformat(),
        "lane": payload.lane,
        "status": assignment.status,
        "leader": {"id": payload.leader_user_id, "name": leader_name},
        "helper_1": {"id": payload.helper_1_user_id, "name": h1_name} if payload.helper_1_user_id else None,
        "helper_2": {"id": payload.helper_2_user_id, "name": h2_name} if payload.helper_2_user_id else None,
        "action": "updated" if existing else "created",
    }
