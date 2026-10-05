"""Legacy sales-order import from Excel (zero-balance cutover).

Two phases:
- validate_legacy_workbook(): parses and checks the whole file without writing.
- import_legacy_workbook(): re-validates and, only when there are no errors,
  creates everything in a single transaction (all or nothing).

Nothing is assumed: any value that cannot be interpreted with certainty is
reported as an error with its sheet and row number.
"""
from __future__ import annotations

import io
import math
import re
from dataclasses import dataclass, field
from datetime import datetime, timedelta
from typing import Any, Callable, Optional

import structlog
from fastapi import HTTPException
from openpyxl import load_workbook
from sqlmodel import Session

from app.models.foundations import Client, TaxRate
from app.models.sales import (
    CXCStatus,
    CustomerPayment,
    CustomerPaymentInstallment,
    PaymentMethod,
    PaymentStatus,
    PaymentType,
    SalesOrder,
    SalesOrderItem,
    SalesOrderStatus,
)
from app.models.users import User
from app.repositories import legacy_import_repository as legacy_repo
from app.services import sales_service

logger = structlog.get_logger(__name__)

OV_SHEET = "OVs"
INV_SHEET = "Facturas"
OV_HEADERS = [
    "Proyecto",
    "Cliente",
    "Vendedor",
    "IVA%",
    "Total_OV_con_IVA",
    "Anticipo_Cobrado",
    "Comision_Pct",
    "Notas",
]
INV_HEADERS = [
    "Proyecto",
    "Tipo",
    "Folio_Factura",
    "Fecha_Factura",
    "Monto_Factura",
    "NC_Anticipo_Folio",
    "NC_Anticipo_Monto",
    "NC_FG_Folio",
    "NC_FG_Monto",
    "Abono1_Fecha",
    "Abono1_Monto",
    "Abono2_Fecha",
    "Abono2_Monto",
    "Abono3_Fecha",
    "Abono3_Monto",
]
TIPO_MAP = {
    "ANTICIPO": PaymentType.ADVANCE,
    "AVANCE": PaymentType.PROGRESS,
    "CONTRATO": PaymentType.FULL,
}
EXEMPT_LABEL = "EXENTO"
EXEMPT_TAX_NAME = "exento"
RATE_TOLERANCE = 0.0001
AMOUNT_TOLERANCE = 0.01
BALANCE_TOLERANCE = 0.1
INSTALLMENT_SLOTS = (1, 2, 3)
DATE_FORMATS = ("%Y-%m-%d", "%d/%m/%Y")
DECIMAL_TEXT = re.compile(r"^\d+[.,]\d+$")
FOLIO_FIELDS = ("Folio_Factura", "NC_Anticipo_Folio", "NC_FG_Folio")
CREDIT_NOTE_FIELDS = (("NC_Anticipo_Folio", "NC_Anticipo_Monto"), ("NC_FG_Folio", "NC_FG_Monto"))
INVOICE_AMOUNT_FIELDS = (
    "Monto_Factura",
    "NC_Anticipo_Monto",
    "NC_FG_Monto",
    "Abono1_Monto",
    "Abono2_Monto",
    "Abono3_Monto",
)


@dataclass
class _InstallmentPlan:
    slot: int
    payment_date: datetime
    amount: float


@dataclass
class _InvoicePlan:
    row: int
    payment_type: PaymentType
    folio: str
    invoice_date: datetime
    amount: float
    nc_advance_folio: Optional[str]
    nc_advance_amount: float
    nc_retention_folio: Optional[str]
    nc_retention_amount: float
    installments: list[_InstallmentPlan]

    def paid(self) -> float:
        # Same as the regular flow: only installments reduce the order balance.
        # The advance NC is the advance already paid; the FG NC stays owed as a retention.
        return round(sum(i.amount for i in self.installments), 2)


@dataclass
class _OrderPlan:
    row: int
    project: str
    client: Client
    seller: User
    tax_rate: TaxRate
    total_price: float
    subtotal: float
    commission_pct: float
    advance_collected: float
    notes: str
    invoices: list[_InvoicePlan] = field(default_factory=list)

    def tax_amount(self) -> float:
        return round(self.total_price - self.subtotal, 2)

    def installment_count(self) -> int:
        return sum(len(inv.installments) for inv in self.invoices)

    def outstanding(self) -> float:
        return round(self.total_price - sum(inv.paid() for inv in self.invoices), 2)

    def payment_status(self) -> PaymentStatus:
        if sum(inv.paid() for inv in self.invoices) <= 0:
            return PaymentStatus.PENDING
        if self.outstanding() <= BALANCE_TOLERANCE:
            return PaymentStatus.PAID
        return PaymentStatus.PARTIAL


