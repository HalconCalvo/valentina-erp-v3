"""Sanitation tool 1 (docs/SANEAMIENTO.md §6.1): customer invoice states and sales order balances from the money.

- Invoice balance = amount − advance amortized − active payments (abonos) − active credit notes.
  PAID when the balance is at most one cent; PENDING otherwise. An amortized advance larger than the invoice is
  reported as an anomaly and never fixed here.
- Sales order balance = total − active payments of its non-cancelled invoices (D14, recommendation applied).
  FINISHED ("Pagada, saldo cero") when the balance is at most 0.10; a FINISHED order with balance goes back to SOLD.
The preview shows before → after; applying requires DIRECTOR or MANAGER and a reason, recomputes from current data
(rows that no longer differ are skipped) and leaves every change in the change log. Commissions are not touched.
"""
from typing import Dict, List, Tuple

from sqlmodel import Session

from app.core.audit_context import audit_reason
from app.models.sales import CXCStatus, SalesOrderStatus
from app.repositories import balance_recalc_repository as repo
from app.schemas.balance_recalc_schema import (
    BalanceRecalcApply, BalanceRecalcPreviewRead, BalanceRecalcResultRead, InvoiceStatusFixRead,
    OrderBalanceFixRead, RecalcAnomalyRead,
)

INVOICE_TOLERANCE = 0.01
ORDER_TOLERANCE = 0.10
BALANCE_DIFF = 0.05
OPEN_STATUSES = {SalesOrderStatus.WAITING_ADVANCE, SalesOrderStatus.SOLD, SalesOrderStatus.IN_PRODUCTION,
                 SalesOrderStatus.FINISHED, SalesOrderStatus.COMPLETED}
CAN_FINISH = {SalesOrderStatus.SOLD, SalesOrderStatus.IN_PRODUCTION}


def order_folio(order_id: int) -> str:
    return f"OV-{order_id:04d}"


def _value(status) -> str:
    return status.value if hasattr(status, "value") else str(status)


def invoice_new_status(balance: float) -> CXCStatus:
    return CXCStatus.PAID if balance <= INVOICE_TOLERANCE else CXCStatus.PENDING


def order_new_status(status: SalesOrderStatus, balance: float) -> SalesOrderStatus:
    if balance <= ORDER_TOLERANCE and status in CAN_FINISH:
        return SalesOrderStatus.FINISHED
    if balance > ORDER_TOLERANCE and status == SalesOrderStatus.FINISHED:
        return SalesOrderStatus.SOLD
    return status


def _invoice_rows(session: Session) -> Tuple[List[InvoiceStatusFixRead], List[RecalcAnomalyRead]]:
    collected, credited = repo.collected_by_invoice(session), repo.credited_by_invoice(session)
    fixes, anomalies = [], []
    for cxc in repo.get_active_invoices(session):
        amount, amortized = float(cxc.amount or 0.0), float(cxc.amortized_advance or 0.0)
        if amortized > amount + INVOICE_TOLERANCE:
            anomalies.append(RecalcAnomalyRead(
                cxc_id=cxc.id, sales_order_id=cxc.sales_order_id, order_folio=order_folio(cxc.sales_order_id),
                message=f"Factura {cxc.invoice_folio or cxc.id}: anticipo amortizado ${amortized:,.2f} mayor que "
                        f"la factura ${amount:,.2f}. Corregir la factura (Rayos X)."))
            continue
        paid, notes = collected.get(cxc.id, 0.0), credited.get(cxc.id, 0.0)
        balance = round(amount - amortized - paid - notes, 2)
        new_status = invoice_new_status(balance)
        if new_status != cxc.status:
            fixes.append(InvoiceStatusFixRead(
                cxc_id=cxc.id, sales_order_id=cxc.sales_order_id, order_folio=order_folio(cxc.sales_order_id),
                invoice_folio=cxc.invoice_folio, payment_type=_value(cxc.payment_type), amount=round(amount, 2),
                amortized_advance=round(amortized, 2), collected=round(paid, 2), credited=round(notes, 2),
                balance=balance, status=_value(cxc.status), new_status=new_status.value))
    return fixes, anomalies


def _collected_by_order(session: Session) -> Dict[int, float]:
    collected = repo.collected_by_invoice(session)
    totals: Dict[int, float] = {}
    for cxc in repo.get_active_invoices(session):
        totals[cxc.sales_order_id] = totals.get(cxc.sales_order_id, 0.0) + collected.get(cxc.id, 0.0)
    return totals


def _order_rows(session: Session) -> List[OrderBalanceFixRead]:
    collected = _collected_by_order(session)
    orders = repo.get_orders_by_status(session, OPEN_STATUSES)
    names = repo.client_names(session, [o.client_id for o in orders])
    rows = []
    for order in orders:
        paid = collected.get(order.id, 0.0)
        computed = round(float(order.total_price or 0.0) - paid, 2)
        stored = round(float(order.outstanding_balance or 0.0), 2)
        new_status = order_new_status(order.status, computed)
        if abs(stored - computed) > BALANCE_DIFF or new_status != order.status:
            rows.append(OrderBalanceFixRead(
                sales_order_id=order.id, order_folio=order_folio(order.id), project_name=order.project_name,
                client_name=names.get(order.client_id), is_legacy=bool(order.is_legacy),
                total_price=round(float(order.total_price or 0.0), 2), collected=round(paid, 2),
                stored_balance=stored, computed_balance=computed, status=_value(order.status),
                new_status=new_status.value))
    return rows


def preview(session: Session) -> BalanceRecalcPreviewRead:
    invoices, anomalies = _invoice_rows(session)
    return BalanceRecalcPreviewRead(invoices=invoices, orders=_order_rows(session), anomalies=anomalies)


def _apply_invoices(session: Session, rows: Dict[int, InvoiceStatusFixRead], ids: List[int]) -> int:
    last_dates = repo.last_installment_date_by_invoice(session)
    invoices = {cxc.id: cxc for cxc in repo.get_active_invoices(session) if cxc.id in rows and cxc.id in ids}
    for cxc_id, cxc in invoices.items():
        cxc.status = CXCStatus(rows[cxc_id].new_status)
        cxc.payment_date = last_dates.get(cxc_id) if cxc.status == CXCStatus.PAID else None
        session.add(cxc)
    return len(invoices)


def _apply_orders(session: Session, rows: Dict[int, OrderBalanceFixRead], ids: List[int]) -> int:
    orders = [o for o in repo.get_orders_by_status(session, OPEN_STATUSES) if o.id in rows and o.id in ids]
    for order in orders:
        order.outstanding_balance = rows[order.id].computed_balance
        order.status = SalesOrderStatus(rows[order.id].new_status)
        session.add(order)
    return len(orders)


def apply(session: Session, data: BalanceRecalcApply) -> BalanceRecalcResultRead:
    current = preview(session)
    invoice_rows = {row.cxc_id: row for row in current.invoices}
    order_rows = {row.sales_order_id: row for row in current.orders}
    skipped = [f"Factura {i}: ya no tiene diferencia" for i in data.invoice_ids if i not in invoice_rows]
    skipped += [f"{order_folio(i)}: ya no tiene diferencia" for i in data.order_ids if i not in order_rows]
    with audit_reason(f"Saneamiento de saldos: {data.reason.strip()}"):
        invoices = _apply_invoices(session, invoice_rows, data.invoice_ids)
        orders = _apply_orders(session, order_rows, data.order_ids)
        session.commit()
    return BalanceRecalcResultRead(invoices_updated=invoices, orders_updated=orders, skipped=skipped)
