"""Director dashboard (Gabriel, 2026-10-12): every card and drill-down from one place so the numbers agree.

- Ventas: sold OVs of the current year, without VAT (tax 0% and 16% alike), against the annual target.
- Liquidez = Bancos + CxC facturada pendiente + Inventario (raw material, in process, finished) − CxP.
- Rentabilidad: Margen neto % sobre venta of the year's OVs, weighted (sales − cost − commission − global commission)
  / sales; the global commission (D44) is sales × the configured percent, as in the OV profitability.
- Cartera: the same pending receivables as Liquidez; the cash flow projection must add up to it.
- Top clientes: sales of the year; by Margen neto %, by days to pay, and sales by lane (MDF, Piedra).
"""
from collections import defaultdict
from datetime import date
from typing import Dict, List, Optional

from sqlmodel import Session

from app.core import material_groups
from app.repositories import director_dashboard_repository as repo
from app.schemas.director_dashboard_schema import (AmountLine, ClientPaymentSpeedRead, ClientSalesRead,
                                                   DirectorSummaryRead, LaneSalesRead, LiquidityRead,
                                                   OrderMarginRead, ProfitabilityRead, ReceivablesRead,
                                                   SalesKpiRead, TopClientsRead)
from app.services import analytics_service, inventory_valuation_service, margin_service, payable_report_service
from app.core.business_time import today_local

TOP = 5
STONE_PROCESS_SKUS = {"INSTALAGRANITO", "MAQGRANITO", "EMPAQPIEDRA"}
LANE_MDF, LANE_STONE, LANE_NONE = "MDF", "Piedra", "Sin receta"
AGE_LABELS = {"0-30": "0 a 30 días", "31-60": "31 a 60 días", "61-90": "61 a 90 días", "+90": "Más de 90 días"}


def _margin(sales: float, cost: float, commission: float, global_commission: float = 0.0) -> Optional[float]:
    return margin_service.net_margin_percent(sales, cost, commission + global_commission)


def global_commission_rate(session: Session) -> float:
    """D44: configured percent as a rate; 0 without beneficiary."""
    config = repo.get_global_config(session)
    if not config or not config.global_commission_user_id:
        return 0.0
    return float(config.global_commission_percent or 0.0) / 100


def _order_cost(items) -> float:
    return sum(float(i.frozen_unit_cost or 0.0) * float(i.quantity or 0.0) for i in items)


def _order_rows(session: Session, orders, items_by_order, global_rate: float) -> List[OrderMarginRead]:
    names = repo.get_client_names(session, (o.client_id for o in orders))
    rows = []
    for order in orders:
        sales, cost = float(order.subtotal or 0.0), _order_cost(items_by_order.get(order.id, []))
        commission, global_commission = float(order.commission_amount or 0.0), sales * global_rate
        rows.append(OrderMarginRead(order_id=order.id, folio=f"OV-{str(order.id).zfill(4)}",
                                    client_name=names.get(order.client_id, "—"), sales_without_tax=round(sales, 2),
                                    cost=round(cost, 2), commission=round(commission, 2),
                                    global_commission=round(global_commission, 2),
                                    net_margin_percent=_margin(sales, cost, commission, global_commission)
                                    if cost > 0 else None))
    return rows


def sales_kpi(session: Session, rows: List[OrderMarginRead], year: int) -> SalesKpiRead:
    config = repo.get_global_config(session)
    target = float(config.annual_sales_target or 0.0) if config else 0.0
    sold = round(sum(r.sales_without_tax for r in rows), 2)
    percent = round(sold / target * 100, 2) if target > 0 else None
    return SalesKpiRead(year=year, sales_without_tax=sold, orders=len(rows), annual_target=target,
                        target_percent=percent)