@dataclass
class _ImportPlan:
    orders: list[_OrderPlan] = field(default_factory=list)
    errors: list[dict] = field(default_factory=list)
    warnings: list[dict] = field(default_factory=list)

    def error(self, sheet: str, row: Optional[int], project: Optional[str], message: str) -> None:
        self.errors.append({"sheet": sheet, "row": row, "project": project, "message": message})

    def warn(self, sheet: str, row: Optional[int], project: Optional[str], message: str) -> None:
        self.warnings.append({"sheet": sheet, "row": row, "project": project, "message": message})

    def attempt(self, sheet: str, row: int, project: str, parse: Callable[[], Any]) -> Any:
        try:
            return parse()
        except ValueError as exc:
            self.error(sheet, row, project, str(exc))
            return None


# ---------------------------------------------------------------------------
# Cell parsing — every helper raises ValueError instead of guessing a default
# ---------------------------------------------------------------------------

def _is_blank(value: Any) -> bool:
    return value is None or (isinstance(value, str) and not value.strip())


def _cell_str(value: Any) -> str:
    if value is None:
        return ""
    if isinstance(value, float) and value.is_integer():
        return str(int(value))
    return str(value).strip()


def _parse_number(value: Any, label: str, required: bool = False) -> float:
    if _is_blank(value):
        if required:
            raise ValueError(f"{label} es obligatorio.")
        return 0.0
    if isinstance(value, bool) or isinstance(value, datetime):
        raise ValueError(f"{label} no es un número válido: «{value}».")
    try:
        number = float(value) if isinstance(value, (int, float)) else float(str(value).strip())
    except ValueError:
        raise ValueError(f"{label} no es un número válido: «{_cell_str(value)}».") from None
    if not math.isfinite(number):
        raise ValueError(f"{label} no es un número válido: «{_cell_str(value)}».")
    return number


def _parse_amount(value: Any, label: str) -> float:
    number = _parse_number(value, label)
    if number < 0:
        raise ValueError(f"{label} no puede ser negativo: {number:,.2f}.")
    return round(number, 2)


def _parse_positive(value: Any, label: str) -> float:
    number = _parse_number(value, label, required=True)
    if number <= 0:
        raise ValueError(f"{label} debe ser mayor a cero.")
    return round(number, 2)


def _parse_date(value: Any, label: str, required: bool = False) -> Optional[datetime]:
    if _is_blank(value):
        if required:
            raise ValueError(f"{label} es obligatoria.")
        return None
    if isinstance(value, datetime):
        return value
    text = _cell_str(value)
    for fmt in DATE_FORMATS:
        try:
            return datetime.strptime(text, fmt)
        except ValueError:
            continue
    raise ValueError(f"{label} no es una fecha válida (use DD/MM/AAAA): «{text}».")


def _parse_payment_type(value: Any) -> PaymentType:
    key = _cell_str(value).upper()
    if key not in TIPO_MAP:
        raise ValueError(f"Tipo inválido «{_cell_str(value)}»: use ANTICIPO, AVANCE o CONTRATO.")
    return TIPO_MAP[key]


def _parse_required_folio(value: Any) -> str:
    if _is_blank(value):
        raise ValueError("Folio_Factura es obligatorio.")
    return _cell_str(value)


def _parse_credit_note(inv: dict, folio_label: str, amount_label: str) -> tuple[Optional[str], float]:
    folio = None if _is_blank(inv[folio_label]) else _cell_str(inv[folio_label])
    amount = _parse_amount(inv[amount_label], amount_label)
    if amount > 0 and not folio:
        raise ValueError(f"{amount_label} {amount:,.2f} no tiene {folio_label}.")
    if folio and amount <= 0:
        raise ValueError(f"{folio_label} «{folio}» no tiene {amount_label}.")
    return folio, amount


