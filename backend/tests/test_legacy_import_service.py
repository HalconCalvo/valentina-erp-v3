import io
from datetime import datetime

import pytest
from openpyxl import Workbook
from sqlmodel import select

from app.core.config import settings
from app.models.foundations import TaxRate
from app.models.sales import CustomerPayment, PaymentStatus, SalesOrder, SalesOrderStatus
from app.models.users import User
from app.services import legacy_import_service as svc
from tests.conftest import TEST_DIRECTOR_EMAIL


def _ov(**overrides) -> dict:
    row = {
        "Proyecto": "Proyecto A",
        "Cliente": "Cliente Test",
        "Vendedor": "Sales Test",
        "IVA%": 16,
        "Total_OV_con_IVA": 116000,
        "Anticipo_Cobrado": 58000,
        "Comision_Pct": 3,
    }
    row.update(overrides)
    return row


def _inv(**overrides) -> dict:
    row = {
        "Proyecto": "Proyecto A",
        "Tipo": "ANTICIPO",
        "Folio_Factura": 101,
        "Fecha_Factura": datetime(2026, 1, 10),
        "Monto_Factura": 58000,
        "Abono1_Fecha": datetime(2026, 1, 12),
        "Abono1_Monto": 58000,
    }
    row.update(overrides)
    return row


def _workbook(ov_rows: list[dict], inv_rows: list[dict]) -> bytes:
    wb = Workbook()
    ws = wb.active
    ws.title = svc.OV_SHEET
    ws.append(svc.OV_HEADERS)
    for row in ov_rows:
        ws.append([row.get(h) for h in svc.OV_HEADERS])
    ws_inv = wb.create_sheet(svc.INV_SHEET)
    ws_inv.append(svc.INV_HEADERS)
    for row in inv_rows:
        ws_inv.append([row.get(h) for h in svc.INV_HEADERS])
    buffer = io.BytesIO()
    wb.save(buffer)
    return buffer.getvalue()


def _messages(issues: list[dict]) -> str:
    return " | ".join(f"{i['sheet']}:{i['row']}:{i['message']}" for i in issues)


def _add_rate(session, name: str, rate: float) -> TaxRate:
    tax = TaxRate(name=name, rate=rate, is_active=True)
    session.add(tax)
    session.commit()
    session.refresh(tax)
    return tax


@pytest.fixture
def director(session_fixture) -> User:
    return session_fixture.exec(select(User).where(User.email == TEST_DIRECTOR_EMAIL)).first()


def _count_orders(session) -> int:
    return len(session.exec(select(SalesOrder)).all())


# --- Happy path -------------------------------------------------------------

def test_validate_happy_path_writes_nothing(session_fixture):
    data = _workbook([_ov()], [_inv()])
    preview = svc.validate_legacy_workbook(session_fixture, data)
    assert preview["errors"] == []
    assert preview["can_import"] is True
    assert preview["orders_to_create"] == 1
    assert preview["orders"][0]["payment_status"] == "PARTIAL"
    assert preview["orders"][0]["outstanding_balance"] == 58000
    assert _count_orders(session_fixture) == 0


def test_import_creates_orders_and_pending_status(session_fixture, director):
    data = _workbook(
        [_ov(), _ov(Proyecto="Proyecto B", Anticipo_Cobrado=None)],
        [_inv(), _inv(Tipo="AVANCE", Folio_Factura=102, Abono1_Fecha=None, Abono1_Monto=None)],
    )
    result = svc.import_legacy_workbook(session_fixture, data, director)
    assert result["errors"] == []
    assert result["orders_created"] == 2
    assert result["invoices_created"] == 2
    orders = {o.project_name: o for o in session_fixture.exec(select(SalesOrder)).all()}
    assert orders["Proyecto A"].payment_status == PaymentStatus.PARTIAL
    assert orders["Proyecto A"].user_id != director.id
    assert orders["Proyecto B"].payment_status == PaymentStatus.PENDING
    assert "no tiene facturas" in _messages(result["warnings"])


# --- IVA --------------------------------------------------------------------

