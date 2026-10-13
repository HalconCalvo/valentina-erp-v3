"""Sync of sales orders that already exist (advisor, 13/10): the migration Excel is the truth of their money.

For every OV of the file with Folio_OV:
- Invoices match by folio; an invoice stored without folio matches by type, date and amount.
- A matched invoice takes the Excel values; its payments (abonos) with the same date and amount stay, the rest are
  paired in order and updated, extra ones are cancelled and missing ones added.
- An invoice that no longer comes in the Excel is cancelled with its payments. Nothing is deleted physically; every
  change goes to the change log with the reason "Importación <fecha>".
- Never touches banks or commissions: an invoice or payment linked to a bank movement (or an invoice with credit notes
  captured in the app) cannot be changed or cancelled from the Excel; it is reported as an error.
- The total of an OV born in Valentina is only reported when it differs (changes go through change orders); a legacy
  OV takes the Excel total.
"""
from __future__ import annotations

from dataclasses import dataclass, field
from datetime import datetime
from typing import TYPE_CHECKING, Any, Callable, Optional

from sqlmodel import Session

from app.core.business_time import utc_naive_to_local
from app.models.sales import (CustomerPayment, CustomerPaymentInstallment, CXCStatus, PaymentMethod, PaymentStatus,
                              PaymentType, SalesOrder)
from app.repositories import legacy_import_repository as legacy_repo
from app.services import sales_service

if TYPE_CHECKING:
    from app.services.legacy_import_service import _InstallmentPlan, _InvoicePlan, _RetentionPlan

AMOUNT_TOLERANCE = 0.005
BALANCE_TOLERANCE = 0.1
LOCKED_RETENTION = {"INVOICED", "COLLECTED", "WAIVED"}
TYPE_LABELS = {PaymentType.ADVANCE: "ANTICIPO", PaymentType.PROGRESS: "AVANCE", PaymentType.FULL: "CONTRATO",
               PaymentType.SETTLEMENT: "LIQUIDACION"}
FIELD_LABELS = {
    "payment_type": "Tipo", "invoice_folio": "Folio", "invoice_date": "Fecha", "amount": "Monto",
    "nc_advance_folio": "NC anticipo", "nc_advance_amount": "Monto NC anticipo", "nc_retention_folio": "NC FG",
    "nc_retention_amount": "Monto NC FG", "amortized_advance": "Anticipo amortizado",
    "retention_amount": "Retención", "retention_percent": "% retención", "retention_days": "Días retención",
    "retention_due_date": "Vence retención", "retention_status": "Estado retención",
}


@dataclass
class SyncStep:
    kind: str  # add | change | cancel
    description: str
    run: Callable[[], None]


@dataclass
class OrderSync:
    order: SalesOrder
    steps: list[SyncStep] = field(default_factory=list)
    errors: list[str] = field(default_factory=list)
    notices: list[str] = field(default_factory=list)

    def count(self, kind: str) -> int:
        return sum(1 for step in self.steps if step.kind == kind)


def import_reason(now: Optional[datetime] = None) -> str:
    return f"Importación {utc_naive_to_local(now or datetime.utcnow()):%d/%m/%Y %H:%M}"


def money(value: float) -> str:
    return f"${value:,.2f}"


# ---------------------------------------------------------------------------
# Value comparison
# ---------------------------------------------------------------------------

def _same(old: Any, new: Any) -> bool:
    if isinstance(old, datetime) or isinstance(new, datetime):
        if old is None or new is None:
            return old is None and new is None
        return old.date() == new.date()
    if isinstance(new, float) or isinstance(old, float):
        return abs(float(old or 0.0) - float(new or 0.0)) < AMOUNT_TOLERANCE
    if isinstance(new, str) or isinstance(old, str):
        return (old or "").strip() == (new or "").strip()
    return old == new


def _show(value: Any) -> str:
    if value is None or value == "":
        return "—"
    if isinstance(value, datetime):
        return f"{value:%d/%m/%Y}"
    if isinstance(value, PaymentType):
        return TYPE_LABELS.get(value, value.value)
    if isinstance(value, float):
        return money(value)
    return str(value)


def _label(cxc: CustomerPayment) -> str:
    folio = (cxc.invoice_folio or "").strip()
    kind = TYPE_LABELS.get(cxc.payment_type, str(cxc.payment_type))
    return f"Factura {folio} {kind}" if folio else f"Factura sin folio {kind} {money(float(cxc.amount or 0.0))}"


