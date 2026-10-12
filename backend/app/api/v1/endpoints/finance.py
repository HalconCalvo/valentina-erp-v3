"""Accounts payable: payment requests, approval and execution, invoice cancellation, dashboard, lists, credit notes."""
from typing import Any, List

from fastapi import APIRouter

from app.core.deps import CurrentUser, SessionDep
from app.core.permissions import FINANCE_ROLES, allow, allow_payment_execution
from app.models.finance import PaymentStatus
from app.schemas.finance_schema import (AccountsPayableDashboardStats, CreditNoteCreate, CreditNoteRead,
                                        PaymentApprovalUpdate, PaymentRequestCancel, PaymentRequestCreate,
                                        PendingInvoiceRead, SupplierPaymentRead)
from app.services import payable_report_service as reports
from app.services import payable_service, supplier_credit_note_service, supplier_payment_service as payments

router = APIRouter()


@router.post("/payments/request", response_model=SupplierPaymentRead, dependencies=[allow(FINANCE_ROLES)])
def request_supplier_payment(*, session: SessionDep, current_user: CurrentUser, payment_in: PaymentRequestCreate) -> Any:
    return payments.request_payment(session, payment_in, current_user)


@router.put("/payments/request/{payment_id}", response_model=SupplierPaymentRead, dependencies=[allow(FINANCE_ROLES)])
def update_payment_request(*, session: SessionDep, payment_id: int, payment_in: PaymentRequestCreate) -> Any:
    return payments.update_request(session, payment_id, payment_in)


@router.put("/invoices/{invoice_id}/cancel", dependencies=[allow(FINANCE_ROLES)])
def cancel_invoice(invoice_id: int, session: SessionDep) -> Any:
    return payments.cancel_invoice(session, invoice_id)


@router.patch("/payments/request/{payment_id}/cancel", response_model=SupplierPaymentRead)
def cancel_payment_request(*, session: SessionDep, current_user: CurrentUser, payment_id: int,
                           data: PaymentRequestCancel) -> Any:
    return payable_service.cancel_payment_request(session, payment_id, data, current_user)


@router.put("/payments/{payment_id}/status", response_model=SupplierPaymentRead)
def update_payment_status(*, session: SessionDep, current_user: CurrentUser, payment_id: int,
                          status_in: PaymentApprovalUpdate) -> Any:
    return payments.decide_request(session, payment_id, status_in, current_user)


@router.post("/payments/{payment_id}/execute", response_model=SupplierPaymentRead,
             dependencies=[allow_payment_execution()])
def execute_supplier_payment(*, session: SessionDep, payment_id: int) -> Any:
    return payments.execute_payment(session, payment_id)


@router.get("/payable-stats", response_model=AccountsPayableDashboardStats, dependencies=[allow(FINANCE_ROLES)])
def get_payable_dashboard_stats(session: SessionDep) -> Any:
    return reports.dashboard_stats(session)


@router.get("/payments/pending-approvals", response_model=List[SupplierPaymentRead],
            dependencies=[allow(FINANCE_ROLES)])
def get_pending_approvals(session: SessionDep) -> Any:
    return reports.payments_by_status(session, PaymentStatus.PENDING)


@router.get("/payments/approved", response_model=List[SupplierPaymentRead], dependencies=[allow(FINANCE_ROLES)])
def get_approved_payments(session: SessionDep) -> Any:
    return reports.payments_by_status(session, PaymentStatus.APPROVED)


@router.get("/invoices/pending", response_model=List[PendingInvoiceRead], dependencies=[allow(FINANCE_ROLES)])
def get_pending_invoices(session: SessionDep) -> Any:
    return reports.pending_invoices(session)


@router.get("/invoices/{purchase_invoice_id}/received-items", dependencies=[allow(FINANCE_ROLES)])
def get_invoice_received_items(purchase_invoice_id: int, session: SessionDep) -> Any:
    return reports.received_items(session, purchase_invoice_id)


@router.post("/credit-notes", response_model=CreditNoteRead)
def create_credit_note(*, session: SessionDep, current_user: CurrentUser, data: CreditNoteCreate) -> Any:
    return supplier_credit_note_service.create_credit_note(session, data, current_user)