def profitability(rows: List[OrderMarginRead]) -> ProfitabilityRead:
    costed = [r for r in rows if r.net_margin_percent is not None]
    uncosted = [r for r in rows if r.net_margin_percent is None]
    sales = sum(r.sales_without_tax for r in costed)
    cost = sum(r.cost for r in costed)
    commission = sum(r.commission for r in costed)
    global_commission = sum(r.global_commission for r in costed)
    ranked = sorted(costed, key=lambda r: r.net_margin_percent)
    return ProfitabilityRead(sales_without_tax=round(sales, 2), cost=round(cost, 2),
                             commission=round(commission, 2), global_commission=round(global_commission, 2),
                             net_margin_percent=_margin(sales, cost, commission, global_commission),
                             orders_without_cost=len(uncosted),
                             sales_without_cost=round(sum(r.sales_without_tax for r in uncosted), 2),
                             most_profitable=ranked[::-1][:TOP], least_profitable=ranked[:TOP])


def liquidity(session: Session, user, aging) -> LiquidityRead:
    banks = repo.get_active_banks(session)
    bank_total = round(sum(float(b.current_balance or 0.0) for b in banks), 2)
    valuation = inventory_valuation_service.get_valuation_summary(session, user)
    payable = payable_report_service.dashboard_stats(session)
    payable_lines = [AmountLine(label="Vencido y por vencer al viernes", amount=round(payable.overdue_amount, 2)),
                     AmountLine(label="Siguientes 15 días", amount=round(payable.next_period_amount, 2)),
                     AmountLine(label="Después", amount=round(payable.future_amount, 2))]
    payables = round(sum(line.amount for line in payable_lines), 2)
    inventory_lines = [AmountLine(label="Materia prima", amount=valuation["raw_materials"]),
                       AmountLine(label="Producción en proceso", amount=valuation["work_in_progress"]),
                       AmountLine(label="Producto terminado", amount=valuation["finished_goods"])]
    return LiquidityRead(
        banks=bank_total, bank_lines=[AmountLine(label=b.name, amount=round(float(b.current_balance or 0.0), 2))
                                      for b in banks],
        receivables=aging.total_pending,
        receivable_lines=[AmountLine(label=AGE_LABELS[k], amount=v) for k, v in aging.breakdown.items()],
        inventory=valuation["total"], inventory_lines=inventory_lines, payables=payables, payable_lines=payable_lines,
        net=round(bank_total + aging.total_pending + valuation["total"] - payables, 2))


def receivables(session: Session, aging) -> ReceivablesRead:
    income = analytics_service.get_cash_flow_projection(session).expected_income
    return ReceivablesRead(pending=aging.total_pending, documents=aging.count,
                           cash_flow_income=round(sum(e.amount for e in income), 2))


def clients_by_sales(rows: List[OrderMarginRead], orders) -> List[ClientSalesRead]:
    client_of = {o.id: o.client_id for o in orders}
    totals: Dict[int, dict] = defaultdict(lambda: {"name": "—", "orders": 0, "sales": 0.0,
                                                   "costed": [0.0, 0.0, 0.0, 0.0]})
    for r in rows:
        t = totals[client_of[r.order_id]]
        t["name"], t["orders"] = r.client_name, t["orders"] + 1
        t["sales"] += r.sales_without_tax
        if r.net_margin_percent is not None:  # the margin only counts OVs with cost
            t["costed"] = [a + b for a, b in zip(t["costed"], (r.sales_without_tax, r.cost, r.commission,
                                                                     r.global_commission))]
    result = [ClientSalesRead(client_id=cid, client_name=t["name"], orders=t["orders"],
                              sales_without_tax=round(t["sales"], 2), net_margin_percent=_margin(*t["costed"]))
              for cid, t in totals.items()]
    return sorted(result, key=lambda c: c.sales_without_tax, reverse=True)


def clients_by_payment_speed(session: Session, year: int) -> List[ClientPaymentSpeedRead]:
    """Days from invoice to collection, weighted by the amount of each installment collected in the year."""
    totals: Dict[int, List[float]] = defaultdict(lambda: [0.0, 0.0])
    for client_id, invoiced_on, amount, collected_on in repo.get_year_collections(session, year):
        if not invoiced_on or not collected_on or not amount:
            continue
        days = max((collected_on.date() - invoiced_on.date()).days, 0)
        totals[client_id][0] += float(amount)
        totals[client_id][1] += float(amount) * days
    names = repo.get_client_names(session, totals.keys())
    result = [ClientPaymentSpeedRead(client_id=cid, client_name=names.get(cid, "—"), collected=round(amt, 2),
                                     avg_days_to_collect=round(weighted / amt, 1))
              for cid, (amt, weighted) in totals.items() if amt > 0]
    return sorted(result, key=lambda c: (c.avg_days_to_collect, -c.collected))


