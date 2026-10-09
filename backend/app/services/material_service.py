"""Material catalog writes with role rules.

General fields: DIRECTOR, MANAGER, ADMIN, WAREHOUSE, DESIGN. Price (current_cost, per purchase unit) and
conversion factor: only DIRECTOR, MANAGER, ADMIN. Price changes may carry a reason for the change log.
"""
from typing import Optional

from fastapi import HTTPException
from sqlmodel import Session

from app.core.audit_context import audit_reason
from app.core.permissions import require_roles, role_of
from app.models.material import Material

CATALOG_ROLES = {"DIRECTOR", "MANAGER", "ADMIN", "WAREHOUSE", "DESIGN"}
PRICE_ROLES = {"DIRECTOR", "MANAGER", "ADMIN"}
PRICE_FIELDS = ("current_cost", "conversion_factor")


def can_change_price(user) -> bool:
    return role_of(user) in PRICE_ROLES


def assert_catalog_role(user) -> None:
    require_roles(user, CATALOG_ROLES, "No tienes permisos para modificar el catálogo de materiales.")


def assert_price_role(user) -> None:
    require_roles(user, PRICE_ROLES, "Solo Dirección, Gerencia o Administración cambian el precio o el factor "
                  "de conversión de un material.")


def _changes_price(current: Material, data: dict) -> bool:
    return any(field in data and float(data[field] or 0) != float(getattr(current, field) or 0) for field in PRICE_FIELDS)


def check_new_material(material: Material, user) -> None:
    """A new material may only carry a price or a conversion factor if the user can set them."""
    assert_catalog_role(user)
    if (float(material.current_cost or 0) != 0 or float(material.conversion_factor or 1) != 1) and not can_change_price(user):
        assert_price_role(user)


def _route_value(route) -> str:
    return str(getattr(route, "value", route) or "").upper()


def _assert_same_route(current: Material, data: dict) -> None:
    """The route changes only through PATCH /materials/{id}/route (reason; stock may go to expense)."""
    if data.get("production_route") is not None and _route_value(data["production_route"]) != _route_value(current.production_route):
        raise HTTPException(status_code=409, detail="La ruta se cambia con su propio diálogo (motivo; si deja de ser "
                            "MATERIAL con existencia, esta se manda a gasto).")


def update_material(session: Session, material: Material, data: dict, user, reason: Optional[str] = None) -> Material:
    assert_catalog_role(user)
    data.pop("id", None)
    _assert_same_route(material, data)
    if _changes_price(material, data):
        assert_price_role(user)
    for key in ("sku", "name"):
        if data.get(key):
            data[key] = data[key].strip()
    with audit_reason((reason or "").strip() or None):
        for key, value in data.items():
            setattr(material, key, value)
        session.add(material)
        session.commit()
    session.refresh(material)
    return material


def get_or_404(session: Session, material_id: int) -> Material:
    material = session.get(Material, material_id)
    if not material:
        raise HTTPException(status_code=404, detail="Material no encontrado")
    return material
