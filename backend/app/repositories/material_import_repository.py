"""Queries of the material bulk update (no business logic)."""
from typing import Dict, List

from sqlalchemy import or_
from sqlmodel import Session, select

from app.models.foundations import Provider
from app.models.material import Material, ProductionRoute


def materials_by_sku(session: Session) -> Dict[str, Material]:
    return {m.sku.strip().upper(): m for m in session.exec(select(Material)) if m.sku}


def providers(session: Session) -> List[Provider]:
    return list(session.exec(select(Provider)))


def incomplete_active_materials(session: Session) -> List[Material]:
    """Active materials without provider, without units, or MATERIAL route with cost zero."""
    return list(session.exec(select(Material).where(
        Material.is_active == True,  # noqa: E712
        or_(Material.provider_id.is_(None), Material.purchase_unit.is_(None), Material.purchase_unit == "",
            Material.usage_unit.is_(None), Material.usage_unit == "",
            (Material.production_route == ProductionRoute.MATERIAL) & (Material.current_cost <= 0)),
    ).order_by(Material.sku)))
