"""Queries for installation lanes (assignments), their crews and crew payroll."""
from typing import List, Optional

from sqlmodel import Session, select

from app.models.design import ProductVersion
from app.models.foundations import Client, GlobalConfig
from app.models.production import InstallationAssignment, InstallationAssignmentStatus, PayrollPayment, PayrollStatus
from app.models.sales import SalesOrder, SalesOrderItem, SalesOrderItemInstance


def get_open_lanes(session: Session, instance_id: int) -> List[InstallationAssignment]:
    """Lanes of an instance not completed yet (one per IM / IP)."""
    return session.exec(select(InstallationAssignment).where(
        InstallationAssignment.instance_id == instance_id,
        InstallationAssignment.status != InstallationAssignmentStatus.COMPLETED)).all()


def get_lanes(session: Session, instance_id: int) -> List[InstallationAssignment]:
    return session.exec(select(InstallationAssignment).where(InstallationAssignment.instance_id == instance_id)
                        .order_by(InstallationAssignment.lane)).all()


def get_active_lanes_led_by(session: Session, user_id: int) -> List[InstallationAssignment]:
    """Lanes already loaded (on the way or installed) and not signed, led by the user."""
    return session.exec(select(InstallationAssignment).where(
        InstallationAssignment.leader_user_id == user_id,
        InstallationAssignment.status.in_([InstallationAssignmentStatus.IN_PROGRESS,
                                           InstallationAssignmentStatus.INSTALLED]))).all()


def get_live_payroll(session: Session, assignment_id: int) -> List[PayrollPayment]:
    return session.exec(select(PayrollPayment).where(PayrollPayment.installation_assignment_id == assignment_id,
                                                     PayrollPayment.status != PayrollStatus.CANCELLED)).all()


def get_global_config(session: Session) -> Optional[GlobalConfig]:
    return session.exec(select(GlobalConfig)).first()


def get_installation_days(session: Session, instance: SalesOrderItemInstance) -> float:
    """Days budgeted by the recipe version of the instance (1 when unknown)."""
    item = session.get(SalesOrderItem, instance.sales_order_item_id)
    version = session.get(ProductVersion, item.origin_version_id) if item and item.origin_version_id else None
    return float(version.installation_days) if version and version.installation_days else 1.0


def get_order_and_client(session: Session, instance: SalesOrderItemInstance):
    item = session.get(SalesOrderItem, instance.sales_order_item_id)
    order = session.get(SalesOrder, item.sales_order_id) if item else None
    client = session.get(Client, order.client_id) if order and order.client_id else None
    return order, client
