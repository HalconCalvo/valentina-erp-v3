"""Accounts payable screens: dashboard cards, request lists, open invoices and what each invoice received.

Before the dashboard and the open invoice list, `sync_payables_to_invoices` cancels the invoices of cancelled
purchase orders and creates the invoice of every payable the warehouse already received.
"""
from datetime import date, datetime, timedelta
from typing import List, Optional

from fastapi import HTTPException
from sqlmodel import Session

from app.models.finance import InvoiceStatus, PaymentStatus, PurchaseInvoice
from app.models.foundations import Provider
from app.models.inventory import PurchaseOrder
from app.repositories import supplier_payment_repository as repo
from app.schemas.finance_schema import AccountsPayableDashboardStats, PendingInvoiceRead, SupplierPaymentRead
from app.services import payable_service
from app.services.purchase_service import resolve_po_authorizer_display, resolve_po_authorizer_user
from app.services.supplier_payment_service import clean_invoice_folio, reject_pending_requests

DEAD_PO_STATUSES = ["CANCELADA", "RECHAZADA", "DRAFT"]


def _cancel_invoices_of_dead_orders(session: Session) -> None:
    for invoice in repo.get_open_invoices(session):
        if not invoice.invoice_number:
            continue
        folio = clean_invoice_folio(invoice.invoice_number)
        po = repo.get_po_by_folio(session, folio)
        if po and po.status in DEAD_PO_STATUSES:
            invoice.status = InvoiceStatus.CANCELLED
            invoice.outstanding_balance = 0
            session.add(invoice)
            reject_pending_requests(session, invoice.id, "Cancelado automáticamente por anulación de la Orden de Compra.")
            payable_service.set_status_by_folio(session, folio, payable_service.PAYABLE_CANCELLED, invoice.provider_id)


def _due_date(due, today: date) -> date:
    if isinstance(due, str):
        try:
            return datetime.strptime(due[:10], "%Y-%m-%d").date()
        except ValueError:
            return today
    if due:
        return due if hasattr(due, "year") else today
    return today


def _create_received_invoices(session: Session) -> None:
    """Only payables the warehouse already received exist in accounts_payable as PENDIENTE."""
    today = datetime.now().date()
    for ap_id, provider_id, folio, amount, due, subtotal, tax_rate, tax_amount in repo.get_pending_payable_rows(session):
        if amount is None or amount <= 0:
            continue
        number = folio if folio else f"AP-{ap_id}"
        if repo.get_live_invoice_by_number(session, number, provider_id):
            continue
        session.add(PurchaseInvoice(
            provider_id=provider_id, invoice_number=number, issue_date=today, due_date=_due_date(due, today),
            total_amount=amount, outstanding_balance=amount, status=InvoiceStatus.PENDING,
            subtotal=(subtotal or 0.0), tax_rate=(tax_rate if tax_rate is not None else 0.16),
            tax_amount=(tax_amount or 0.0), accounts_payable_id=ap_id))


def sync_payables_to_invoices(session: Session) -> None:
    _cancel_invoices_of_dead_orders(session)
    _create_received_invoices(session)
    session.commit()


def dashboard_stats(session: Session) -> AccountsPayableDashboardStats:
    """Open balance due by this Friday, in the next 15 days after it, and later."""
    sync_payables_to_invoices(session)
    today = date.today()
    cutoff = today + timedelta(days=(4 - today.weekday()) % 7)
    next_limit = cutoff + timedelta(days=15)
    buckets = {"overdue": [0.0, 0], "next_period": [0.0, 0], "future": [0.0, 0]}
    for invoice in repo.get_open_invoices(session):
        if invoice.outstanding_balance <= 0:
            continue
        due = invoice.due_date if invoice.due_date else today
        key = "overdue" if due <= cutoff else "next_period" if due <= next_limit else "future"
        buckets[key][0] += float(invoice.outstanding_balance)
        buckets[key][1] += 1
    return AccountsPayableDashboardStats(
        overdue_amount=buckets["overdue"][0], overdue_count=buckets["overdue"][1],
        next_period_amount=buckets["next_period"][0], next_period_count=buckets["next_period"][1],
        future_amount=buckets["future"][0], future_count=buckets["future"][1],
        total_pending_approval=repo.count_payments_by_status(session, PaymentStatus.PENDING))


