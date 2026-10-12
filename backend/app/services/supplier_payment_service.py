"""Supplier payments: request (Fast-Track when the user can pay), edit, approve or reject, execute; cancel an invoice.

Approving never moves money; executing does (bank movement, account and invoice balance, purchase order or payable
marked paid). D7: Fast-Track pays only when the user can execute payments; otherwise it stays a request.
"""
from fastapi import HTTPException
from sqlmodel import Session

from app.core.permissions import can_execute_payments, require_roles
from app.models.finance import InvoiceStatus, PaymentStatus, PurchaseInvoice, SupplierPayment
from app.models.treasury import BankAccount, BankTransaction, TransactionType
from app.repositories import supplier_payment_repository as repo
from app.schemas.finance_schema import PaymentApprovalUpdate, PaymentRequestCreate
from app.services import payable_service

APPROVER_ROLES = {"DIRECTOR", "MANAGER"}
ZERO_TOLERANCE = 0.01


def clean_invoice_folio(folio: str) -> str:
    if not folio:
        return "S/N"
    safe_folio = str(folio).strip()
    if safe_folio.startswith("OC-OC-"):
        return safe_folio.replace("OC-OC-", "OC-")
    return safe_folio


def _get_invoice(session: Session, invoice_id: int) -> PurchaseInvoice:
    invoice = session.get(PurchaseInvoice, invoice_id)
    if not invoice:
        raise HTTPException(status_code=404, detail="Factura no encontrada")
    return invoice


def _check_available(session: Session, invoice: PurchaseInvoice, amount: float, exclude_id=None, label="Disponible"):
    available = float(invoice.outstanding_balance) - repo.committed_amount(session, invoice.id, exclude_id)
    if amount > available + ZERO_TOLERANCE:
        raise HTTPException(status_code=400, detail=f"Monto inválido. {label}: ${available:,.2f}")


def _settle(session: Session, payment: SupplierPayment, invoice: PurchaseInvoice, account: BankAccount,
            reference_prefix: str, description: str) -> None:
    """Money leaves the account: bank movement, balances, payment PAID, purchase order or payable paid."""
    bank_tx = BankTransaction(
        account_id=account.id, transaction_type=TransactionType.OUT, amount=payment.amount,
        reference=payment.reference or f"{reference_prefix}{clean_invoice_folio(invoice.invoice_number)}",
        description=description, related_entity_type="PURCHASE_INVOICE", related_entity_id=invoice.id)
    session.add(bank_tx)
    account.current_balance -= payment.amount
    invoice.outstanding_balance -= payment.amount
    if invoice.outstanding_balance < max(float(invoice.total_amount or 0) * 0.005, ZERO_TOLERANCE):
        invoice.outstanding_balance = 0.0
        invoice.status = InvoiceStatus.PAID
    else:
        invoice.status = InvoiceStatus.PARTIAL
    session.flush()
    payment.status = PaymentStatus.PAID
    payment.treasury_transaction_id = bank_tx.id
    if invoice.outstanding_balance > ZERO_TOLERANCE:
        return
    folio = clean_invoice_folio(invoice.invoice_number)
    po = repo.get_po_by_folio(session, folio)
    if po:
        po.payment_status = "PAID"
        session.add(po)
    else:
        payable_service.set_status_by_folio(session, folio, payable_service.PAYABLE_PAID)


def request_payment(session: Session, data: PaymentRequestCreate, user) -> SupplierPayment:
    invoice = _get_invoice(session, data.invoice_id)
    _check_available(session, invoice, data.amount, label="Disponible real")
    payment = SupplierPayment(
        purchase_invoice_id=data.invoice_id, provider_id=invoice.provider_id, amount=data.amount,
        payment_date=data.payment_date, payment_method=data.payment_method,
        suggested_account_id=data.suggested_account_id, reference=data.reference, notes=data.notes,
        status=PaymentStatus.PENDING, created_by_user_id=user.id)
    session.add(payment)
    session.flush()
    if can_execute_payments(session, user):  # D7: MANAGER only with the switch; otherwise it stays a request
        account = session.get(BankAccount, data.suggested_account_id) if data.suggested_account_id else None
        if not account:
            raise HTTPException(status_code=400, detail="Cuenta bancaria no válida para el pago directo.")
        payment.approved_by_user_id = user.id
        payment.approved_account_id = account.id
        _settle(session, payment, invoice, account, "Pago Directo FAC-", "Pago Fast-Track a Proveedor")
    session.commit()
    session.refresh(payment)
    return payment


