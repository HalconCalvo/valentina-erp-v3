"""Design domain — database queries only (recipes and their use in sales)."""
from typing import Dict, List, Optional, Sequence

from sqlmodel import Session, select

from app.models.design import ProductMaster, ProductVersion, VersionComponent
from app.models.material import Material
from app.models.sales import Quotation, QuotationItem, QuotationStatus, SalesOrderItem


def get_version(session: Session, version_id: int) -> Optional[ProductVersion]:
    return session.get(ProductVersion, version_id)


def get_master(session: Session, master_id: int) -> Optional[ProductMaster]:
    return session.get(ProductMaster, master_id)


def get_components(session: Session, version_id: int) -> List[VersionComponent]:
    return list(session.exec(select(VersionComponent).where(VersionComponent.version_id == version_id)).all())


def get_materials_by_ids(session: Session, material_ids: Sequence[int]) -> Dict[int, Material]:
    ids = list({i for i in material_ids if i})
    if not ids:
        return {}
    return {m.id: m for m in session.exec(select(Material).where(Material.id.in_(ids))).all()}


def get_versions_by_ids(session: Session, version_ids: Sequence[int]) -> Dict[int, ProductVersion]:
    ids = list({i for i in version_ids if i})
    if not ids:
        return {}
    return {v.id: v for v in session.exec(select(ProductVersion).where(ProductVersion.id.in_(ids))).all()}


def get_replacement(session: Session, version_id: int) -> Optional[ProductVersion]:
    return session.exec(select(ProductVersion).where(ProductVersion.replaces_version_id == version_id)).first()


def orders_using_version(session: Session, version_id: int) -> List[int]:
    """Ids of the sales orders with an active line made from this recipe."""
    return sorted(set(session.exec(
        select(SalesOrderItem.sales_order_id).where(
            SalesOrderItem.origin_version_id == version_id,
            SalesOrderItem.is_cancelled == False,  # noqa: E712
        )
    ).all()))


def quotations_using_version(session: Session, version_id: int, statuses: Sequence[QuotationStatus]) -> List[Quotation]:
    """Quotations in one of `statuses` with an active line made from this recipe."""
    return list(session.exec(
        select(Quotation)
        .join(QuotationItem, QuotationItem.quotation_id == Quotation.id)
        .where(
            QuotationItem.origin_version_id == version_id,
            QuotationItem.is_cancelled == False,  # noqa: E712
            Quotation.status.in_(list(statuses)),
        )
        .distinct()
        .order_by(Quotation.id)
    ).all())


def get_versions_of_master(session: Session, master_id: int) -> List[ProductVersion]:
    return list(session.exec(select(ProductVersion).where(ProductVersion.master_id == master_id)).all())
