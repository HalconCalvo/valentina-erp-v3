"""Recipe versions: create, clone, edit, status, rename, delete.

A recipe already used by a sales order or by a quotation under review, authorized or converted is immutable:
its components cannot change and it cannot go back to draft (clone it, or let the Director correct it from
the quotation review, which creates a replacing version). Only DESIGN and DIRECTOR edit recipes.
"""
from datetime import datetime
from typing import List, Optional, Sequence, Tuple

from fastapi import HTTPException
from sqlmodel import Session

from app.core import material_groups
from app.core.audit_context import audit_reason
from app.core.permissions import require_roles, role_of
from app.models.design import ProductMaster, ProductVersion, VersionComponent, VersionStatus
from app.models.sales import QuotationStatus
from app.repositories import design_repository as design_repo
from app.schemas.design_schema import ProductVersionCreate, ProductVersionRead
from app.services import recipe_cost_service

DESIGN_ROLES = {"DESIGN", "DIRECTOR"}
LOCKING_QUOTATION_STATUSES = [QuotationStatus.PENDING_AUTH, QuotationStatus.AUTHORIZED,
                              QuotationStatus.CONVERTED, QuotationStatus.APPLIED]
LOCKED_MESSAGE = "Esta receta ya se usó en una OV o en una cotización en revisión, autorizada o convertida; clónala para cambiarla."


def assert_design_role(user) -> None:
    require_roles(user, DESIGN_ROLES, "Solo Diseño y Dirección modifican recetas.")


def is_locked(session: Session, version_id: int) -> bool:
    return (design_repo.version_used_by_order(session, version_id)
            or design_repo.version_used_by_quotation(session, version_id, LOCKING_QUOTATION_STATUSES))


def _get_or_404(session: Session, version_id: int) -> ProductVersion:
    version = design_repo.get_version(session, version_id)
    if not version:
        raise HTTPException(status_code=404, detail="Versión no encontrada")
    return version


def refresh_version_cache(session: Session, version: ProductVersion, components: Sequence[Tuple[int, float]]) -> list:
    """Cost cache and MDF / stone flags from the recipe; returns the cost alerts."""
    cost = recipe_cost_service.compute(session, components)
    version.estimated_cost = cost.total
    version.material_cost = cost.material_total
    materials = design_repo.get_materials_by_ids(session, [material_id for material_id, _ in components])
    categories = {(m.category or "").upper() for m in materials.values()}
    version.has_mdf_components = bool(categories & set(material_groups.MAIN_MDF))
    version.has_stone_components = bool(categories & set(material_groups.MAIN_STONE))
    session.add(version)
    return cost.alerts


def replace_components(session: Session, version: ProductVersion, components: Sequence[Tuple[int, float]]) -> None:
    for component in design_repo.get_components(session, version.id):
        session.delete(component)
    session.flush()
    for material_id, quantity in components:
        session.add(VersionComponent(version_id=version.id, material_id=material_id, quantity=quantity))
    refresh_version_cache(session, version, components)


def _active_components(session: Session, components: Sequence[Tuple[int, float]]) -> List[Tuple[int, float]]:
    materials = design_repo.get_materials_by_ids(session, [material_id for material_id, _ in components])
    return [(m_id, qty) for m_id, qty in components if qty > 0 and m_id in materials and materials[m_id].is_active]


def _components_of(session: Session, version_id: int) -> List[Tuple[int, float]]:
    return [(c.material_id, c.quantity) for c in design_repo.get_components(session, version_id)]


def create_version(session: Session, data: ProductVersionCreate, user) -> ProductVersion:
    assert_design_role(user)
    if not design_repo.get_master(session, data.master_id):
        raise HTTPException(status_code=404, detail="El Maestro de Producto no existe")
    if data.components:
        components = _active_components(session, [(c.material_id, c.quantity) for c in data.components])
    elif data.clone_from_version_id:
        source = _get_or_404(session, data.clone_from_version_id)
        if source.master_id != data.master_id:
            raise HTTPException(status_code=422, detail="Solo se clonan versiones del mismo producto.")
        components = _active_components(session, _components_of(session, source.id))
    else:
        components = []
    version = ProductVersion(master_id=data.master_id, version_name=data.version_name, status=data.status,
                             is_active=data.is_active, commercial_description=data.commercial_description)
    session.add(version)
    session.flush()
    replace_components(session, version, components)
    session.commit()
    session.refresh(version)
    return version


def _same_recipe(current: Sequence[Tuple[int, float]], incoming: Sequence[Tuple[int, float]]) -> bool:
    def norm(rows):
        return sorted((int(m), round(float(q), 6)) for m, q in rows)
    return norm(current) == norm(incoming)