def _invoice_values(inv: _InvoicePlan) -> dict:
    return {
        "payment_type": inv.payment_type, "invoice_folio": inv.folio, "invoice_date": inv.invoice_date,
        "amount": inv.amount, "nc_advance_folio": inv.nc_advance_folio, "nc_advance_amount": inv.nc_advance_amount,
        "nc_retention_folio": inv.nc_retention_folio, "nc_retention_amount": inv.nc_retention_amount,
        "amortized_advance": inv.nc_advance_amount if inv.payment_type == PaymentType.PROGRESS else 0.0,
    }


def _retention_values(cxc: CustomerPayment, retention: Optional[_RetentionPlan], amount: float) -> dict:
    if retention is None:
        if float(cxc.retention_amount or 0.0) <= 0 and not cxc.retention_status:
            return {}
        return {"retention_amount": 0.0, "retention_percent": 0.0, "retention_status": None}
    values = {"retention_amount": amount, "retention_percent": retention.percent, "retention_status": "PENDING"}
    if not (retention.calculated and cxc.retention_due_date):
        values.update(retention_days=retention.days, retention_due_date=retention.due_date)
    return values


def _differences(record: Any, wanted: dict) -> dict:
    return {name: value for name, value in wanted.items() if not _same(getattr(record, name), value)}


def _describe(differences: dict, record: Any) -> str:
    return "; ".join(f"{FIELD_LABELS.get(name, name)} {_show(getattr(record, name))} → {_show(value)}"
                     for name, value in differences.items())


# ---------------------------------------------------------------------------
# Records created from the Excel (also used for new OVs)
# ---------------------------------------------------------------------------

def _set_pending_retention(cxc: CustomerPayment, retention: _RetentionPlan, amount: float) -> None:
    """Mirrors register_progress: the FG credit note becomes a retention owed by the client."""
    cxc.retention_amount = amount
    cxc.retention_status = "PENDING"
    cxc.retention_percent = retention.percent
    cxc.retention_days = retention.days
    cxc.retention_due_date = retention.due_date


def add_installment(session: Session, cxc: CustomerPayment, inst: _InstallmentPlan, user_id: int) -> None:
    session.add(CustomerPaymentInstallment(
        customer_payment_id=cxc.id, amount=inst.amount, payment_date=inst.payment_date,
        payment_method=PaymentMethod.TRANSFER, created_by_user_id=user_id,
        is_advance=cxc.payment_type == PaymentType.ADVANCE))


def create_invoice_record(session: Session, order: SalesOrder, inv: _InvoicePlan, user_id: int) -> CustomerPayment:
    cxc = CustomerPayment(sales_order_id=order.id, status=CXCStatus.PENDING, payment_method=PaymentMethod.TRANSFER,
                          created_by_user_id=user_id)
    for name, value in _invoice_values(inv).items():
        setattr(cxc, name, value)
    if inv.retention is not None:
        _set_pending_retention(cxc, inv.retention, inv.nc_retention_amount)
    session.add(cxc)
    session.flush()
    for inst in inv.installments:
        add_installment(session, cxc, inst, user_id)
    session.flush()
    return cxc


def refresh_order_money(session: Session, order: SalesOrder) -> None:
    """Order balance = total − active payments of its active invoices; invoice and order states follow (D16)."""
    invoices = legacy_repo.get_active_invoices(session, order.id)
    paid = round(sum(float(i.amount or 0.0) for cxc in invoices
                     for i in legacy_repo.get_active_installments(session, cxc.id)), 2)
    order.outstanding_balance = round(float(order.total_price or 0.0) - paid, 2)
    if paid <= 0:
        order.payment_status = PaymentStatus.PENDING
    elif order.outstanding_balance <= BALANCE_TOLERANCE:
        order.payment_status = PaymentStatus.PAID
    else:
        order.payment_status = PaymentStatus.PARTIAL
    session.add(order)
    for cxc in invoices:
        sales_service._recalc_cxc_status(session, cxc, order)  # noqa: SLF001
    session.flush()


# ---------------------------------------------------------------------------
# Matching the Excel with what is stored
# ---------------------------------------------------------------------------