def payments_by_status(session: Session, status: PaymentStatus) -> List[SupplierPaymentRead]:
    results = []
    for p in repo.get_payments_by_status(session, status):
        provider = session.get(Provider, p.provider_id)
        invoice = session.get(PurchaseInvoice, p.purchase_invoice_id)
        results.append(SupplierPaymentRead(
            id=p.id, purchase_invoice_id=p.purchase_invoice_id, provider_id=p.provider_id,
            provider_name=provider.business_name if provider else "Desconocido",
            invoice_folio=clean_invoice_folio(invoice.invoice_number) if invoice else "S/N",
            amount=p.amount, payment_date=p.payment_date, payment_method=p.payment_method,
            suggested_account_id=p.suggested_account_id, approved_account_id=p.approved_account_id,
            treasury_transaction_id=p.treasury_transaction_id, reference=p.reference, notes=p.notes,
            status=p.status, created_at=p.created_at))
    return results


def _expense_notes(session: Session, folio: str) -> Optional[str]:
    """Notes of an operational expense (folio GASTO-…); None if it does not apply or is empty."""
    if not folio or not folio.upper().startswith("GASTO-"):
        return None
    notes = repo.get_expense_notes(session, folio)
    if notes is None:
        return None
    return str(notes).strip() or None


def _invoice_po(session: Session, folio: str) -> Optional[PurchaseOrder]:
    po = repo.get_po_by_folio(session, folio)
    if not po:
        po_id = repo.get_payable_po_id(session, folio)
        po = session.get(PurchaseOrder, po_id) if po_id else None
    return po


def _po_items(session: Session, po: Optional[PurchaseOrder]) -> list:
    if not po:
        return []
    return [{"description": row[0] or "Material S/N", "qty": row[1] or 0, "price": row[2] or 0, "sku": row[3] or "S/SKU"}
            for row in repo.get_po_item_rows(session, po.id)]


def _authorized_by(session: Session, folio: str) -> Optional[str]:
    po_id = repo.get_payable_po_id(session, folio)
    po = session.get(PurchaseOrder, po_id) if po_id else None
    return resolve_po_authorizer_display(session, po) if po else None


def _authorizer_name(session: Session, po: Optional[PurchaseOrder]) -> Optional[str]:
    user = resolve_po_authorizer_user(session, po) if po else None
    return (user.full_name or user.email) if user else None


def _pending_invoice_row(session: Session, invoice: PurchaseInvoice) -> PendingInvoiceRead:
    folio = clean_invoice_folio(invoice.invoice_number)
    po = _invoice_po(session, folio) if invoice.invoice_number else None
    provider = session.get(Provider, invoice.provider_id)
    return PendingInvoiceRead(
        id=invoice.id, provider_name=provider.business_name if provider else "Prov.", invoice_number=folio,
        due_date=invoice.due_date, issue_date=invoice.issue_date, total_amount=invoice.total_amount,
        outstanding_balance=invoice.outstanding_balance, items=_po_items(session, po),
        po_folio=po.folio if po else None, authorized_by=_authorized_by(session, folio),
        po_authorizer_name=_authorizer_name(session, po), po_authorized_at=po.authorized_at if po else None,
        expense_notes=_expense_notes(session, folio if invoice.invoice_number else ""))


def pending_invoices(session: Session) -> List[PendingInvoiceRead]:
    sync_payables_to_invoices(session)
    rows = [_pending_invoice_row(session, invoice) for invoice in repo.get_open_invoices(session)
            if invoice.outstanding_balance > 0]
    rows.sort(key=lambda row: str(row.due_date))
    return rows


def received_items(session: Session, invoice_id: int) -> list:
    """What each delivery of the invoice received (purchase_invoice_items); empty for invoices before Camino B."""
    invoice = session.get(PurchaseInvoice, invoice_id)
    if not invoice:
        raise HTTPException(status_code=404, detail="Factura no encontrada")
    folio = clean_invoice_folio(invoice.invoice_number) if invoice.invoice_number else ""
    if not folio:
        return []
    return [{"sku": r[0], "description": r[1], "quantity_received": r[2], "unit_cost": r[3], "material_id": r[4],
             "purchase_order_item_id": r[5], "accounts_payable_id": r[6],
             "line_total": float(r[2] or 0) * float(r[3] or 0)} for r in repo.get_received_item_rows(session, folio)]
