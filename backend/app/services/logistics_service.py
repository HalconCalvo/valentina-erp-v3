"""Agenda diaria de instalaciones por cuadrilla."""
from datetime import date, datetime
from typing import Dict, List, Optional, Set, Tuple

from sqlmodel import Session, select

from app.models.foundations import Client
from app.models.production import InstallationAssignment, InstallationAssignmentStatus
from app.models.sales import SalesOrder, SalesOrderItem, SalesOrderItemInstance
from app.models.users import User, UserRole


def _day_bounds(workday: date) -> Tuple[datetime, datetime]:
    start = datetime.combine(workday, datetime.min.time())
    end = datetime.combine(workday, datetime.max.time())
    return start, end


def _format_address(instance: SalesOrderItemInstance, client: Optional[Client]) -> Optional[str]:
    parts: List[str] = []
    if instance.street:
        parts.append(instance.street.strip())
    if instance.lot:
        parts.append(f"Lote {instance.lot.strip()}")
    if client and client.fiscal_address:
        parts.append(client.fiscal_address.strip())
    return " · ".join(parts) if parts else None


def _instance_context(
    session: Session, instance: SalesOrderItemInstance
) -> Tuple[Optional[str], Optional[str], Optional[str]]:
    item = session.get(SalesOrderItem, instance.sales_order_item_id)
    order = session.get(SalesOrder, item.sales_order_id) if item else None
    client = session.get(Client, order.client_id) if order and order.client_id else None
    folio = f"OV-{str(order.id).zfill(4)}" if order else None
    client_name = client.full_name if client else None
    address = _format_address(instance, client)
    return folio, client_name, address


def validate_installation_team(
    session: Session,
    leader_user_id: int,
    helper_1_user_id: Optional[int],
    helper_2_user_id: Optional[int],
) -> None:
    leader = session.get(User, leader_user_id)
    if not leader or leader.role != UserRole.LOGISTICS:
        raise ValueError("El líder debe existir y tener rol LOGISTICS.")
    for uid in (helper_1_user_id, helper_2_user_id):
        if not uid:
            continue
        u = session.get(User, uid)
        if not u or u.role != UserRole.LOGISTICS:
            raise ValueError("Los ayudantes deben tener rol LOGISTICS.")


def get_team_agenda(session: Session, workday: date) -> dict:
    day_start, day_end = _day_bounds(workday)
    rows = session.exec(
        select(InstallationAssignment).where(
            InstallationAssignment.assignment_date >= day_start,
            InstallationAssignment.assignment_date <= day_end,
            InstallationAssignment.lane.in_(["IM", "IP"]),
            InstallationAssignment.status == InstallationAssignmentStatus.SCHEDULED,
        )
    ).all()

    teams_map: Dict[int, dict] = {}
    covered: Set[Tuple[int, str]] = set()

    for a in rows:
        covered.add((a.instance_id, a.lane))
        inst = session.get(SalesOrderItemInstance, a.instance_id)
        if not inst or inst.is_cancelled:
            continue
        folio, client_name, address = _instance_context(session, inst)
        leader = session.get(User, a.leader_user_id)
        h1 = session.get(User, a.helper_1_user_id) if a.helper_1_user_id else None
        h2 = session.get(User, a.helper_2_user_id) if a.helper_2_user_id else None
        if a.leader_user_id not in teams_map:
            teams_map[a.leader_user_id] = {
                "leader_id": a.leader_user_id,
                "leader_name": leader.full_name if leader else "—",
                "helper_1_id": a.helper_1_user_id,
                "helper_1_name": h1.full_name if h1 else None,
                "helper_2_id": a.helper_2_user_id,
                "helper_2_name": h2.full_name if h2 else None,
                "instances": [],
            }
        teams_map[a.leader_user_id]["instances"].append(
            {
                "assignment_id": a.id,
                "instance_id": inst.id,
                "instance_name": inst.custom_name or "—",
                "order_folio": folio,
                "client_name": client_name,
                "address": address,
                "lane": a.lane,
            }
        )

    unassigned: List[dict] = []
    inst_rows = session.exec(
        select(SalesOrderItemInstance).where(
            SalesOrderItemInstance.is_cancelled == False  # noqa: E712
        )
    ).all()
    for inst in inst_rows:
        lanes_today: List[str] = []
        if inst.scheduled_inst_mdf and inst.scheduled_inst_mdf.date() == workday:
            lanes_today.append("IM")
        if inst.scheduled_inst_stone and inst.scheduled_inst_stone.date() == workday:
            lanes_today.append("IP")
        for lane in lanes_today:
            if (inst.id, lane) in covered:
                continue
            folio, client_name, address = _instance_context(session, inst)
            unassigned.append(
                {
                    "instance_id": inst.id,
                    "lane": lane,
                    "instance_name": inst.custom_name or "—",
                    "order_folio": folio,
                    "client_name": client_name,
                    "address": address,
                }
            )

    teams = sorted(teams_map.values(), key=lambda t: t["leader_name"])
    return {"workday": workday.isoformat(), "teams": teams, "unassigned": unassigned}


def update_day_team_for_leader(session: Session, payload: dict) -> int:
    workday = payload["workday"]
    day_start, day_end = _day_bounds(workday)
    validate_installation_team(
        session,
        payload["leader_user_id"],
        payload.get("helper_1_user_id"),
        payload.get("helper_2_user_id"),
    )
    rows = session.exec(
        select(InstallationAssignment).where(
            InstallationAssignment.leader_user_id == payload["previous_leader_id"],
            InstallationAssignment.assignment_date >= day_start,
            InstallationAssignment.assignment_date <= day_end,
            InstallationAssignment.status == InstallationAssignmentStatus.SCHEDULED,
        )
    ).all()
    count = 0
    for a in rows:
        a.leader_user_id = payload["leader_user_id"]
        a.helper_1_user_id = payload.get("helper_1_user_id")
        a.helper_2_user_id = payload.get("helper_2_user_id")
        session.add(a)
        count += 1
    session.commit()
    return count


def update_assignment_team(session: Session, assignment_id: int, payload: dict) -> None:
    assignment = session.get(InstallationAssignment, assignment_id)
    if not assignment:
        raise LookupError("Asignación no encontrada.")
    if assignment.status != InstallationAssignmentStatus.SCHEDULED:
        raise ValueError("Solo se pueden mover asignaciones en estado SCHEDULED.")
    validate_installation_team(
        session,
        payload["leader_user_id"],
        payload.get("helper_1_user_id"),
        payload.get("helper_2_user_id"),
    )
    assignment.leader_user_id = payload["leader_user_id"]
    assignment.helper_1_user_id = payload.get("helper_1_user_id")
    assignment.helper_2_user_id = payload.get("helper_2_user_id")
    session.add(assignment)
    session.commit()