def _take(pool: list, predicate: Callable[[Any], bool]) -> Any:
    found = next((item for item in pool if predicate(item)), None)
    if found is not None:
        pool.remove(found)
    return found


def match_invoices(stored: list[CustomerPayment], planned: list[_InvoicePlan]) -> tuple[list, list, list]:
    """(pairs stored↔planned, planned without match, stored without match)."""
    pool, pairs, pending = list(stored), [], []
    for inv in planned:
        cxc = _take(pool, lambda c: inv.folio and (c.invoice_folio or "").strip() == inv.folio)
        (pairs.append((cxc, inv)) if cxc else pending.append(inv))
    missing = []
    for inv in pending:
        cxc = _take(pool, lambda c: not (c.invoice_folio or "").strip() and c.payment_type == inv.payment_type
                    and _same(c.invoice_date, inv.invoice_date) and _same(float(c.amount or 0.0), inv.amount))
        (pairs.append((cxc, inv)) if cxc else missing.append(inv))
    return pairs, missing, pool


def match_installments(stored: list[CustomerPaymentInstallment], planned: list[_InstallmentPlan]):
    """(pairs to update, planned to add, stored to cancel); same date and amount stay untouched."""
    pool, unmatched = list(stored), []
    for inst in planned:
        if _take(pool, lambda i: _same(i.payment_date, inst.payment_date)
                 and _same(float(i.amount or 0.0), inst.amount)) is None:
            unmatched.append(inst)
    pairs = list(zip(pool, unmatched))
    return pairs, unmatched[len(pairs):], pool[len(pairs):]


# ---------------------------------------------------------------------------
# Steps of one existing OV
# ---------------------------------------------------------------------------

def _setter(record: Any, values: dict) -> Callable[[], None]:
    def run() -> None:
        for name, value in values.items():
            setattr(record, name, value)
    return run


def _cancel_installment(inst: CustomerPaymentInstallment, reason: str) -> Callable[[], None]:
    return _setter(inst, {"is_cancelled": True, "cancel_reason": reason, "cancelled_at": datetime.utcnow()})


def _payment_text(inst: Any) -> str:
    return f"abono del {inst.payment_date:%d/%m/%Y} por {money(float(inst.amount or 0.0))}"


def _bank_error(sync: OrderSync, label: str, inst: CustomerPaymentInstallment) -> bool:
    if inst.bank_transaction_id:
        sync.errors.append(f"{label}: el {_payment_text(inst)} está ligado a un movimiento de banco; "
                           "no se cambia desde el Excel (corrígelo en la app).")
    return bool(inst.bank_transaction_id)


def _installment_steps(session: Session, sync: OrderSync, cxc: CustomerPayment, inv: _InvoicePlan,
                       label: str, reason: str, user_id: int) -> None:
    pairs, to_add, to_cancel = match_installments(legacy_repo.get_active_installments(session, cxc.id),
                                                  inv.installments)
    for inst, plan in pairs:
        if not _bank_error(sync, label, inst):
            diff = _differences(inst, {"payment_date": plan.payment_date, "amount": plan.amount})
            sync.steps.append(SyncStep("change", f"{label}: {_payment_text(inst)} → {_payment_text(plan)}",
                                       _setter(inst, diff)))
    for inst in to_cancel:
        if not _bank_error(sync, label, inst):
            sync.steps.append(SyncStep("cancel", f"{label}: se cancela el {_payment_text(inst)}",
                                       _cancel_installment(inst, reason)))
    for plan in to_add:
        sync.steps.append(SyncStep("add", f"{label}: agrega {_payment_text(plan)}",
                                   lambda plan=plan: add_installment(session, cxc, plan, user_id)))


def _invoice_steps(session: Session, sync: OrderSync, cxc: CustomerPayment, inv: _InvoicePlan,
                   reason: str, user_id: int) -> None:
    label = _label(cxc)
    wanted = _invoice_values(inv)
    if cxc.retention_status in LOCKED_RETENTION:
        if not _same(float(cxc.nc_retention_amount or 0.0), inv.nc_retention_amount):
            sync.errors.append(f"{label}: la retención ya está {cxc.retention_status.lower()}; "
                               "el monto de la NC de FG no se cambia desde el Excel.")
    elif _differences(cxc, {"nc_retention_folio": inv.nc_retention_folio,
                            "nc_retention_amount": inv.nc_retention_amount}):
        # The retention follows the FG credit note only when the note changes (stored retentions stay as they are)
        wanted.update(_retention_values(cxc, inv.retention, inv.nc_retention_amount))
    diff = _differences(cxc, wanted)
    if diff:
        sync.steps.append(SyncStep("change", f"{label}: {_describe(diff, cxc)}", _setter(cxc, diff)))
    _installment_steps(session, sync, cxc, inv, label, reason, user_id)