def _parse_installment(inv: dict, slot: int) -> Optional[_InstallmentPlan]:
    date_label, amount_label = f"Abono{slot}_Fecha", f"Abono{slot}_Monto"
    amount = _parse_amount(inv[amount_label], amount_label)
    payment_date = _parse_date(inv[date_label], date_label)
    if amount > 0 and payment_date is None:
        raise ValueError(f"{amount_label} {amount:,.2f} no tiene {date_label}.")
    if payment_date is not None and amount <= 0:
        raise ValueError(f"{date_label} tiene fecha pero {amount_label} está vacío.")
    return _InstallmentPlan(slot, payment_date, amount) if amount > 0 else None


def _is_exempt_rate(rate: TaxRate) -> bool:
    return (rate.name or "").strip().lower() == EXEMPT_TAX_NAME


def _resolve_exempt_rate(rates: list[TaxRate]) -> TaxRate:
    matches = [t for t in rates if _is_exempt_rate(t)]
    if not matches:
        raise ValueError("IVA «EXENTO»: no existe una tasa activa llamada «Exento».")
    if len(matches) > 1:
        raise ValueError("IVA «EXENTO»: hay más de una tasa activa llamada «Exento».")
    if abs(float(matches[0].rate)) > RATE_TOLERANCE:
        raise ValueError("IVA «EXENTO»: la tasa «Exento» no es 0%.")
    return matches[0]


def _resolve_tax_rate(value: Any, rates: list[TaxRate]) -> TaxRate:
    """EXENTO resolves by name; numbers resolve by value among non-exempt rates."""
    if isinstance(value, str) and value.strip().upper() == EXEMPT_LABEL:
        return _resolve_exempt_rate(rates)
    text = value.strip().rstrip("%").strip() if isinstance(value, str) else value
    try:
        percent = _parse_number(text, "IVA%", required=True)
    except ValueError:
        raise ValueError(f"IVA% no reconocido «{_cell_str(value)}»: use un número o EXENTO.") from None
    if percent < 0:
        raise ValueError(f"IVA% no puede ser negativo: «{_cell_str(value)}».")
    rate = percent / 100.0 if percent >= 1 else percent
    matches = [t for t in rates if not _is_exempt_rate(t) and abs(float(t.rate) - rate) < RATE_TOLERANCE]
    if not matches:
        raise ValueError(f"No existe una tasa de IVA activa de {rate * 100:g}%.")
    if len(matches) > 1:
        names = ", ".join(f"«{t.name}»" for t in matches)
        raise ValueError(f"IVA {rate * 100:g}% es ambiguo: coincide con {names}.")
    return matches[0]


def _single_match(rows: list, label: str, name: str) -> Any:
    if not rows:
        raise ValueError(f"{label} no encontrado: «{name}».")
    if len(rows) > 1:
        raise ValueError(f"{label} ambiguo: hay {len(rows)} registros llamados «{name}».")
    return rows[0]


class _Lookups:
    def __init__(self, session: Session) -> None:
        self.session = session
        self.tax_rates = legacy_repo.get_active_tax_rates(session)
        self.legacy_projects = legacy_repo.get_active_legacy_project_names(session)

    def client(self, value: Any) -> Client:
        name = _cell_str(value)
        if not name:
            raise ValueError("Cliente es obligatorio.")
        return _single_match(legacy_repo.get_clients_by_full_name(self.session, name), "Cliente", name)

    def seller(self, value: Any) -> User:
        name = _cell_str(value)
        if not name:
            raise ValueError("Vendedor es obligatorio.")
        return _single_match(legacy_repo.get_users_by_full_name(self.session, name), "Vendedor", name)


# ---------------------------------------------------------------------------
# Validation phase (read-only)
# ---------------------------------------------------------------------------

def _load_workbook(file_bytes: bytes):
    try:
        return load_workbook(io.BytesIO(file_bytes), data_only=True)
    except Exception as exc:  # noqa: BLE001 — any parse failure means an unreadable file
        raise HTTPException(status_code=400, detail="El archivo no es un .xlsx válido.") from exc


