"""Queries for installations scheduled in Planning and the crews assigned to them."""
from typing import List, Set, Tuple

from sqlmodel import Session, or_, select

from app.models.production import InstallationAssignment, InstallationAssignmentStatus
from app.models.sales import InstanceStatus, SalesOrderItemInstance

DONE = (InstanceStatus.CLOSED, InstanceStatus.WARRANTY)


def get_scheduled_open_instances(session: Session) -> List[SalesOrderItemInstance]:
    """Live houses with an installation date (furniture or stone) not closed yet."""
    return list(session.exec(select(SalesOrderItemInstance).where(
        SalesOrderItemInstance.is_cancelled == False,  # noqa: E712
        SalesOrderItemInstance.production_status.notin_(DONE),
        or_(SalesOrderItemInstance.scheduled_inst_mdf.isnot(None),
            SalesOrderItemInstance.scheduled_inst_stone.isnot(None)))).all())


def get_staffed_lanes(session: Session, instance_ids) -> Set[Tuple[int, str]]:
    ids = list(instance_ids)
    if not ids:
        return set()
    rows = session.exec(select(InstallationAssignment.instance_id, InstallationAssignment.lane)
                        .where(InstallationAssignment.instance_id.in_(ids),
                               InstallationAssignment.status != InstallationAssignmentStatus.CANCELLED)).all()
    return {(iid, lane) for iid, lane in rows}
