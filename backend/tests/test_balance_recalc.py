"""Sanitation tool 1: invoice states and sales order balances from the money (docs/SANEAMIENTO.md §6.1)."""
from sqlmodel import select

from app.core.config import settings
from app.core.security import create_access_token, get_password_hash
from app.models.audit import AuditFieldChange
from app.models.sales import (
    CustomerPayment, CustomerPaymentInstallment, CXCStatus, PaymentType, SalesCommission, SalesOrder, SalesOrderStatus,
)
from app.models.users import User, UserRole
from tests.sales_helpers import create_order_via_quotation

API = f"{settings.API_V1_STR}/sanitation/balances"


def _headers(session, role: UserRole) -> dict:
    user = User(email=f"{role.value.lower()}@recalc.local", full_name=role.value, role=role, is_active=True,
                hashed_password=get_password_hash("Pass123!"))
    session.add(user)
    session.commit()
    session.refresh(user)
    return {"Authorization": f"Bearer {create_access_token(subject=user.email, user_id=user.id, user_role=role.value)}"}


def _order(client, headers, seed, session) -> SalesOrder:
    data = create_order_via_quotation(client, headers, seed[0].id, seed[1].id)  # total 11,600
    return session.get(SalesOrder, data["id"])


def _invoice(session, order, amount, amortized=0.0, paid=0.0, status=CXCStatus.PENDING, kind=PaymentType.PROGRESS):
    cxc = CustomerPayment(sales_order_id=order.id, payment_type=kind, amount=amount, amortized_advance=amortized,
                          status=status, created_by_user_id=1, invoice_folio=f"F-{amount}")
    session.add(cxc)
    session.commit()
    if paid:
        session.add(CustomerPaymentInstallment(customer_payment_id=cxc.id, amount=paid, created_by_user_id=1))
        session.commit()
    session.refresh(cxc)
    return cxc


def test_preview_shows_invoice_paid_net_of_advance_and_order_balance(client_fixture, session_fixture,
                                                                     auth_header_director, seed_client_and_tax):
    order = _order(client_fixture, auth_header_director, seed_client_and_tax, session_fixture)
    advance = _invoice(session_fixture, order, 6960.0, paid=6960.0, status=CXCStatus.PAID, kind=PaymentType.ADVANCE)
    progress = _invoice(session_fixture, order, 4640.0, amortized=2784.0, paid=1856.0)
    order.status, order.outstanding_balance = SalesOrderStatus.FINISHED, 0.0
    session_fixture.add(order)
    session_fixture.commit()
    preview = client_fixture.get(API, headers=auth_header_director).json()
    assert [(r["cxc_id"], r["status"], r["new_status"]) for r in preview["invoices"]] == [(progress.id, "PENDING", "PAID")]
    assert advance.id not in [r["cxc_id"] for r in preview["invoices"]]
    row = next(r for r in preview["orders"] if r["sales_order_id"] == order.id)
    assert (row["computed_balance"], row["new_status"]) == (2784.0, "SOLD")  # 11,600 − 6,960 − 1,856


def test_apply_requires_reason_and_role_and_logs_changes(client_fixture, session_fixture, auth_header_director,
                                                         seed_client_and_tax):
    order = _order(client_fixture, auth_header_director, seed_client_and_tax, session_fixture)
    order.status = SalesOrderStatus.SOLD
    session_fixture.add(order)
    session_fixture.commit()
    cxc = _invoice(session_fixture, order, 11600.0, paid=11600.0)
    body = {"invoice_ids": [cxc.id], "order_ids": [order.id], "reason": "Facturas legacy cobradas"}
    for role in (UserRole.ADMIN, UserRole.SALES):
        assert client_fixture.post(f"{API}/apply", headers=_headers(session_fixture, role), json=body).status_code == 403
    assert client_fixture.post(f"{API}/apply", headers=auth_header_director, json={**body, "reason": ""}).status_code == 422
    manager = _headers(session_fixture, UserRole.MANAGER)
    result = client_fixture.post(f"{API}/apply", headers=manager, json={**body, "order_ids": [order.id, 999]})
    assert result.status_code == 200, result.text
    assert result.json()["invoices_updated"] == 1 and result.json()["orders_updated"] == 1
    assert result.json()["skipped"] == ["OV-0999: ya no tiene diferencia"]
    session_fixture.expire_all()
    assert session_fixture.get(CustomerPayment, cxc.id).status == CXCStatus.PAID
    saved = session_fixture.get(SalesOrder, order.id)
    assert (saved.outstanding_balance, saved.status) == (0.0, SalesOrderStatus.FINISHED)
    logged = session_fixture.exec(select(AuditFieldChange).where(AuditFieldChange.table_name == "sales_orders",
                                                                 AuditFieldChange.record_id == str(order.id))).all()
    assert any((row.reason or "").startswith("Saneamiento de saldos: Facturas legacy") for row in logged)
    again = client_fixture.get(API, headers=auth_header_director).json()
    assert cxc.id not in [r["cxc_id"] for r in again["invoices"]]
    assert order.id not in [r["sales_order_id"] for r in again["orders"]]


def test_advance_amortized_larger_than_invoice_is_an_anomaly(client_fixture, session_fixture, auth_header_director,
                                                             seed_client_and_tax):
    order = _order(client_fixture, auth_header_director, seed_client_and_tax, session_fixture)
    cxc = _invoice(session_fixture, order, 1000.0, amortized=1111.0)
    preview = client_fixture.get(API, headers=auth_header_director).json()
    assert cxc.id not in [r["cxc_id"] for r in preview["invoices"]]
    assert [a["cxc_id"] for a in preview["anomalies"]] == [cxc.id]


def test_installment_covering_the_net_amount_settles_invoice_with_net_commission(
        client_fixture, session_fixture, auth_header_director, seed_client_and_tax):
    order = _order(client_fixture, auth_header_director, seed_client_and_tax, session_fixture)
    order.applied_commission_percent = 0.05
    session_fixture.add(order)
    session_fixture.commit()
    cxc = _invoice(session_fixture, order, 4640.0, amortized=2784.0)
    url = f"{settings.API_V1_STR}/sales/invoices/{cxc.id}/installments"
    too_much = client_fixture.post(url, headers=auth_header_director, json={"amount": 1856.5})
    assert too_much.status_code == 400
    response = client_fixture.post(url, headers=auth_header_director, json={"amount": 1856.0})
    assert response.status_code == 200, response.text
    assert response.json()["saldada"] is True
    commission = session_fixture.exec(select(SalesCommission).where(SalesCommission.customer_payment_id == cxc.id)).first()
    assert round(commission.base_amount, 2) == 1600.0  # (4,640 − 2,784) ÷ 1.16