def _read_sheet_rows(wb, sheet_name: str, headers: list[str]) -> list[tuple[int, dict[str, Any]]]:
    if sheet_name not in wb.sheetnames:
        raise HTTPException(status_code=400, detail=f"Falta la hoja '{sheet_name}'.")
    rows = list(wb[sheet_name].iter_rows(min_row=1, values_only=True))
    if not rows:
        raise HTTPException(status_code=400, detail=f"La hoja '{sheet_name}' está vacía.")
    header_row = [_cell_str(c) for c in rows[0]]
    missing = [h for h in headers if h not in header_row]
    if missing:
        raise HTTPException(status_code=400, detail=f"Columnas faltantes en {sheet_name}: {', '.join(missing)}")
    idx = {h: header_row.index(h) for h in headers}
    out: list[tuple[int, dict[str, Any]]] = []
    for row_number, raw in enumerate(rows[1:], start=2):
        record = {h: raw[idx[h]] if idx[h] < len(raw) else None for h in headers}
        if all(_is_blank(v) for v in record.values()):
            continue
        if _cell_str(record["Proyecto"]).startswith("#"):
            continue  # template example rows
        out.append((row_number, record))
    return out


def _validate_order_row(plan: _ImportPlan, lookups: _Lookups, row: int, ov: dict) -> Optional[_OrderPlan]:
    project = _cell_str(ov["Proyecto"])
    errors_before = len(plan.errors)

    def check(parse: Callable[[], Any]) -> Any:
        return plan.attempt(OV_SHEET, row, project, parse)

    client = check(lambda: lookups.client(ov["Cliente"]))
    seller = check(lambda: lookups.seller(ov["Vendedor"]))
    tax_rate = check(lambda: _resolve_tax_rate(ov["IVA%"], lookups.tax_rates))
    total = check(lambda: _parse_positive(ov["Total_OV_con_IVA"], "Total_OV_con_IVA"))
    advance = check(lambda: _parse_amount(ov["Anticipo_Cobrado"], "Anticipo_Cobrado"))
    commission_pct = check(lambda: _parse_amount(ov["Comision_Pct"], "Comision_Pct"))
    if len(plan.errors) > errors_before:
        return None
    return _OrderPlan(
        row=row,
        project=project,
        client=client,
        seller=seller,
        tax_rate=tax_rate,
        total_price=total,
        subtotal=round(total / (1.0 + float(tax_rate.rate)), 2),
        commission_pct=commission_pct,
        advance_collected=advance,
        notes=_cell_str(ov["Notas"]) or "Importación legacy",
    )


def _validate_orders(
    plan: _ImportPlan, lookups: _Lookups, ov_rows: list[tuple[int, dict]]
) -> tuple[dict[str, Optional[_OrderPlan]], dict[str, int]]:
    """Returns (project → order plan or None when invalid, skipped project → row)."""
    known: dict[str, Optional[_OrderPlan]] = {}
    first_row: dict[str, int] = {}
    skipped: dict[str, int] = {}
    for row, ov in ov_rows:
        project = _cell_str(ov["Proyecto"])
        if not project:
            plan.error(OV_SHEET, row, None, "Proyecto es obligatorio.")
            continue
        if project in first_row:
            plan.error(OV_SHEET, row, project, f"Proyecto duplicado (ya aparece en la fila {first_row[project]}).")
            continue
        first_row[project] = row
        if project in lookups.legacy_projects:
            known[project] = None
            skipped[project] = row
            continue
        known[project] = _validate_order_row(plan, lookups, row, ov)
    return known, skipped


def _warn_folio_shapes(plan: _ImportPlan, row: int, project: str, inv: dict) -> None:
    amounts = []
    for label in INVOICE_AMOUNT_FIELDS:
        try:
            amounts.append(_parse_number(inv[label], label))
        except ValueError:
            continue
    for label in FOLIO_FIELDS:
        raw = inv[label]
        if _is_blank(raw):
            continue
        text = _cell_str(raw)
        has_decimals = (isinstance(raw, float) and not raw.is_integer()) or bool(DECIMAL_TEXT.match(text))
        try:
            numeric = float(text)
        except ValueError:
            numeric = None
        equals_amount = numeric is not None and any(a > 0 and abs(numeric - a) < AMOUNT_TOLERANCE for a in amounts)
        if has_decimals or equals_amount:
            plan.warn(INV_SHEET, row, project, f"{label} «{text}» tiene decimales o parece un monto.")


