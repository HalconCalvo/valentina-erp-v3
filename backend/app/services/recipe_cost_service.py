"""Single cost rule for a recipe (catalog, quotation snapshot and cost drift).

Each line costs exactly quantity × (current cost / conversion factor) — no rounding up per line; the total is
rounded to cents. Inactive materials are left out and reported; fictitious materials are reported.
"""
from dataclasses import dataclass, field
from typing import Iterable, List, Tuple

from sqlmodel import Session

from app.models.material import ProductionRoute
from app.repositories import design_repository as design_repo
from app.services.inventory_service import usage_unit_cost


@dataclass
class RecipeCost:
    total: float = 0.0
    material_total: float = 0.0
    ingredients: List[dict] = field(default_factory=list)
    alerts: List[str] = field(default_factory=list)


def compute(session: Session, components: Iterable[Tuple[int, float]]) -> RecipeCost:
    """components: (material_id, quantity per unit of product)."""
    lines = [(int(material_id), float(quantity or 0.0)) for material_id, quantity in components]
    materials = design_repo.get_materials_by_ids(session, [material_id for material_id, _ in lines])
    result = RecipeCost()
    total = material_total = 0.0
    for material_id, quantity in lines:
        material = materials.get(material_id)
        if material is None:
            result.alerts.append(f"Material {material_id} inexistente en la receta. Se excluyó del costo.")
            continue
        if not material.is_active:
            result.alerts.append(f"Material inactivo en la receta: {material.name} (SKU {material.sku}). Se excluyó del costo.")
            continue
        if getattr(material, "is_fictitious", False):
            result.alerts.append(f"Material ficticio pendiente de definir: {material.name} (SKU {material.sku}).")
        unit_cost = usage_unit_cost(material)
        line_total = quantity * unit_cost
        total += line_total
        if material.production_route == ProductionRoute.MATERIAL:
            material_total += line_total
        result.ingredients.append({
            "material_id": material.id, "sku": material.sku, "name": material.name, "qty_recipe": quantity,
            "frozen_unit_cost": unit_cost, "line_total": line_total,
        })
    result.total = round(total, 2)
    result.material_total = round(material_total, 2)
    return result


def version_cost(session: Session, version_id: int) -> RecipeCost:
    return compute(session, [(c.material_id, c.quantity) for c in design_repo.get_components(session, version_id)])