def _cancel_invoice(session: Session, cxc: CustomerPayment, installments: list, reason: str) -> Callable[[], None]:
    def run() -> None:
        for inst in installments:
            _cancel_installment(inst, reason)()
        cxc.status = CXCStatus.CANCELLED
        cxc.notes = ((cxc.notes or "") + f" | CANCELADA: {reason}").strip(" |")
        sales_service._unlink_cxc_instances(session, cxc.id)  # noqa: SLF001
    return run


def _cancel_invoice_steps(session: Session, sync: OrderSync, cxc: CustomerPayment, reason: str) -> None:
    label = _label(cxc)
    installments = legacy_repo.get_active_installments(session, cxc.id)
    if cxc.treasury_transaction_id or any(i.bank_transaction_id for i in installments):
        sync.errors.append(f"{label} ya no viene en el Excel pero tiene cobros ligados al banco; no se cancela "
                           "desde el Excel (agrégala al Excel o cancélala en la app).")
        return
    if legacy_repo.count_active_credit_notes(session, cxc.id):
        sync.errors.append(f"{label} ya no viene en el Excel pero tiene notas de crédito capturadas en la app.")
        return
    sync.steps.append(SyncStep(
        "cancel", f"{label} ({money(float(cxc.amount or 0.0))}, {len(installments)} abono(s)) ya no viene en el "
                  "Excel: se cancela", _cancel_invoice(session, cxc, installments, reason)))


def _add_invoice_step(session: Session, sync: OrderSync, inv: _InvoicePlan, user_id: int) -> None:
    folio = inv.folio or "sin folio"
    text = (f"Agrega factura {folio} {TYPE_LABELS.get(inv.payment_type)} por {money(inv.amount)} "
            f"con {len(inv.installments)} abono(s)")
    sync.steps.append(SyncStep("add", text, lambda: create_invoice_record(session, sync.order, inv, user_id)))


def _total_step(sync: OrderSync, total: float, tax_rate: float) -> None:
    order = sync.order
    current = float(order.total_price or 0.0)
    if _same(current, total):
        return
    if not order.is_legacy:
        sync.notices.append(f"Total en Valentina {money(current)} y en el Excel {money(total)} (diferencia "
                            f"{money(total - current)}): no se cambia; los cambios de total van por orden de cambio.")
        return
    subtotal = round(total / (1.0 + tax_rate), 2)
    values = {"total_price": total, "subtotal": subtotal, "tax_amount": round(total - subtotal, 2)}
    sync.steps.append(SyncStep("change", f"Total de la OV {money(current)} → {money(total)}", _setter(order, values)))


def _duplicate_folios(stored: list[CustomerPayment]) -> list[str]:
    folios = [(c.invoice_folio or "").strip() for c in stored if (c.invoice_folio or "").strip()]
    return sorted({f for f in folios if folios.count(f) > 1})


def build_order_sync(session: Session, order: SalesOrder, total: float, tax_rate: float,
                     invoices: list[_InvoicePlan], reason: str, user_id: int) -> OrderSync:
    sync = OrderSync(order=order)
    stored = legacy_repo.get_active_invoices(session, order.id)
    for folio in _duplicate_folios(stored):
        sync.errors.append(f"La OV tiene la factura {folio} capturada más de una vez; corrígelo antes de importar.")
    _total_step(sync, total, tax_rate)
    pairs, missing, leftovers = match_invoices(stored, invoices)
    for cxc, inv in pairs:
        _invoice_steps(session, sync, cxc, inv, reason, user_id)
    for inv in missing:
        _add_invoice_step(session, sync, inv, user_id)
    for cxc in leftovers:
        _cancel_invoice_steps(session, sync, cxc, reason)
    return sync


def apply_order_sync(session: Session, sync: OrderSync) -> None:
    for step in sync.steps:
        step.run()
        session.flush()
    sync.order.is_excel_managed = True
    refresh_order_money(session, sync.order)