def _stone_share(item, categories: Dict[int, str]) -> Optional[float]:
    """Share of the recipe's frozen cost that is stone (stone material and its processes); None without recipe."""
    ingredients = (item.cost_snapshot or {}).get("ingredients") or []
    total = sum(float(i.get("line_total") or 0.0) for i in ingredients)
    if total <= 0:
        return None
    stone = sum(float(i.get("line_total") or 0.0) for i in ingredients
                if i.get("sku") in STONE_PROCESS_SKUS
                or material_groups.normalize(categories.get(i.get("material_id"))) in material_groups.MAIN_STONE)
    return stone / total


def sales_by_lane(session: Session, orders, items_by_order, global_rate: float = 0.0) -> List[LaneSalesRead]:
    """Each recipe line splits between MDF and Piedra by the stone share of its frozen cost; commissions follow sales."""
    all_items = [i for items in items_by_order.values() for i in items]
    categories = repo.get_material_categories(session, (ing.get("material_id") for i in all_items
                                                        for ing in (i.cost_snapshot or {}).get("ingredients") or []))
    lanes: Dict[str, List[float]] = defaultdict(lambda: [0.0, 0.0, 0.0, 0.0])
    for order in orders:
        items = items_by_order.get(order.id, [])
        items_sales = sum(float(i.subtotal_price or 0.0) for i in items)
        for item in items:
            sales, cost = float(item.subtotal_price or 0.0), float(item.frozen_unit_cost or 0.0) * float(item.quantity)
            commission = float(order.commission_amount or 0.0) * (sales / items_sales if items_sales else 0.0)
            share = _stone_share(item, categories)
            parts = [(LANE_NONE, 1.0)] if share is None else [(LANE_MDF, 1 - share), (LANE_STONE, share)]
            for lane, part in parts:
                lanes[lane][0] += sales * part
                lanes[lane][1] += cost * part
                lanes[lane][2] += commission * part
                lanes[lane][3] += sales * global_rate * part
    return [LaneSalesRead(lane=lane, sales_without_tax=round(s, 2), cost=round(c, 2), commission=round(m, 2),
                          global_commission=round(g, 2),
                          net_margin_percent=_margin(s, c, m, g) if lane != LANE_NONE else None)
            for lane, (s, c, m, g) in sorted(lanes.items(), key=lambda kv: [LANE_MDF, LANE_STONE, LANE_NONE].index(kv[0]))
            if s or c]


def get_summary(session: Session, user, year: Optional[int] = None) -> DirectorSummaryRead:
    year = year or today_local().year
    orders = repo.get_sold_orders(session, year)
    items_by_order: Dict[int, list] = defaultdict(list)
    for item in repo.get_active_items(session, (o.id for o in orders)):
        items_by_order[item.sales_order_id].append(item)
    global_rate = global_commission_rate(session)
    rows = _order_rows(session, orders, items_by_order, global_rate)
    aging = analytics_service.get_cxc_aging(session)
    by_sales = clients_by_sales(rows, orders)
    by_margin = sorted((c for c in by_sales if c.net_margin_percent is not None),
                       key=lambda c: c.net_margin_percent, reverse=True)
    return DirectorSummaryRead(
        sales=sales_kpi(session, rows, year), liquidity=liquidity(session, user, aging),
        profitability=profitability(rows), receivables=receivables(session, aging),
        top_clients=TopClientsRead(by_sales=by_sales, by_margin=by_margin,
                                   by_payment_speed=clients_by_payment_speed(session, year),
                                   by_lane=sales_by_lane(session, orders, items_by_order, global_rate)))
