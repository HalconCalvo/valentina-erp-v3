"""Progress invoices (D36): a progress invoice bills the whole house with IVA and amortizes the proportional part
of the advance already collected. The last house of the order amortizes whatever is left of the advance, so the
order closes without spare cents: advance + progress invoices − amortizations = contract total."""
from typing import List, Optional

from fastapi import HTTPException
from sqlmodel import Session

from app.models.sales import (CustomerPayment, CXCStatus, PaymentType, SalesOrder, SalesOrderItem,
                              SalesOrderItemInstance)
from app.repositories import sales_repository as sales_repo

AMORTIZATION_TOLERANCE = 0.01


def house_amount(item: SalesOrderItem) -> float:
    """Value of one house of the line, without IVA (line subtotal / quantity)."""
    qty = float(item.quantity) if item.quantity else 1.0
    if qty < 1e-9:
        qty = 1.0
    sub = float(item.subtotal_price or 0.0)
    if sub <= 0:
        sub = float(item.unit_price or 0.0) * qty
    return sub / qty


def tax_factor(order: Optional[SalesOrder]) -> float:
    """1 + the order's IVA rate (total / subtotal); 1.0 when the order has no subtotal."""
    subtotal = float(order.subtotal or 0.0) if order else 0.0
    return float(order.total_price or 0.0) / subtotal if subtotal > 0 else 1.0


def house_amount_with_tax(item: SalesOrderItem, order: Optional[SalesOrder]) -> float:
    return round(house_amount(item) * tax_factor(order), 2)


def _advance_collected(session: Session, payment: CustomerPayment) -> float:
    if payment.status == CXCStatus.PAID:
        return float(payment.amount or 0.0)
    return sales_repo.sum_active_installments(session, payment.id)


def advance_remaining(session: Session, order_id: int, exclude_payment_id: Optional[int] = None) -> float:
    """Advance collected and not yet amortized by progress invoices."""
    payments = sales_repo.get_order_payments(session, order_id)
    collected = sum(_advance_collected(session, p) for p in payments if p.payment_type == PaymentType.ADVANCE)
    amortized = sum(float(p.amortized_advance or 0.0) for p in payments
                    if p.payment_type == PaymentType.PROGRESS and p.id != exclude_payment_id)
    return round(max(collected - amortized, 0.0), 2)


def uninvoiced_houses(order: SalesOrder) -> List[SalesOrderItemInstance]:
    return [inst for item in order.items or [] for inst in item.instances or []
            if not inst.is_cancelled and inst.customer_payment_id is None and inst.administration_invoice_folio is None]


def preview(session: Session, order: SalesOrder, houses: List[SalesOrderItemInstance]) -> dict:
    """Suggested figures of a progress invoice for the selected houses of the order."""
    amount = round(sum(house_amount_with_tax(inst.item, order) for inst in houses if inst.item), 2)
    remaining = advance_remaining(session, order.id)
    selected = {inst.id for inst in houses}
    is_last = all(inst.id in selected for inst in uninvoiced_houses(order))
    percent = float(order.advance_percent or 0.0)
    proportional = round(amount * percent / 100.0, 2)
    amortized = min(remaining if is_last else proportional, remaining, amount)
    return {"order_id": order.id, "instance_ids": sorted(selected), "amount": amount,
            "amortized_advance": round(amortized, 2), "to_collect": round(amount - amortized, 2),
            "advance_percent": percent, "advance_remaining": remaining, "is_last": is_last}


def check_amortization(suggested: dict, amortized: float, reason: Optional[str]) -> None:
    """The amortization can be edited with a reason, never above the advance left or the invoice."""
    if amortized > suggested["advance_remaining"] + AMORTIZATION_TOLERANCE:
        raise HTTPException(status_code=400, detail=(
            f"El anticipo amortizado (${amortized:,.2f}) es mayor que lo que queda del anticipo cobrado "
            f"(${suggested['advance_remaining']:,.2f})."))
    if amortized > suggested["amount"] + AMORTIZATION_TOLERANCE:
        raise HTTPException(status_code=400, detail="El anticipo amortizado no puede ser mayor que la factura.")
    if abs(amortized - suggested["amortized_advance"]) > AMORTIZATION_TOLERANCE and not (reason or "").strip():
        raise HTTPException(status_code=400, detail=(
            f"La amortización sugerida es ${suggested['amortized_advance']:,.2f}; para cambiarla escribe el motivo."))