def _warn_dates(
    plan: _ImportPlan, row: int, project: str, invoice_date: datetime, installments: list[_InstallmentPlan]
) -> None:
    today = datetime.utcnow().date()
    if invoice_date.date() > today:
        plan.warn(INV_SHEET, row, project, f"Fecha_Factura {invoice_date:%d/%m/%Y} es futura.")
    for inst in installments:
        label = f"Abono{inst.slot}_Fecha"
        if inst.payment_date.date() > today:
            plan.warn(INV_SHEET, row, project, f"{label} {inst.payment_date:%d/%m/%Y} es futura.")
        if inst.payment_date.date() < invoice_date.date():
            plan.warn(
                INV_SHEET, row, project,
                f"{label} {inst.payment_date:%d/%m/%Y} es anterior a Fecha_Factura {invoice_date:%d/%m/%Y}.",
            )


def _validate_invoice_row(plan: _ImportPlan, row: int, project: str, inv: dict) -> Optional[_InvoicePlan]:
    errors_before = len(plan.errors)

    def check(parse: Callable[[], Any]) -> Any:
        return plan.attempt(INV_SHEET, row, project, parse)

    ptype = check(lambda: _parse_payment_type(inv["Tipo"]))
    folio = check(lambda: _parse_required_folio(inv["Folio_Factura"]))
    invoice_date = check(lambda: _parse_date(inv["Fecha_Factura"], "Fecha_Factura", required=True))
    amount = check(lambda: _parse_positive(inv["Monto_Factura"], "Monto_Factura"))
    notes = [check(lambda f=f, m=m: _parse_credit_note(inv, f, m)) for f, m in CREDIT_NOTE_FIELDS]
    slots = [check(lambda s=s: _parse_installment(inv, s)) for s in INSTALLMENT_SLOTS]
    installments = [i for i in slots if i is not None]
    _warn_folio_shapes(plan, row, project, inv)
    if invoice_date is not None:
        _warn_dates(plan, row, project, invoice_date, installments)
    if len(plan.errors) > errors_before:
        return None
    (nc_adv_folio, nc_adv_amount), (nc_fg_folio, nc_fg_amount) = notes
    return _InvoicePlan(
        row=row,
        payment_type=ptype,
        folio=folio,
        invoice_date=invoice_date,
        amount=amount,
        nc_advance_folio=nc_adv_folio,
        nc_advance_amount=nc_adv_amount,
        nc_retention_folio=nc_fg_folio,
        nc_retention_amount=nc_fg_amount,
        installments=installments,
    )


def _validate_invoices(
    plan: _ImportPlan,
    inv_rows: list[tuple[int, dict]],
    known: dict[str, Optional[_OrderPlan]],
    skipped: dict[str, int],
) -> None:
    skipped_invoices = {project: 0 for project in skipped}
    for row, inv in inv_rows:
        project = _cell_str(inv["Proyecto"])
        if not project:
            plan.error(INV_SHEET, row, None, "Proyecto es obligatorio.")
            continue
        if project not in known:
            plan.error(INV_SHEET, row, project, f"El proyecto «{project}» no existe en la hoja OVs.")
            continue
        if project in skipped:
            skipped_invoices[project] += 1
            continue
        invoice = _validate_invoice_row(plan, row, project, inv)
        order = known[project]
        if invoice is not None and order is not None:
            order.invoices.append(invoice)
    for project, row in skipped.items():
        plan.warn(
            OV_SHEET, row, project,
            f"La OV legacy ya existe en el sistema; se omitirá junto con {skipped_invoices[project]} factura(s).",
        )


def _check_order_totals(plan: _ImportPlan, order: _OrderPlan) -> None:
    if not order.invoices:
        plan.warn(
            OV_SHEET, order.row, order.project,
            f"La OV no tiene facturas; se creará en PENDING con saldo {order.total_price:,.2f}.",
        )
    invoiced_advance = round(
        sum(inv.amount for inv in order.invoices if inv.payment_type == PaymentType.ADVANCE), 2
    )
    if (order.advance_collected > 0 or invoiced_advance > 0) and abs(
        invoiced_advance - order.advance_collected
    ) > AMOUNT_TOLERANCE:
        plan.warn(
            OV_SHEET, order.row, order.project,
            f"Anticipo_Cobrado {order.advance_collected:,.2f} no coincide con las facturas "
            f"ANTICIPO ({invoiced_advance:,.2f}).",
        )
    if order.outstanding() < -BALANCE_TOLERANCE:
        plan.error(
            OV_SHEET, order.row, order.project,
            f"Los abonos superan el total de la OV por {-order.outstanding():,.2f}.",
        )


