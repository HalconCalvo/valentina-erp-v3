"""Upload of the migration Excel over OVs that already exist (Gabriel, 13/10: D25, D26).

The Excel only ADDS what Valentina is missing and REPORTS everything else; it never overwrites or cancels:
- Invoices match by folio; an invoice stored without folio matches by type, date and amount.
- An invoice of the Excel that Valentina does not have is added with its payments (abonos); a payment of a matched
  invoice that Valentina does not have is added too.
- Everything else is a discrepancy for someone to correct by hand, with a reason, in the app: amounts or dates that
  differ, invoices or payments in Valentina that are not in the Excel, a different OV total, and OVs that came in an
  earlier Excel but not in this one ("No viene en el Excel — revisar").
- Everything is still captured in the app. Banks and commissions are never touched.
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
TYPE_LABELS = {PaymentType.ADVANCE: "ANTICIPO", PaymentType.PROGRESS: "AVANCE", PaymentType.FULL: "CONTRATO",
               PaymentType.SETTLEMENT: "LIQUIDACION"}
FIELD_LABELS = {
    "payment_type": "Tipo", "invoice_folio": "Folio", "invoice_date": "Fecha", "amount": "Monto",
    "nc_advance_folio": "NC anticipo", "nc_advance_amount": "Monto NC anticipo", "nc_retention_folio": "NC FG",
    "nc_retention_amount": "Monto NC FG", "payment_date": "Fecha del abono", "total_price": "Total de la OV",
}
# Kinds of discrepancy (report columns)
DIFFERENT = "Dato distinto"
ONLY_VALENTINA = "En Valentina, no en el Excel"
NOT_IN_FILE = "No viene en el Excel — revisar"
REPEATED = "Folio repetido en Valentina"


@dataclass
class SyncStep:
    description: str
    run: Callable[[], None]


@dataclass
class Discrepancy:
    folio: str
    project: str
    kind: str
    record: str  # invoice or payment it refers to ("" for the OV itself)
    concept: str
    valentina: str
    excel: str

    def as_dict(self) -> dict:
        return dict(self.__dict__)

    def text(self) -> str:
        record = f"{self.record}: " if self.record else ""
        return f"{self.kind} — {record}{self.concept}: Valentina {self.valentina} / Excel {self.excel}"


@dataclass
class OrderSync:
    order: SalesOrder
    project: str
    steps: list[SyncStep] = field(default_factory=list)
    discrepancies: list[Discrepancy] = field(default_factory=list)

    def report(self, kind: str, record: str, concept: str, valentina: Any, excel: Any) -> None:
        self.discrepancies.append(Discrepancy(order_folio(self.order.id), self.project, kind, record, concept,
                                              _show(valentina), _show(excel)))


def order_folio(order_id: int) -> str:
    return f"OV-{order_id:04d}"


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


def _differences(record: Any, wanted: dict) -> dict:
    return {name: value for name, value in wanted.items() if not _same(getattr(record, name), value)}



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
# What is added and what is reported for one existing OV
# ---------------------------------------------------------------------------

def _payment_text(inst: Any) -> str:
    return f"abono del {inst.payment_date:%d/%m/%Y} por {money(float(inst.amount or 0.0))}"


def _excel_fields(inv: _InvoicePlan) -> dict:
    values = _invoice_values(inv)
    values.pop("amortized_advance")
    return values


def _payments(session: Session, sync: OrderSync, cxc: CustomerPayment, inv: _InvoicePlan, label: str,
              user_id: int) -> None:
    pairs, to_add, only_valentina = match_installments(legacy_repo.get_active_installments(session, cxc.id),
                                                       inv.installments)
    for inst, plan in pairs:
        sync.report(DIFFERENT, label, "Abono", _payment_text(inst), _payment_text(plan))
    for inst in only_valentina:
        sync.report(ONLY_VALENTINA, label, "Abono", _payment_text(inst), None)
    for plan in to_add:
        sync.steps.append(SyncStep(f"{label}: agrega {_payment_text(plan)}",
                                   lambda plan=plan: add_installment(session, cxc, plan, user_id)))


def _matched_invoice(session: Session, sync: OrderSync, cxc: CustomerPayment, inv: _InvoicePlan,
                     user_id: int) -> None:
    label = _label(cxc)
    for name, value in _differences(cxc, _excel_fields(inv)).items():
        sync.report(DIFFERENT, label, FIELD_LABELS.get(name, name), getattr(cxc, name), value)
    _payments(session, sync, cxc, inv, label, user_id)


def _add_invoice_step(session: Session, sync: OrderSync, inv: _InvoicePlan, user_id: int) -> None:
    folio = inv.folio or "sin folio"
    text = (f"Agrega factura {folio} {TYPE_LABELS.get(inv.payment_type)} por {money(inv.amount)} "
            f"con {len(inv.installments)} abono(s)")
    sync.steps.append(SyncStep(text, lambda: create_invoice_record(session, sync.order, inv, user_id)))


def _repeated_folios(stored: list[CustomerPayment]) -> list[str]:
    folios = [(c.invoice_folio or "").strip() for c in stored if (c.invoice_folio or "").strip()]
    return sorted({f for f in folios if folios.count(f) > 1})


def build_order_sync(session: Session, order: SalesOrder, project: str, total: float,
                     invoices: list[_InvoicePlan], user_id: int) -> OrderSync:
    sync = OrderSync(order=order, project=project)
    stored = legacy_repo.get_active_invoices(session, order.id)
    for folio in _repeated_folios(stored):
        sync.report(REPEATED, f"Factura {folio}", "Folio", "capturada más de una vez", None)
    if not _same(float(order.total_price or 0.0), total):
        sync.report(DIFFERENT, "", FIELD_LABELS["total_price"], float(order.total_price or 0.0), total)
    pairs, missing, only_valentina = match_invoices(stored, invoices)
    for cxc, inv in pairs:
        _matched_invoice(session, sync, cxc, inv, user_id)
    for inv in missing:
        _add_invoice_step(session, sync, inv, user_id)
    for cxc in only_valentina:
        sync.report(ONLY_VALENTINA, _label(cxc), "Factura", money(float(cxc.amount or 0.0)), None)
    return sync


def not_in_file(order: SalesOrder) -> Discrepancy:
    return Discrepancy(order_folio(order.id), order.project_name or "", NOT_IN_FILE, "", "OV",
                       money(float(order.total_price or 0.0)), "—")


def apply_order_sync(session: Session, sync: OrderSync) -> None:
    """Adds what Valentina is missing; the OV is remembered as coming in the Excel (for the download)."""
    for step in sync.steps:
        step.run()
        session.flush()
    sync.order.is_excel_managed = True
    session.add(sync.order)
    if sync.steps:
        refresh_order_money(session, sync.order)
