from datetime import date, datetime, timedelta
from typing import Any, Dict, List, Tuple

from sqlalchemy import text
from sqlmodel import Session, func, select

from app.models.finance import InvoiceStatus, PurchaseInvoice, SupplierPayment, PaymentStatus
from app.models.foundations import Client
from app.models.sales import SalesOrder, SalesOrderItem, SalesOrderStatus
from app.models.treasury import BankAccount, WeeklyFixedCost
from app.repositories import sales_repository as sales_repo
from app.schemas.analytics_schema import (
    CashFlowEntry,
    CashFlowProjection,
    CxcAgingStats,
    OrderProfitabilityItem,
    TopClientItem,
)

_PROFIT_STATUSES = (
    SalesOrderStatus.SOLD,
    SalesOrderStatus.IN_PRODUCTION,
    SalesOrderStatus.FINISHED,
    SalesOrderStatus.COMPLETED,
)
_TOP_CLIENT_STATUSES = (SalesOrderStatus.COMPLETED, SalesOrderStatus.FINISHED)


def _order_folio(order_id: int) -> str:
    return f"OV-{str(order_id).zfill(4)}"


def _margin_percent(total_price: float, estimated_cost: float) -> float:
    if total_price <= 0:
        return 0.0
    return round(((total_price - estimated_cost) / total_price) * 100, 2)


def _aging_bucket(days: int) -> str:
    if days <= 30:
        return "0-30"
    if days <= 60:
        return "31-60"
    if days <= 90:
        return "61-90"
    return "+90"


def get_cxc_aging(session: Session) -> CxcAgingStats:
    today = date.today()
    breakdown = {"0-30": 0.0, "31-60": 0.0, "61-90": 0.0, "+90": 0.0}
    total_pending = 0.0
    count = 0
    for cxc in sales_repo.get_pending_cxc(session):
        paid = sales_repo.sum_active_installments(session, cxc.id)
        balance = round(float(cxc.amount or 0.0) - paid, 2)
        if balance <= 0.01:
            continue
        inv_date = cxc.invoice_date.date() if cxc.invoice_date else today
        days = max((today - inv_date).days, 0)
        breakdown[_aging_bucket(days)] += balance
        total_pending += balance
        count += 1
    return CxcAgingStats(
        total_pending=round(total_pending, 2),
        breakdown={k: round(v, 2) for k, v in breakdown.items()},
        count=count,
    )


def _fetch_order_cost_rows(session: Session, statuses: Tuple[Any, ...]):
    return session.exec(
        select(
            SalesOrder.id,
            SalesOrder.total_price,
            Client.full_name,
            func.coalesce(func.sum(SalesOrderItem.frozen_unit_cost * SalesOrderItem.quantity), 0.0),
        )
        .join(Client, SalesOrder.client_id == Client.id)
        .outerjoin(SalesOrderItem, SalesOrderItem.sales_order_id == SalesOrder.id)
        .where(SalesOrder.status.in_(statuses))
        .group_by(SalesOrder.id, SalesOrder.total_price, Client.full_name)
    ).all()


def get_order_profitability(session: Session) -> List[OrderProfitabilityItem]:
    rows = _fetch_order_cost_rows(session, _PROFIT_STATUSES)
    ranked: List[OrderProfitabilityItem] = []
    for order_id, total_price, client_name, estimated_cost in rows:
        total = float(total_price or 0.0)
        cost = float(estimated_cost or 0.0)
        ranked.append(
            OrderProfitabilityItem(
                order_id=int(order_id),
                folio=_order_folio(int(order_id)),
                client_name=client_name or "—",
                total_price=round(total, 2),
                estimated_cost=round(cost, 2),
                margin_percent=_margin_percent(total, cost),
            )
        )
    ranked.sort(key=lambda x: x.margin_percent, reverse=True)
    if len(ranked) <= 20:
        return ranked
    worst = sorted(ranked, key=lambda x: x.margin_percent)[:10]
    best_ids = {item.order_id for item in ranked[:10]}
    combined = ranked[:10] + [item for item in worst if item.order_id not in best_ids]
    return combined[:20]


def _bank_balance(session: Session) -> float:
    val = session.exec(
        select(func.coalesce(func.sum(BankAccount.current_balance), 0.0)).where(
            BankAccount.is_active == True  # noqa: E712
        )
    ).one()
    return round(float(val or 0.0), 2)


def _weekly_payroll_avg(session: Session) -> float:
    cutoff = date.today() - timedelta(weeks=4)
    rows = session.exec(
        select(WeeklyFixedCost).where(WeeklyFixedCost.week_reference_date >= cutoff)
    ).all()
    if not rows:
        return 0.0
    totals = [
        float(r.admin_payroll or 0.0)
        + float(r.design_sales_payroll or 0.0)
        + float(r.production_plant_payroll or 0.0)
        for r in rows
    ]
    return round(sum(totals) / len(totals), 2)


def _opex_daily_avg(session: Session) -> float:
    start = (date.today() - timedelta(days=30)).isoformat()
    row = session.exec(
        text(
            """
            SELECT COALESCE(SUM(total_amount), 0.0)
            FROM accounts_payable
            WHERE DATE(created_at) >= :start_date
              AND (overhead_category != :maquila OR overhead_category IS NULL)
            """
        ).bindparams(start_date=start, maquila="MAQUILA")
    ).one()
    total = float(row[0] or 0.0)
    return round(total / 30.0, 2)


