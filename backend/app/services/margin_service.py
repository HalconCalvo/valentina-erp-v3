"""The two margin figures used across the system.

The seller earns commission = c × sale price without tax (same as the commission really paid).
- Price = cost × (1 + markup) ÷ (1 − c); price without commission = price × (1 − c).
- Sobreprecio % (markup, sets the price) = (price × (1 − c) − cost) / cost.
- Margen neto % sobre venta (analysis, after commission) = (price without tax − cost − commission) / price without tax.
Both are in percent. Prices never include tax here.
"""
from typing import Iterable, Optional


def normalize_rate(rate: Optional[float]) -> float:
    """Commission stored as 0.05 or as 5 → 0.05."""
    value = float(rate or 0.0)
    return value / 100.0 if value > 1.0 else value


def markup_percent(sales_without_tax: float, cost: float, commission_rate: Optional[float]) -> Optional[float]:
    if cost <= 0:
        return None
    without_commission = float(sales_without_tax) * (1 - normalize_rate(commission_rate))
    return round((without_commission - cost) / cost * 100, 2)


def commission_amount(sales_without_tax: float, commission_rate: Optional[float]) -> float:
    """Seller commission: c × sale price without tax."""
    return float(sales_without_tax or 0.0) * normalize_rate(commission_rate)


def net_margin_percent(sales_without_tax: float, cost: float, commission: float) -> Optional[float]:
    if sales_without_tax <= 0:
        return None
    return round((sales_without_tax - cost - commission) / sales_without_tax * 100, 2)


def lines_markup_percent(lines: Iterable, commission_rate: Optional[float]) -> Optional[float]:
    """Weighted markup of active lines (objects with quantity, unit_price, frozen_unit_cost)."""
    sales = cost = 0.0
    for line in lines:
        qty = float(line.quantity or 0)
        sales += qty * float(line.unit_price or 0)
        cost += qty * float(line.frozen_unit_cost or 0)
    return markup_percent(sales, cost, commission_rate)
