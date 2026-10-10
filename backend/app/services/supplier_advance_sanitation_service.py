"""Sanitation tool 2 (docs/SANEAMIENTO.md §4.1): supplier advance invoices that a reception marked PAID although
nothing was paid. The reception invoice already charged their full amount, so they are CANCELLED (absorbed) with a
reason, and their open payment requests are rejected so they can never be paid; money and bank are not touched.
New receptions already close them this way."""
from typing import List

from sqlmodel import Session

from app.core.audit_context import audit_reason
from app.models.finance import InvoiceStatus, PaymentStatus
from app.repositories import balance_recalc_repository as repo
from app.schemas.supplier_advance_schema import UnpaidAdvanceApply, UnpaidAdvanceRead, UnpaidAdvanceResultRead


def preview(session: Session) -> List[UnpaidAdvanceRead]:
    invoices = repo.get_paid_advance_invoices_without_payment(session)
    names = repo.provider_names(session, [i.provider_id for i in invoices])
    open_payments = repo.get_open_supplier_payments(session, [i.id for i in invoices])
    return [UnpaidAdvanceRead(invoice_id=i.id, invoice_number=i.invoice_number, provider_name=names.get(i.provider_id),
                              total_amount=round(float(i.total_amount or 0.0), 2), issue_date=i.issue_date,
                              open_payments=sum(1 for p in open_payments if p.purchase_invoice_id == i.id))
            for i in invoices]


def apply(session: Session, data: UnpaidAdvanceApply) -> UnpaidAdvanceResultRead:
    current = {i.id: i for i in repo.get_paid_advance_invoices_without_payment(session)}
    skipped = [f"Factura {i}: ya no aplica" for i in data.invoice_ids if i not in current]
    targets = [current[i] for i in data.invoice_ids if i in current]
    with audit_reason(f"Anticipo sin pago absorbido en la recepción: {data.reason.strip()}"):
        for invoice in targets:
            invoice.status = InvoiceStatus.CANCELLED
            invoice.outstanding_balance = 0
            session.add(invoice)
        for payment in repo.get_open_supplier_payments(session, [i.id for i in targets]):
            payment.status = PaymentStatus.REJECTED
            payment.notes = "Rechazado: el anticipo se absorbió en la factura de la recepción."
            session.add(payment)
        session.commit()
    return UnpaidAdvanceResultRead(updated=len(targets), skipped=skipped)