def test_exento_resolves_by_name(session_fixture):
    _add_rate(session_fixture, "Tasa Cero", 0.0)
    exempt = _add_rate(session_fixture, "Exento", 0.0)
    data = _workbook([_ov(**{"IVA%": "exento", "Anticipo_Cobrado": None})], [])
    preview = svc.validate_legacy_workbook(session_fixture, data)
    assert preview["errors"] == []
    assert preview["orders"][0]["tax_rate_name"] == exempt.name
    assert preview["orders"][0]["subtotal"] == 116000


def test_exento_without_exempt_rate_is_error(session_fixture):
    _add_rate(session_fixture, "Tasa Cero", 0.0)
    data = _workbook([_ov(**{"IVA%": "EXENTO", "Anticipo_Cobrado": None})], [])
    preview = svc.validate_legacy_workbook(session_fixture, data)
    assert "no existe una tasa activa llamada «Exento»" in _messages(preview["errors"])
    assert preview["can_import"] is False


def test_zero_resolves_to_tasa_cero_not_exento(session_fixture):
    _add_rate(session_fixture, "Exento", 0.0)
    _add_rate(session_fixture, "Tasa Cero", 0.0)
    data = _workbook([_ov(**{"IVA%": 0, "Anticipo_Cobrado": None})], [])
    preview = svc.validate_legacy_workbook(session_fixture, data)
    assert preview["errors"] == []
    assert preview["orders"][0]["tax_rate_name"] == "Tasa Cero"


def test_duplicate_exento_rate_is_ambiguous(session_fixture):
    _add_rate(session_fixture, "Exento", 0.0)
    _add_rate(session_fixture, " exento ", 0.0)
    data = _workbook([_ov(**{"IVA%": "EXENTO", "Anticipo_Cobrado": None})], [])
    preview = svc.validate_legacy_workbook(session_fixture, data)
    assert "más de una tasa activa" in _messages(preview["errors"])


@pytest.mark.parametrize(
    "iva, expected",
    [("IVA", "IVA% no reconocido"), (8, "No existe una tasa de IVA activa de 8%"), (None, "no reconocido")],
)
def test_unrecognized_or_missing_rate_never_falls_back(session_fixture, iva, expected):
    data = _workbook([_ov(**{"IVA%": iva, "Anticipo_Cobrado": None})], [])
    preview = svc.validate_legacy_workbook(session_fixture, data)
    assert expected in _messages(preview["errors"])
    assert preview["orders"] == []


# --- Cross-sheet and row rules ----------------------------------------------

def test_invoice_with_unknown_project_reports_row(session_fixture):
    data = _workbook([_ov()], [_inv(), _inv(Proyecto="PIEDRA NORTE", Folio_Factura=102)])
    preview = svc.validate_legacy_workbook(session_fixture, data)
    assert {"sheet": "Facturas", "row": 3, "project": "PIEDRA NORTE",
            "message": "El proyecto «PIEDRA NORTE» no existe en la hoja OVs."} in preview["errors"]


def test_duplicate_project_is_error(session_fixture):
    data = _workbook([_ov(), _ov()], [_inv()])
    preview = svc.validate_legacy_workbook(session_fixture, data)
    assert "OVs:3:Proyecto duplicado (ya aparece en la fila 2)." in _messages(preview["errors"])


def test_unknown_seller_and_non_numeric_total_are_errors(session_fixture):
    data = _workbook([_ov(Vendedor="Nadie", Total_OV_con_IVA="mucho")], [])
    preview = svc.validate_legacy_workbook(session_fixture, data)
    text = _messages(preview["errors"])
    assert "Vendedor no encontrado: «Nadie»" in text
    assert "Total_OV_con_IVA no es un número válido" in text


def test_missing_folio_is_error(session_fixture):
    data = _workbook([_ov()], [_inv(Folio_Factura=None)])
    preview = svc.validate_legacy_workbook(session_fixture, data)
    assert "Facturas:2:Folio_Factura es obligatorio." in _messages(preview["errors"])