def _sort_issues(issues: list[dict]) -> list[dict]:
    return sorted(issues, key=lambda i: (0 if i["sheet"] == OV_SHEET else 1, i["row"] or 0))


def _build_plan(session: Session, file_bytes: bytes) -> _ImportPlan:
    wb = _load_workbook(file_bytes)
    ov_rows = _read_sheet_rows(wb, OV_SHEET, OV_HEADERS)
    inv_rows = _read_sheet_rows(wb, INV_SHEET, INV_HEADERS)
    plan = _ImportPlan()
    if not ov_rows:
        plan.error(OV_SHEET, None, None, "La hoja OVs no tiene filas para importar.")
    lookups = _Lookups(session)
    known, skipped = _validate_orders(plan, lookups, ov_rows)
    _validate_invoices(plan, inv_rows, known, skipped)
    plan.orders = [order for order in known.values() if order is not None]
    for order in plan.orders:
        _check_order_totals(plan, order)
    plan.errors = _sort_issues(plan.errors)
    plan.warnings = _sort_issues(plan.warnings)
    return plan


def _preview_order(order: _OrderPlan) -> dict:
    outstanding = order.outstanding()
    return {
        "row": order.row,
        "project_name": order.project,
        "client_name": order.client.full_name,
        "seller_name": order.seller.full_name,
        "tax_rate_name": order.tax_rate.name,
        "total_price": order.total_price,
        "subtotal": order.subtotal,
        "tax_amount": order.tax_amount(),
        "invoices": len(order.invoices),
        "installments": order.installment_count(),
        "outstanding_balance": outstanding if outstanding > BALANCE_TOLERANCE else 0.0,
        "payment_status": order.payment_status().value,
    }


def validate_legacy_workbook(session: Session, file_bytes: bytes) -> dict:
    plan = _build_plan(session, file_bytes)
    return {
        "orders": [_preview_order(order) for order in plan.orders],
        "orders_to_create": len(plan.orders),
        "invoices_to_create": sum(len(order.invoices) for order in plan.orders),
        "installments_to_create": sum(order.installment_count() for order in plan.orders),
        "can_import": not plan.errors and bool(plan.orders),
        "errors": plan.errors,
        "warnings": plan.warnings,
    }


# ---------------------------------------------------------------------------
# Import phase (single transaction)
# ---------------------------------------------------------------------------

def _create_order_record(session: Session, plan: _OrderPlan) -> SalesOrder:
    advance = plan.advance_collected
    order = SalesOrder(
        client_id=plan.client.id,
        tax_rate_id=plan.tax_rate.id,
        user_id=plan.seller.id,
        project_name=plan.project,
        status=SalesOrderStatus.SOLD,
        is_legacy=True,
        is_approved_by_director=True,
        director_approved_at=datetime.utcnow(),
        valid_until=datetime.utcnow() + timedelta(days=365),
        advance_percent=round((advance / plan.total_price) * 100.0, 2) if advance > 0 else 0.0,
        advance_invoice_amount=advance or None,
        has_advance_invoice=advance > 0,
        applied_commission_percent=plan.commission_pct,
        commission_amount=round(plan.subtotal * (plan.commission_pct / 100.0), 2),
        subtotal=plan.subtotal,
        tax_amount=plan.tax_amount(),
        total_price=plan.total_price,
        outstanding_balance=plan.total_price,
        payment_status=PaymentStatus.PENDING,
        notes=plan.notes,
    )
    session.add(order)
    session.flush()
    session.add(
        SalesOrderItem(
            sales_order_id=order.id,
            product_name="Contrato legacy (migración)",
            quantity=1.0,
            unit_price=plan.subtotal,
            subtotal_price=plan.subtotal,
            cost_snapshot={"legacy": True},
            frozen_unit_cost=0.0,
        )
    )
    session.flush()
    return order


