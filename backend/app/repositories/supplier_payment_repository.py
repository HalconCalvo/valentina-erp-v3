"""Queries for supplier invoices, payment requests and credit notes (accounts payable screens)."""
from typing import List, Optional

from sqlalchemy.exc import SQLAlchemyError
from sqlmodel import Session, func, select, text

from app.models.finance import InvoiceStatus, PaymentStatus, PurchaseInvoice, PurchaseInvoiceItem, SupplierPayment
from app.models.inventory import PurchaseOrder

COMMITTED_STATUSES = [PaymentStatus.PENDING, PaymentStatus.APPROVED]


def committed_amount(session: Session, invoice_id: int, exclude_payment_id: Optional[int] = None) -> float:
    """Sum of the requests of an invoice still waiting (pending or approved), optionally without one of them."""
    statement = select(func.sum(SupplierPayment.amount)).where(
        SupplierPayment.purchase_invoice_id == invoice_id, SupplierPayment.status.in_(COMMITTED_STATUSES))
    if exclude_payment_id is not None:
        statement = statement.where(SupplierPayment.id != exclude_payment_id)
    return float(session.exec(statement).one() or 0.0)


def get_payments_by_status(session: Session, status: PaymentStatus) -> List[SupplierPayment]:
    return session.exec(select(SupplierPayment).where(SupplierPayment.status == status)).all()


def count_payments_by_status(session: Session, status: PaymentStatus) -> int:
    return session.exec(select(func.count(SupplierPayment.id)).where(SupplierPayment.status == status)).one()


def get_pending_payments_of_invoice(session: Session, invoice_id: int) -> List[SupplierPayment]:
    return session.exec(select(SupplierPayment).where(SupplierPayment.purchase_invoice_id == invoice_id,
                                                      SupplierPayment.status == PaymentStatus.PENDING)).all()


def get_open_invoices(session: Session) -> List[PurchaseInvoice]:
    """Invoices neither paid nor cancelled."""
    return session.exec(select(PurchaseInvoice).where(PurchaseInvoice.status != InvoiceStatus.PAID,
                                                      PurchaseInvoice.status != InvoiceStatus.CANCELLED)).all()


def get_po_by_folio(session: Session, folio: str) -> Optional[PurchaseOrder]:
    return session.exec(select(PurchaseOrder).where(PurchaseOrder.folio == folio)).first()


def get_pending_payable_rows(session: Session) -> list:
    """Raw accounts_payable rows still pending: (id, provider_id, folio, total, due, subtotal, tax_rate, tax)."""
    return session.exec(text("SELECT id, provider_id, invoice_folio, total_amount, due_date, subtotal, tax_rate, "
                             "tax_amount FROM accounts_payable WHERE status = 'PENDIENTE'")).all()


def get_live_invoice_by_number(session: Session, number: str, provider_id: int) -> Optional[PurchaseInvoice]:
    """Invoice with that folio for the provider; a cancelled invoice frees its folio."""
    return session.exec(select(PurchaseInvoice).where(PurchaseInvoice.invoice_number == number,
                                                      PurchaseInvoice.provider_id == provider_id,
                                                      PurchaseInvoice.status != InvoiceStatus.CANCELLED)).first()


def get_payable_po_id(session: Session, folio: str) -> Optional[int]:
    row = session.exec(text("SELECT purchase_order_id FROM accounts_payable WHERE invoice_folio = :folio")
                       .bindparams(folio=folio)).first()
    return row[0] if row and row[0] else None


def get_po_item_rows(session: Session, po_id: int) -> list:
    """(description, quantity, expected unit cost, sku) of each line of a purchase order."""
    return session.exec(text("""
        SELECT poi.custom_description, poi.quantity_ordered, poi.expected_unit_cost, m.sku
        FROM purchase_order_items poi
        LEFT JOIN materials m ON poi.material_id = m.id
        WHERE poi.purchase_order_id = :po_id
    """).bindparams(po_id=po_id)).all()


def get_expense_notes(session: Session, folio: str) -> Optional[str]:
    """Notes of the operational expense (payable without purchase order) with that folio."""
    try:
        row = session.exec(text("""
            SELECT notes FROM accounts_payable
            WHERE invoice_folio = :folio AND purchase_order_id IS NULL
            LIMIT 1
        """).bindparams(folio=folio)).first()
    except SQLAlchemyError:
        return None
    return row[0] if row else None


def get_received_item_rows(session: Session, folio: str) -> list:
    """Received lines of every payable with that folio (partial deliveries share it)."""
    return session.exec(text("""
        SELECT pii.sku, pii.description, pii.quantity_received, pii.unit_cost, pii.material_id,
               pii.purchase_order_item_id, pii.accounts_payable_id
        FROM purchase_invoice_items pii
        JOIN accounts_payable ap ON ap.id = pii.accounts_payable_id
        WHERE ap.invoice_folio = :folio
        ORDER BY pii.id
    """).bindparams(folio=folio)).all()


def get_invoice_item(session: Session, payable_id: Optional[int], material_id: int) -> Optional[PurchaseInvoiceItem]:
    return session.exec(select(PurchaseInvoiceItem).where(PurchaseInvoiceItem.accounts_payable_id == payable_id,
                                                          PurchaseInvoiceItem.material_id == material_id)).first()


def get_invoice_items(session: Session, payable_id: Optional[int]) -> List[PurchaseInvoiceItem]:
    return session.exec(select(PurchaseInvoiceItem).where(PurchaseInvoiceItem.accounts_payable_id == payable_id)).all()