def test_folio_with_decimals_is_warning(session_fixture):
    data = _workbook(
        [_ov(Anticipo_Cobrado=None)],
        [_inv(Tipo="AVANCE", NC_Anticipo_Folio=63020.4, NC_Anticipo_Monto=8521.45,
              Abono1_Fecha=None, Abono1_Monto=None)],
    )
    preview = svc.validate_legacy_workbook(session_fixture, data)
    assert preview["errors"] == []
    assert "NC_Anticipo_Folio «63020.4» tiene decimales o parece un monto." in _messages(preview["warnings"])


@pytest.mark.parametrize(
    "overrides, expected",
    [
        ({"NC_Anticipo_Monto": 500}, "NC_Anticipo_Monto 500.00 no tiene NC_Anticipo_Folio."),
        ({"NC_FG_Folio": "NC-9"}, "NC_FG_Folio «NC-9» no tiene NC_FG_Monto."),
    ],
)
def test_credit_note_requires_folio_and_amount(session_fixture, overrides, expected):
    data = _workbook([_ov()], [_inv(**overrides)])
    preview = svc.validate_legacy_workbook(session_fixture, data)
    assert expected in _messages(preview["errors"])


@pytest.mark.parametrize(
    "overrides, expected",
    [
        ({"Fecha_Factura": None}, "Fecha_Factura es obligatoria."),
        ({"Abono2_Fecha": "22/05/226"}, "Abono2_Fecha no es una fecha válida"),
        ({"Abono2_Fecha": "22/05/2026"}, "Abono2_Fecha tiene fecha pero Abono2_Monto está vacío."),
        ({"Abono1_Fecha": None}, "Abono1_Monto 58,000.00 no tiene Abono1_Fecha."),
    ],
)
def test_date_rules(session_fixture, overrides, expected):
    data = _workbook([_ov()], [_inv(**overrides)])
    preview = svc.validate_legacy_workbook(session_fixture, data)
    assert expected in _messages(preview["errors"])


def test_text_date_in_day_month_year_is_accepted(session_fixture):
    data = _workbook([_ov()], [_inv(Fecha_Factura="10/01/2026", Abono1_Fecha="12/01/2026")])
    preview = svc.validate_legacy_workbook(session_fixture, data)
    assert preview["errors"] == []


def test_overpayment_is_error(session_fixture):
    data = _workbook([_ov(Total_OV_con_IVA=50000)], [_inv()])
    preview = svc.validate_legacy_workbook(session_fixture, data)
    assert "Los abonos superan el total de la OV por 8,000.00" in _messages(preview["errors"])


def test_credit_notes_do_not_reduce_balance_and_fg_creates_retention(session_fixture, director):
    progress = _inv(
        Tipo="AVANCE", Folio_Factura=102, Fecha_Factura=datetime(2026, 2, 1), Monto_Factura=100000,
        NC_Anticipo_Folio="NC-1", NC_Anticipo_Monto=50000, NC_FG_Folio="FG-1", NC_FG_Monto=5000,
        Abono1_Fecha=datetime(2026, 2, 5), Abono1_Monto=45000,
    )
    data = _workbook([_ov()], [_inv(), progress])
    preview = svc.validate_legacy_workbook(session_fixture, data)
    assert preview["errors"] == []
    assert preview["orders"][0]["outstanding_balance"] == 13000
    svc.import_legacy_workbook(session_fixture, data, director)
    order = session_fixture.exec(select(SalesOrder)).first()
    assert order.outstanding_balance == 13000
    cxc = session_fixture.exec(select(CustomerPayment).where(CustomerPayment.invoice_folio == "102")).first()
    assert cxc.amortized_advance == 50000
    assert cxc.retention_amount == 5000
    assert cxc.retention_status == "PENDING"
    assert cxc.retention_due_date == datetime(2026, 5, 2)


