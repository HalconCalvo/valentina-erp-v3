"""D13: the seller (SALES) never sees costs, so the server prices for them and keeps their lines' costs.

- Suggested price of a catalog version or a resale accessory: cost × (1 + markup) ÷ (1 − commission), with the
  configured target markup for roles that cannot see costs (others may pass theirs). IVA tasa cero adds the IVA of
  the MATERIAL part of the recipe to the cost used for the price (same rule the capture screen used).
- Lines saved by a seller: catalog lines are costed from the recipe (as always), resale lines take the catalog
  cost and manual lines keep the cost they already had (the seller sends none).
"""
from typing import Dict, List, Optional

from fastapi import HTTPException
from sqlmodel import Session

from app.core.cost_visibility import hides_costs
from app.core.permissions import role_of
from app.repositories import quotation_repository as quotation_repo
from app.schemas.quotation_schema import PriceSuggestionItem, PriceSuggestionRead, PriceSuggestionRequest
from app.services import margin_service, recipe_cost_service

ZERO_RATE_MATERIAL_IVA = 0.16


def _target_markup(session: Session) -> float:
    config = quotation_repo.get_global_config(session)
    value = float(config.target_profit_margin or 0.0) if config else 0.0
    return value * 100 if 0 < value <= 1 else value


def _price(cost: float, markup: float, commission: float) -> float:
    return round(cost * (1 + markup / 100) / (1 - commission), 2)


def _is_zero_rate(session: Session, tax_rate_id: Optional[int]) -> bool:
    rate = quotation_repo.get_tax_rate_by_id(session, tax_rate_id) if tax_rate_id else None
    return bool(rate) and float(rate.rate or 0.0) == 0.0


def _line_price(session: Session, item: PriceSuggestionItem, markup: float, commission: float, zero_rate: bool) -> float:
    if item.origin_version_id:
        cost = recipe_cost_service.version_cost(session, item.origin_version_id)
        base = cost.total + (cost.material_total * ZERO_RATE_MATERIAL_IVA if zero_rate else 0.0)
        return _price(base, markup, commission)
    if item.resale_sku:
        material = quotation_repo.get_material_by_sku(session, item.resale_sku)
        if not material:
            raise HTTPException(status_code=404, detail=f"Accesorio {item.resale_sku} no encontrado.")
        if float(material.sale_price or 0.0) > 0:
            return _price(float(material.sale_price), 0.0, commission)  # catalog price before commission
        return _price(float(material.current_cost or 0.0), markup, commission)
    raise HTTPException(status_code=422, detail="Indica la versión del producto o el accesorio de reventa.")


def suggest_prices(session: Session, data: PriceSuggestionRequest, user) -> List[PriceSuggestionRead]:
    hidden = hides_costs(role_of(user))
    markup = _target_markup(session) if hidden or data.markup_percent is None else float(data.markup_percent)
    raw_commission = user.commission_rate if data.commission_percent is None else data.commission_percent
    commission = margin_service.normalize_rate(raw_commission)
    if commission >= 1:
        raise HTTPException(status_code=422, detail="La comisión debe ser menor al 100%.")
    zero_rate = _is_zero_rate(session, data.tax_rate_id)
    return [PriceSuggestionRead(unit_price=_line_price(session, item, markup, commission, zero_rate))
            for item in data.items]


SELLER_HIDDEN_HEADER_FIELDS = ("applied_margin_percent", "applied_tolerance_percent")


def drop_cost_fields(update_data: dict, user) -> dict:
    """Header changes without margin fields when the role cannot see them (they are recomputed from the lines)."""
    if hides_costs(role_of(user)):
        for key in SELLER_HIDDEN_HEADER_FIELDS:
            update_data.pop(key, None)
    return update_data


def _line_cost(session: Session, line, previous: Dict[str, object]) -> tuple[float, dict]:
    if line.origin_version_id:
        return 0.0, {}  # recomputed from the recipe when the line is stored
    if line.is_resale and line.resale_sku:
        material = quotation_repo.get_material_by_sku(session, line.resale_sku)
        return (float(material.current_cost or 0.0) if material else 0.0), {}
    old = previous.get(line.product_name)
    return (float(old.frozen_unit_cost or 0.0), dict(old.cost_snapshot or {})) if old else (0.0, {})


def with_server_costs(session: Session, lines: list, user, quotation_id: Optional[int] = None) -> list:
    """Lines sent by a role that cannot see costs, with the costs set by the server (others: unchanged)."""
    if not hides_costs(role_of(user)):
        return lines
    previous = {i.product_name: i for i in quotation_repo.get_active_quotation_items(session, quotation_id)} \
        if quotation_id else {}
    result = []
    for line in lines:
        cost, snapshot = _line_cost(session, line, previous)
        result.append(line.model_copy(update={"frozen_unit_cost": cost, "cost_snapshot": snapshot}))
    return result
