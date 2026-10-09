"""Recipe and material price corrections made by the Director while authorizing a quotation.

Applied in the authorization transaction (caller commits): material prices change in the catalog (global and
permanent) and every corrected recipe becomes a new READY version that replaces the old one, which turns
OBSOLETE and keeps its components for what was already sold. Each change carries its reason in the change log.
"""
from typing import Dict, Set

from fastapi import HTTPException
from sqlmodel import Session

from app.core.audit_context import audit_reason
from app.models.sales import Quotation
from app.models.users import User
from app.repositories import design_repository as design_repo
from app.schemas.quotation_schema import QuotationAuthorize, RecipeCorrection
from app.services import design_version_service


def _clean(reason: str) -> str:
    text = (reason or "").strip()
    if not text:
        raise HTTPException(status_code=422, detail="Toda corrección de receta o precio necesita motivo.")
    return text


def _apply_prices(session: Session, data: QuotationAuthorize, label: str) -> int:
    materials = design_repo.get_materials_by_ids(session, [p.material_id for p in data.material_prices])
    for price in data.material_prices:
        material = materials.get(price.material_id)
        if not material:
            raise HTTPException(status_code=404, detail=f"Material {price.material_id} no encontrado.")
        with audit_reason(f"{label}: {_clean(price.reason)}"):
            material.current_cost = round(float(price.current_cost), 4)
            session.add(material)
            session.flush()
    return len(data.material_prices)


def _correct_recipe(session: Session, correction: RecipeCorrection, quotation: Quotation, label: str, user: User) -> int:
    source = design_repo.get_version(session, correction.origin_version_id)
    if not source:
        raise HTTPException(status_code=404, detail=f"Receta {correction.origin_version_id} no encontrada.")
    components = [(c.material_id, c.quantity) for c in correction.components]
    materials = design_repo.get_materials_by_ids(session, [m for m, _ in components])
    inactive = [m for m, _ in components if m not in materials or not materials[m].is_active]
    if inactive:
        raise HTTPException(status_code=422, detail=f"Materiales inexistentes o inactivos en la corrección: {inactive}.")
    note = _clean(correction.reason)
    return design_version_service.create_correction(session, source, components, note, quotation.id, label, user).id


def apply_corrections(session: Session, quotation: Quotation, data: QuotationAuthorize, label: str, user: User) -> Dict[int, int]:
    """Returns {old version id: new version id} for the quotation lines to point to."""
    used: Set[int] = {i.origin_version_id for i in data.items if i.origin_version_id}
    targets = [c.origin_version_id for c in data.recipe_corrections]
    if len(targets) != len(set(targets)):
        raise HTTPException(status_code=422, detail="Cada receta se corrige una sola vez por autorización.")
    if set(targets) - used:
        raise HTTPException(status_code=422, detail="Solo se corrigen recetas usadas en esta cotización.")
    _apply_prices(session, data, label)
    return {c.origin_version_id: _correct_recipe(session, c, quotation, label, user) for c in data.recipe_corrections}


def summary(data: QuotationAuthorize, version_map: Dict[int, int]) -> str:
    parts = []
    if version_map:
        parts.append("Recetas corregidas: " + ", ".join(f"{old} → {new}" for old, new in version_map.items()))
    if data.material_prices:
        parts.append(f"Precios de material actualizados: {len(data.material_prices)}")
    return ". ".join(parts)