def test_advance_mismatch_and_dates_are_warnings(session_fixture):
    data = _workbook(
        [_ov(Anticipo_Cobrado=49539.54)],
        [_inv(Monto_Factura=43539.54, Abono1_Fecha=datetime(2025, 1, 1), Abono1_Monto=43539.54)],
    )
    preview = svc.validate_legacy_workbook(session_fixture, data)
    assert preview["errors"] == []
    text = _messages(preview["warnings"])
    assert "no coincide con las facturas ANTICIPO (43,539.54)" in text
    assert "es anterior a Fecha_Factura" in text


def test_example_and_blank_rows_are_ignored(session_fixture):
    data = _workbook([_ov(Proyecto="# EJEMPLO"), _ov(), {"Notas": "  "}], [_inv(), {"Fecha_Factura": " "}])
    preview = svc.validate_legacy_workbook(session_fixture, data)
    assert preview["errors"] == []
    assert preview["orders_to_create"] == 1


# --- Existing orders, atomicity, endpoints ------------------------------------

def test_existing_legacy_order_is_skipped_with_warning(session_fixture, director):
    svc.import_legacy_workbook(session_fixture, _workbook([_ov()], [_inv()]), director)
    data = _workbook([_ov(), _ov(Proyecto="Proyecto B")], [_inv(), _inv(Proyecto="Proyecto B")])
    preview = svc.validate_legacy_workbook(session_fixture, data)
    assert preview["orders_to_create"] == 1
    assert "ya existe en el sistema; se omitirá junto con 1 factura(s)." in _messages(preview["warnings"])


def test_cancelled_legacy_order_can_be_reimported(session_fixture, director):
    svc.import_legacy_workbook(session_fixture, _workbook([_ov()], [_inv()]), director)
    order = session_fixture.exec(select(SalesOrder)).first()
    order.status = SalesOrderStatus.CANCELLED_OV
    session_fixture.add(order)
    session_fixture.commit()
    preview = svc.validate_legacy_workbook(session_fixture, _workbook([_ov()], [_inv()]))
    assert preview["orders_to_create"] == 1


def test_import_with_errors_writes_nothing(session_fixture, director):
    data = _workbook([_ov(), _ov(Proyecto="Proyecto B", Cliente="No existe")], [_inv()])
    result = svc.import_legacy_workbook(session_fixture, data, director)
    assert result["orders_created"] == 0
    assert "Cliente no encontrado" in _messages(result["errors"])
    assert _count_orders(session_fixture) == 0


def test_import_rolls_back_everything_on_failure(session_fixture, director, monkeypatch):
    original = svc._create_invoice_record
    calls = {"n": 0}

    def failing(session, order, inv, director_id):
        calls["n"] += 1
        if calls["n"] == 2:
            raise RuntimeError("boom")
        original(session, order, inv, director_id)

    monkeypatch.setattr(svc, "_create_invoice_record", failing)
    data = _workbook([_ov(), _ov(Proyecto="Proyecto B")], [_inv(), _inv(Proyecto="Proyecto B")])
    result = svc.import_legacy_workbook(session_fixture, data, director)
    assert result["orders_created"] == 0
    assert result["errors"][0]["project"] == "Proyecto B"
    assert "no se guardó nada" in result["errors"][0]["message"]
    assert _count_orders(session_fixture) == 0
    assert session_fixture.exec(select(CustomerPayment)).all() == []


def _upload(client, path: str, headers: dict | None, data: bytes):
    files = {"file": ("ovs.xlsx", data, "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet")}
    return client.post(f"{settings.API_V1_STR}{path}", headers=headers or {}, files=files)


def test_validate_endpoint_requires_director_or_manager(client_fixture, sales_token):
    response = _upload(
        client_fixture, "/sales/orders/legacy-import/validate",
        {"Authorization": f"Bearer {sales_token}"}, _workbook([_ov()], [_inv()]),
    )
    assert response.status_code == 403


def test_validate_endpoint_returns_preview(client_fixture, auth_header_director):
    response = _upload(
        client_fixture, "/sales/orders/legacy-import/validate", auth_header_director, _workbook([_ov()], [_inv()])
    )
    assert response.status_code == 200
    body = response.json()
    assert body["can_import"] is True
    assert body["orders"][0]["project_name"] == "Proyecto A"