def _build_cxc_income(session: Session) -> List[CashFlowEntry]:
    items: List[CashFlowEntry] = []
    for cxc in sales_repo.get_pending_cxc(session):
        paid = sales_repo.sum_active_installments(session, cxc.id)
        balance = round(float(cxc.amount or 0.0) - paid, 2)
        if balance <= 0.01:
            continue
        inv_dt = cxc.invoice_date or datetime.utcnow()
        ref = cxc.invoice_folio or f"CXC-{cxc.id}"
        items.append(CashFlowEntry(date=inv_dt.date().isoformat(), amount=balance, reference=ref))
    return items


def _build_cxp_expenses(session: Session) -> List[CashFlowEntry]:
    items: List[CashFlowEntry] = []
    invoices = session.exec(
        select(PurchaseInvoice).where(
            PurchaseInvoice.status != InvoiceStatus.PAID,
            PurchaseInvoice.status != InvoiceStatus.CANCELLED,
            PurchaseInvoice.outstanding_balance > 0,
        )
    ).all()
    for inv in invoices:
        due = inv.due_date or date.today()
        items.append(
            CashFlowEntry(
                date=due.isoformat(),
                amount=round(float(inv.outstanding_balance or 0.0), 2),
                reference=inv.invoice_number or f"CXP-{inv.id}",
            )
        )
    pending_payments = session.exec(
        select(SupplierPayment).where(
            SupplierPayment.status.in_([PaymentStatus.PENDING, PaymentStatus.APPROVED])
        )
    ).all()
    for pay in pending_payments:
        pay_dt = pay.payment_date.date() if pay.payment_date else date.today()
        items.append(
            CashFlowEntry(
                date=pay_dt.isoformat(),
                amount=round(float(pay.amount or 0.0), 2),
                reference=pay.reference or f"PAGO-{pay.id}",
            )
        )
    return items


def _project_horizon(
    current_balance: float,
    income: List[CashFlowEntry],
    expenses: List[CashFlowEntry],
    payroll_weekly: float,
    opex_daily: float,
    days: int,
) -> float:
    horizon = date.today() + timedelta(days=days)
    inc = sum(item.amount for item in income if date.fromisoformat(item.date) <= horizon)
    exp = sum(item.amount for item in expenses if date.fromisoformat(item.date) <= horizon)
    recurring = payroll_weekly * (days / 7.0) + opex_daily * days
    return round(current_balance + inc - exp - recurring, 2)


def get_cash_flow_projection(session: Session) -> CashFlowProjection:
    current = _bank_balance(session)
    income = _build_cxc_income(session)
    expenses = _build_cxp_expenses(session)
    payroll_weekly = _weekly_payroll_avg(session)
    opex_daily = _opex_daily_avg(session)
    return CashFlowProjection(
        current_balance=current,
        projection_30=_project_horizon(current, income, expenses, payroll_weekly, opex_daily, 30),
        projection_60=_project_horizon(current, income, expenses, payroll_weekly, opex_daily, 60),
        projection_90=_project_horizon(current, income, expenses, payroll_weekly, opex_daily, 90),
        expected_income=income,
        committed_expenses=expenses,
    )


def get_top_clients(session: Session) -> List[TopClientItem]:
    year_start = datetime(date.today().year, 1, 1)
    rows = session.exec(
        select(
            SalesOrder.client_id,
            Client.full_name,
            func.count(SalesOrder.id),
            func.coalesce(func.sum(SalesOrder.total_price), 0.0),
            func.coalesce(func.sum(SalesOrderItem.frozen_unit_cost * SalesOrderItem.quantity), 0.0),
        )
        .join(Client, SalesOrder.client_id == Client.id)
        .outerjoin(SalesOrderItem, SalesOrderItem.sales_order_id == SalesOrder.id)
        .where(
            SalesOrder.status.in_(_TOP_CLIENT_STATUSES),
            SalesOrder.created_at >= year_start,
        )
        .group_by(SalesOrder.client_id, Client.full_name, SalesOrder.id, SalesOrder.total_price)
    ).all()
    grouped: Dict[int, Dict[str, Any]] = {}
    for client_id, client_name, _count, total_price, item_cost in rows:
        cid = int(client_id)
        bucket = grouped.setdefault(
            cid,
            {"client_name": client_name or "—", "orders": 0, "revenue": 0.0, "margins": []},
        )
        bucket["orders"] += 1
        revenue = float(total_price or 0.0)
        cost = float(item_cost or 0.0)
        bucket["revenue"] += revenue
        bucket["margins"].append(_margin_percent(revenue, cost))
    result = [
        TopClientItem(
            client_id=cid,
            client_name=data["client_name"],
            total_orders=int(data["orders"]),
            total_revenue=round(float(data["revenue"]), 2),
            avg_margin_percent=round(sum(data["margins"]) / len(data["margins"]), 2)
            if data["margins"]
            else 0.0,
        )
        for cid, data in grouped.items()
    ]
    result.sort(key=lambda x: x.total_revenue, reverse=True)
    return result[:10]