def update_request(session: Session, payment_id: int, data: PaymentRequestCreate) -> SupplierPayment:
    payment = session.get(SupplierPayment, payment_id)
    if not payment:
        raise HTTPException(status_code=404, detail="Solicitud no encontrada")
    if payment.status != PaymentStatus.PENDING:
        raise HTTPException(status_code=400, detail="No se puede editar una solicitud ya autorizada")
    invoice = session.get(PurchaseInvoice, payment.purchase_invoice_id)
    _check_available(session, invoice, data.amount, exclude_id=payment_id)
    payment.amount = data.amount
    payment.payment_date = data.payment_date
    payment.payment_method = data.payment_method
    payment.suggested_account_id = data.suggested_account_id
    payment.reference = data.reference
    payment.notes = data.notes
    session.add(payment)
    session.commit()
    session.refresh(payment)
    return payment


def decide_request(session: Session, payment_id: int, data: PaymentApprovalUpdate, user) -> SupplierPayment:
    """Approve (assigns the account; Treasury executes later) or reject a pending request."""
    require_roles(user, APPROVER_ROLES, "Acceso denegado. Solo Dirección o Gerencia autorizan.")
    payment = session.get(SupplierPayment, payment_id)
    if not payment:
        raise HTTPException(status_code=404, detail="Pago no encontrado")
    if data.status == PaymentStatus.PENDING:
        if payment.status not in [PaymentStatus.APPROVED, PaymentStatus.PAID]:
            raise HTTPException(status_code=400, detail="Solo se revocan autorizaciones de pagos ya procesados.")
        raise HTTPException(status_code=400,
                            detail="El pago ya fue ejecutado en el banco. No se puede revocar de forma simple.")
    if payment.status != PaymentStatus.PENDING:
        raise HTTPException(status_code=400, detail="Este pago ya fue procesado anteriormente.")
    if data.status == PaymentStatus.APPROVED:
        if not data.approved_account_id:
            raise HTTPException(status_code=400, detail="Asigna una cuenta bancaria para autorizar.")
        payment.approved_by_user_id = user.id
        payment.approved_account_id = data.approved_account_id
        payment.status = PaymentStatus.APPROVED
    elif data.status == PaymentStatus.REJECTED:
        payment.status = PaymentStatus.REJECTED
        payment.approved_by_user_id = user.id
    session.add(payment)
    session.commit()
    session.refresh(payment)
    return payment


def _executable(session: Session, payment_id: int) -> tuple:
    payment = session.get(SupplierPayment, payment_id)
    if not payment:
        raise HTTPException(status_code=404, detail="Pago no encontrado.")
    if payment.status != PaymentStatus.APPROVED:
        raise HTTPException(status_code=400,
                            detail=f"Solo se ejecutan pagos en estado APPROVED. Estado actual: {payment.status}")
    if not payment.approved_account_id:
        raise HTTPException(status_code=400, detail="El pago no tiene cuenta bancaria asignada.")
    account = session.get(BankAccount, payment.approved_account_id)
    if not account:
        raise HTTPException(status_code=404, detail="Cuenta bancaria no encontrada.")
    if account.current_balance < payment.amount:
        raise HTTPException(status_code=400, detail=f"Fondos insuficientes. Disponible: {account.current_balance:.2f}, "
                                                    f"requerido: {payment.amount:.2f}")
    invoice = session.get(PurchaseInvoice, payment.purchase_invoice_id)
    if not invoice:
        raise HTTPException(status_code=404, detail="Factura de proveedor no encontrada.")
    if invoice.status in (InvoiceStatus.PAID, InvoiceStatus.CANCELLED):
        raise HTTPException(status_code=409, detail="La factura ya está pagada o cancelada; rechaza esta solicitud.")
    return payment, account, invoice


def execute_payment(session: Session, payment_id: int) -> SupplierPayment:
    """Treasury pays an approved request from its approved account."""
    payment, account, invoice = _executable(session, payment_id)
    _settle(session, payment, invoice, account, "Pago FAC-", "Pago Ejecutado a Proveedor")
    session.add_all([payment, account, invoice])
    session.commit()
    session.refresh(payment)
    return payment


def reject_pending_requests(session: Session, invoice_id: int, note: str) -> None:
    for payment in repo.get_pending_payments_of_invoice(session, invoice_id):
        payment.status = PaymentStatus.REJECTED
        payment.notes = note
        session.add(payment)


def cancel_invoice(session: Session, invoice_id: int) -> dict:
    invoice = _get_invoice(session, invoice_id)
    if invoice.status == InvoiceStatus.PAID:
        raise HTTPException(status_code=400, detail="No se puede cancelar una factura ya pagada.")
    reject_pending_requests(session, invoice_id, "Cancelado por anulación manual de factura.")
    payable_service.set_status_by_folio(session, clean_invoice_folio(invoice.invoice_number),
                                        payable_service.PAYABLE_CANCELLED)
    invoice.status = InvoiceStatus.CANCELLED
    invoice.outstanding_balance = 0
    session.add(invoice)
    session.commit()
    return {"status": "success", "message": f"Factura {invoice.invoice_number} cancelada."}