def _assert_status_change(session: Session, version: ProductVersion, new_status: str) -> None:
    if new_status == VersionStatus.DRAFT and version.status != VersionStatus.DRAFT and is_locked(session, version.id):
        raise HTTPException(status_code=409, detail=LOCKED_MESSAGE)


def update_version(session: Session, version_id: int, data: ProductVersionCreate, user) -> ProductVersion:
    assert_design_role(user)
    version = _get_or_404(session, version_id)
    incoming = _active_components(session, [(c.material_id, c.quantity) for c in data.components])
    recipe_changes = not _same_recipe(_components_of(session, version_id), incoming)
    if recipe_changes and is_locked(session, version_id):
        raise HTTPException(status_code=409, detail=LOCKED_MESSAGE)
    _assert_status_change(session, version, data.status)
    version.version_name = data.version_name
    version.status = data.status
    if data.commercial_description is not None:
        version.commercial_description = data.commercial_description
    if recipe_changes:
        replace_components(session, version, incoming)
    session.add(version)
    session.commit()
    session.refresh(version)
    return version


def read_version(session: Session, version_id: int) -> ProductVersionRead:
    """Live cost from active materials. Reading never writes: the cache is refreshed when the recipe is saved."""
    version = _get_or_404(session, version_id)
    cost = recipe_cost_service.version_cost(session, version_id)
    response = ProductVersionRead.model_validate(version)
    response.estimated_cost = cost.total
    response.material_cost = cost.material_total
    response.alerts = cost.alerts
    response.is_locked = is_locked(session, version_id)
    return response


def set_status(session: Session, version_id: int, status: VersionStatus, user) -> ProductVersion:
    assert_design_role(user)
    version = _get_or_404(session, version_id)
    _assert_status_change(session, version, status)
    version.status = status
    session.add(version)
    session.commit()
    session.refresh(version)
    return version


def rename(session: Session, version_id: int, new_name: str, user) -> ProductVersion:
    assert_design_role(user)
    version = _get_or_404(session, version_id)
    version.version_name = new_name.strip()
    session.add(version)
    session.commit()
    session.refresh(version)
    return version


def delete_version(session: Session, version_id: int, user) -> dict:
    assert_design_role(user)
    version = _get_or_404(session, version_id)
    if is_locked(session, version_id) or design_repo.get_replacement(session, version_id):
        raise HTTPException(status_code=409, detail="Esta versión ya se usó o fue corregida; no se puede eliminar "
                            "para preservar la trazabilidad. Márcala como obsoleta.")
    with audit_reason("Versión descartada (sin uso)"):
        version.is_active = False
        version.status = VersionStatus.OBSOLETE
        session.add(version)
        session.commit()
    return {"ok": True, "message": "Versión descartada: ya no aparece en el catálogo (se conserva en la bitácora)."}


def deactivate_master(session: Session, master_id: int, user) -> dict:
    """A master no quotation or OV uses is deactivated with its versions (it used to be deleted in cascade)."""
    if role_of(user) not in {"DIRECTOR", "ADMIN", "DESIGN"}:
        raise HTTPException(status_code=403, detail="No tienes permisos para eliminar diseños")
    master = session.get(ProductMaster, master_id)
    if not master:
        raise HTTPException(status_code=404, detail="Diseño no encontrado")
    assert_master_deletable(session, master_id)
    with audit_reason("Producto dado de baja (sin uso)"):
        master.is_active = False
        session.add(master)
        for version in design_repo.get_versions_of_master(session, master_id):
            version.is_active = False
            session.add(version)
        session.commit()
    return {"ok": True, "message": "Diseño dado de baja; se conserva en la bitácora."}


def assert_master_deletable(session: Session, master_id: int) -> None:
    for version in design_repo.get_versions_of_master(session, master_id):
        if is_locked(session, version.id):
            raise HTTPException(status_code=409, detail="El producto tiene recetas usadas en OVs o cotizaciones; "
                                "no se puede eliminar. Desactívalo.")


def create_correction(
    session: Session, source: ProductVersion, components: Sequence[Tuple[int, float]], note: str,
    quotation_id: int, label: str, user,
) -> ProductVersion:
    """Corrected copy of a recipe (Director, quotation review): new READY version, the old one OBSOLETE and intact.
    Caller commits."""
    version = ProductVersion(
        master_id=source.master_id, version_name=f"{source.version_name} (corr. {label})",
        status=VersionStatus.READY, is_active=True, installation_days=source.installation_days,
        blueprint_path=source.blueprint_path, commercial_description=source.commercial_description,
        replaces_version_id=source.id, correction_note=note, corrected_at=datetime.utcnow(),
        corrected_by_user_id=user.id, corrected_in_quotation_id=quotation_id,
    )
    with audit_reason(f"{label}: {note}"):
        session.add(version)
        session.flush()
        replace_components(session, version, components)
        source.status = VersionStatus.OBSOLETE
        session.add(source)
        session.flush()
    return version