def _set_pending_retention(cxc: CustomerPayment, order: SalesOrder, inv: _InvoicePlan) -> None:
    """Mirrors register_progress: the FG credit note becomes a retention owed by the client."""
    retention_days = int(getattr(order, "default_retention_days", None) or 90)
    cxc.retention_amount = inv.nc_retention_amount
    cxc.retention_status = "PENDING"
    cxc.retention_percent = float(getattr(order, "default_retention_percent", None) or 0.0)
    cxc.retention_days = retention_days
    cxc.retention_due_date = sales_service._calc_retention_due(inv.invoice_date, retention_days)  # noqa: SLF001


def _create_invoice_record(session: Session, order: SalesOrder, inv: _InvoicePlan, director_id: int) -> None:
    cxc = CustomerPayment(
        sales_order_id=order.id,
        payment_type=inv.payment_type,
        invoice_folio=inv.folio,
        invoice_date=inv.invoice_date,
        amount=inv.amount,
        status=CXCStatus.PENDING,
        payment_method=PaymentMethod.TRANSFER,
        created_by_user_id=director_id,
        nc_advance_folio=inv.nc_advance_folio,
        nc_advance_amount=inv.nc_advance_amount,
        nc_retention_folio=inv.nc_retention_folio,
        nc_retention_amount=inv.nc_retention_amount,
    )
    if inv.payment_type == PaymentType.PROGRESS and inv.nc_advance_amount > 0:
        cxc.amortized_advance = inv.nc_advance_amount
    if inv.nc_retention_folio and inv.nc_retention_amount > 0:
        _set_pending_retention(cxc, order, inv)
    session.add(cxc)
    session.flush()
    for inst in inv.installments:
        session.add(
            CustomerPaymentInstallment(
                customer_payment_id=cxc.id,
                amount=inst.amount,
                payment_date=inst.payment_date,
                payment_method=PaymentMethod.TRANSFER,
                created_by_user_id=director_id,
                is_advance=inv.payment_type == PaymentType.ADVANCE,
            )
        )
    order.outstanding_balance = round(float(order.outstanding_balance or 0.0) - inv.paid(), 2)
    sales_service._recalc_cxc_status(session, cxc, order)  # noqa: SLF001
    session.add(cxc)


def _create_order(session: Session, plan: _OrderPlan, director_id: int) -> dict:
    order = _create_order_record(session, plan)
    for inv in plan.invoices:
        _create_invoice_record(session, order, inv, director_id)
    order.payment_status = plan.payment_status()
    if order.payment_status == PaymentStatus.PAID:
        order.outstanding_balance = 0.0
    session.add(order)
    session.flush()
    return {
        "project_name": plan.project,
        "order_id": order.id,
        "folio": sales_service._order_reference(order.id),  # noqa: SLF001
        "outstanding_balance": float(order.outstanding_balance or 0.0),
    }


def _empty_result(errors: list[dict], warnings: list[dict]) -> dict:
    return {
        "orders_created": 0,
        "invoices_created": 0,
        "installments_created": 0,
        "orders_created_details": [],
        "warnings": warnings,
        "errors": errors,
    }


def import_legacy_workbook(session: Session, file_bytes: bytes, director: User) -> dict:
    plan = _build_plan(session, file_bytes)
    if plan.errors or not plan.orders:
        errors = plan.errors or [
            {"sheet": OV_SHEET, "row": None, "project": None, "message": "No hay OVs nuevas para importar."}
        ]
        return _empty_result(errors, plan.warnings)
    current: Optional[_OrderPlan] = None
    try:
        details = []
        for order_plan in plan.orders:
            current = order_plan
            details.append(_create_order(session, order_plan, director.id))
        session.commit()
    except Exception as exc:  # noqa: BLE001 — any failure rolls back the whole file
        session.rollback()
        logger.error("legacy_import_failed", project=current.project if current else None, error=str(exc))
        message = f"La importación falló y no se guardó nada: {exc}"
        issue = {"sheet": OV_SHEET, "row": current.row if current else None,
                 "project": current.project if current else None, "message": message}
        return _empty_result([issue], plan.warnings)
    logger.info("legacy_import_completed", orders=len(details))
    result = _empty_result([], plan.warnings)
    result["orders_created"] = len(details)
    result["invoices_created"] = sum(len(o.invoices) for o in plan.orders)
    result["installments_created"] = sum(o.installment_count() for o in plan.orders)
    result["orders_created_details"] = details
    return result
