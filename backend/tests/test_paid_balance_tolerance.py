"""D16: a customer invoice or sales order with a balance of at most GlobalConfig.paid_balance_tolerance (initial
$1.00, only DIRECTOR changes it) counts as paid, when registering payments and in the sanitation tool."""
from sqlmodel import select

from app.core.config import settings
from app.models.foundations import GlobalConfig
from app.models.sales import CustomerPayment, CustomerPaymentInstallment, CXCStatus, SalesOrder, SalesOrderStatus
from app.models.users import UserRole
from tests.test_balance_recalc import _headers, _invoice, _order

SALES = f"{settings.API_V1_STR}/sales"
CONFIG = f"{settings.API_V1_STR}/foundations/config"
SANITATION = f"{settings.API_V1_STR}/sanitation/balances"
BODY = {"company_name": "K", "target_profit_margin": 0.45, "cost_tolerance_percent": 0.03, "quote_validity_days": 15,
        "default_edgebanding_factor": 1.1}


def _config(session, tolerance=None) -> GlobalConfig:
    config = GlobalConfig(**BODY)
    if tolerance is not None:
        config.paid_balance_tolerance = tolerance
    session.add(config)
    session.commit()
    return config


def _sold_order(client, headers, seed, session) -> SalesOrder:
    order = _order(client, headers, seed, session)  # total 11,600
    order.status, order.outstanding_balance = SalesOrderStatus.SOLD, 11600.0
    session.add(order)
    session.commit()
    return order


def test_default_is_one_peso(session_fixture):
    assert _config(session_fixture).paid_balance_tolerance == 1.0


def test_installment_leaving_a_peso_or_less_settles_invoice_and_order(client_fixture, session_fixture,
                                                                      auth_header_director, seed_client_and_tax):
    _config(session_fixture)
    order = _sold_order(client_fixture, auth_header_director, seed_client_and_tax, session_fixture)
    cxc = _invoice(session_fixture, order, 11600.0)
    paid = client_fixture.post(f"{SALES}/invoices/{cxc.id}/installments", headers=auth_header_director,
                               json={"amount": 11599.0})
    assert paid.status_code == 200, paid.text
    assert paid.json()["saldada"] is True and paid.json()["factura_status"] == "PAID"
    session_fixture.expire_all()
    saved = session_fixture.get(SalesOrder, order.id)
    assert (round(saved.outstanding_balance, 2), saved.status) == (1.0, SalesOrderStatus.FINISHED)


def test_installment_leaving_more_than_the_tolerance_keeps_it_pending(client_fixture, session_fixture,
                                                                      auth_header_director, seed_client_and_tax):
    _config(session_fixture)
    order = _sold_order(client_fixture, auth_header_director, seed_client_and_tax, session_fixture)
    cxc = _invoice(session_fixture, order, 11600.0)
    paid = client_fixture.post(f"{SALES}/invoices/{cxc.id}/installments", headers=auth_header_director,
                               json={"amount": 11598.99})
    assert paid.json()["saldada"] is False and paid.json()["factura_status"] == "PENDING"
    session_fixture.expire_all()
    assert session_fixture.get(SalesOrder, order.id).status == SalesOrderStatus.SOLD


def test_tolerance_zero_requires_the_exact_amount(client_fixture, session_fixture, auth_header_director,
                                                  seed_client_and_tax):
    _config(session_fixture, tolerance=0.0)
    order = _sold_order(client_fixture, auth_header_director, seed_client_and_tax, session_fixture)
    cxc = _invoice(session_fixture, order, 11600.0)
    paid = client_fixture.post(f"{SALES}/invoices/{cxc.id}/installments", headers=auth_header_director,
                               json={"amount": 11599.5})
    assert paid.json()["saldada"] is False


def test_editing_an_installment_reopens_beyond_the_tolerance(client_fixture, session_fixture,
                                                             auth_header_director, seed_client_and_tax):
    _config(session_fixture)
    order = _sold_order(client_fixture, auth_header_director, seed_client_and_tax, session_fixture)
    cxc = _invoice(session_fixture, order, 11600.0)
    url = f"{SALES}/invoices/{cxc.id}/installments"
    client_fixture.post(url, headers=auth_header_director, json={"amount": 11000.0})
    assert client_fixture.post(url, headers=auth_header_director, json={"amount": 599.5}).json()["saldada"] is True
    session_fixture.expire_all()
    assert session_fixture.get(SalesOrder, order.id).status == SalesOrderStatus.FINISHED
    last = session_fixture.exec(select(CustomerPaymentInstallment).where(
        CustomerPaymentInstallment.customer_payment_id == cxc.id, CustomerPaymentInstallment.amount == 599.5)).one()
    edited = client_fixture.patch(f"{SALES}/installments/{last.id}", headers=auth_header_director,
                                  json={"amount": 598.0})
    assert edited.status_code == 200, edited.text
    session_fixture.expire_all()
    assert session_fixture.get(CustomerPayment, cxc.id).status == CXCStatus.PENDING  # $2.00 left
    assert session_fixture.get(SalesOrder, order.id).status == SalesOrderStatus.SOLD


def test_sanitation_uses_the_tolerance(client_fixture, session_fixture, auth_header_director, seed_client_and_tax):
    _config(session_fixture)
    order = _sold_order(client_fixture, auth_header_director, seed_client_and_tax, session_fixture)
    near = _invoice(session_fixture, order, 5800.0, paid=5799.2)
    far = _invoice(session_fixture, order, 5800.0, paid=5798.5, status=CXCStatus.PAID)
    preview = client_fixture.get(SANITATION, headers=auth_header_director).json()
    assert {r["cxc_id"]: r["new_status"] for r in preview["invoices"]} == {near.id: "PAID", far.id: "PENDING"}
    row = next(r for r in preview["orders"] if r["sales_order_id"] == order.id)
    assert (row["computed_balance"], row["new_status"]) == (2.3, "SOLD")  # 11,600 − 11,597.70
    session_fixture.add(CustomerPaymentInstallment(customer_payment_id=far.id, amount=1.3, created_by_user_id=1))
    session_fixture.commit()
    preview = client_fixture.get(SANITATION, headers=auth_header_director).json()
    row = next(r for r in preview["orders"] if r["sales_order_id"] == order.id)
    assert (row["computed_balance"], row["new_status"]) == (1.0, "FINISHED")


def test_only_director_changes_the_tolerance(client_fixture, session_fixture, auth_header_director):
    _config(session_fixture)
    manager = _headers(session_fixture, UserRole.MANAGER)
    assert client_fixture.put(CONFIG, headers=manager, json={**BODY, "paid_balance_tolerance": 5}).status_code == 403
    assert client_fixture.put(CONFIG, headers=manager, json={**BODY, "paid_balance_tolerance": 1}).status_code == 200
    negative = client_fixture.put(CONFIG, headers=auth_header_director, json={**BODY, "paid_balance_tolerance": -1})
    assert negative.status_code == 400
    changed = client_fixture.put(CONFIG, headers=auth_header_director, json={**BODY, "paid_balance_tolerance": 2.5})
    assert changed.status_code == 200 and changed.json()["paid_balance_tolerance"] == 2.5
