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


def version_used_by_order(session: Session, version_id: int) -> bool:
    return session.exec(
        select(SalesOrderItem.id).where(
            SalesOrderItem.origin_version_id == version_id,
            SalesOrderItem.is_cancelled == False,  # noqa: E712
        )
    ).first() is not None


def version_used_by_quotation(session: Session, version_id: int, statuses: Sequence[QuotationStatus]) -> bool:
    return session.exec(
        select(QuotationItem.id)
        .join(Quotation, Quotation.id == QuotationItem.quotation_id)
        .where(
            QuotationItem.origin_version_id == version_id,
            QuotationItem.is_cancelled == False,  # noqa: E712
            Quotation.status.in_(list(statuses)),
        )
    ).first() is not None


def get_versions_of_master(session: Session, master_id: int) -> List[ProductVersion]:
    return list(session.exec(select(ProductVersion).where(ProductVersion.master_id == master_id)).all())
