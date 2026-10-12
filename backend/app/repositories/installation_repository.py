"""Queries for installation lanes (assignments), their crews and crew payroll."""
from typing import List, Optional

from sqlmodel import Session, func, select

from app.models.design import ProductVersion, VersionComponent
from app.models.foundations import Client, GlobalConfig
from app.models.material import Material
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


DAY_UNITS = ("día", "dia", "días", "dias")


def get_recipe_installation_days(session: Session, instance: SalesOrderItemInstance, sku: str) -> Optional[float]:
    """Days of the recipe's installation line (service line in days, e.g. INSTALACOCINA); None when it has none."""
    item = session.get(SalesOrderItem, instance.sales_order_item_id)
    if not item or not item.origin_version_id:
        return None
    return session.exec(select(func.sum(VersionComponent.quantity))
                        .join(Material, Material.id == VersionComponent.material_id)
                        .where(VersionComponent.version_id == item.origin_version_id, Material.sku == sku,
                               func.lower(Material.usage_unit).in_(DAY_UNITS))).one()


def get_order_and_client(session: Session, instance: SalesOrderItemInstance):
    item = session.get(SalesOrderItem, instance.sales_order_item_id)
    order = session.get(SalesOrder, item.sales_order_id) if item else None
    client = session.get(Client, order.client_id) if order and order.client_id else None
    return order, client


STONE_INSTALLATION_SKU = "INSTALAGRANITO"


def versions_with_line(session: Session, version_ids, sku: str) -> set:
    """Recipe versions (of the given ids) that carry a line of the material with this SKU."""
    ids = list(set(v for v in version_ids if v))
    if not ids:
        return set()
    return set(session.exec(select(VersionComponent.version_id).join(Material, Material.id == VersionComponent.material_id)
                            .where(VersionComponent.version_id.in_(ids), Material.sku == sku)).all())


def needs_stone_lane(session: Session, version: ProductVersion) -> bool:
    """D19: stone in the recipe, or just its INSTALAGRANITO line (the client may supply the stone)."""
    return bool(version.has_stone_components) or bool(versions_with_line(session, [version.id], STONE_INSTALLATION_SKU))


def get_required_lanes(session: Session, instance: SalesOrderItemInstance) -> set:
    """Lanes the house needs according to its recipe: IM when it has furniture (MDF), IP when it has stone (D19)."""
    item = session.get(SalesOrderItem, instance.sales_order_item_id)
    version = session.get(ProductVersion, item.origin_version_id) if item and item.origin_version_id else None
    if not version:
        return set()
    return {lane for lane, needed in (("IM", version.has_mdf_components), ("IP", needs_stone_lane(session, version)))
            if needed}
