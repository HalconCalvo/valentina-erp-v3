"""Writes that move money or stock require a session and the right role (security audit 2026-10-10)."""
import pytest

from app.core.config import settings
from app.core.security import create_access_token, get_password_hash
from app.models.foundations import GlobalConfig
from app.models.users import User

API = settings.API_V1_STR

SALES_FORBIDDEN = [
    ("post", "/treasury/transfer"),
    ("post", "/treasury/transactions"),
    ("post", "/treasury/transactions/bulk-cxc"),
    ("post", "/finance/payments/1/execute"),
    ("put", "/finance/payments/request/1"),
    ("put", "/finance/invoices/1/cancel"),
    ("post", "/sales/orders/1/emit_full_invoice"),
    ("post", "/sales/orders/1/cancel_ov"),
    ("post", "/sales/invoices/1/installments"),
    ("patch", "/sales/commissions/1/mark-paid"),
    ("post", "/purchases/orders/manual"),
    ("put", "/purchases/orders/1/receive"),
    ("post", "/inventory/products/1/stock"),
    ("put", "/logistics/assignments/1/mark-installed"),
]

NO_SESSION_FORBIDDEN = [
    ("patch", "/sales/payments/1"),
    ("post", "/inventory/products"),
    ("get", "/finance/invoices/pending"),
    ("get", "/finance/payable-stats"),
    ("get", "/logistics/payroll/overview"),
    ("get", "/purchases/orders/1/pdf"),
]


def _call(client, method, url, **kwargs):
    if method in ("get", "delete"):
        return getattr(client, method)(url, **kwargs)
    return getattr(client, method)(url, json={}, **kwargs)


@pytest.mark.parametrize("method,path", SALES_FORBIDDEN)
def test_sales_role_gets_403(client_fixture, sales_token, method, path):
    response = _call(client_fixture, method, f"{API}{path}", headers={"Authorization": f"Bearer {sales_token}"})
    assert response.status_code == 403, (path, response.status_code, response.text)


@pytest.mark.parametrize("method,path", NO_SESSION_FORBIDDEN)
def test_no_session_gets_401(client_fixture, method, path):
    response = _call(client_fixture, method, f"{API}{path}")
    assert response.status_code == 401, (path, response.status_code)


def _token_for(session, role):
    user = User(email=f"{role.lower()}@roles.local", full_name=role, role=role, is_active=True,
                hashed_password=get_password_hash("x-Secreta-123"))
    session.add(user)
    session.commit()
    session.refresh(user)
    return {"Authorization": f"Bearer {create_access_token(subject=user.email, user_id=user.id, user_role=role)}"}


def test_payment_execution_is_director_only_unless_switched_on(client_fixture, session_fixture, auth_header_director):
    manager, admin = _token_for(session_fixture, "MANAGER"), _token_for(session_fixture, "ADMIN")
    url = f"{API}/finance/payments/999/execute"
    assert client_fixture.post(url, headers=admin, json={}).status_code == 403
    assert client_fixture.post(url, headers=manager, json={}).status_code == 403
    assert client_fixture.post(url, headers=auth_header_director, json={}).status_code != 403
    session_fixture.add(GlobalConfig(company_name="K", target_profit_margin=0.45, cost_tolerance_percent=5,
                                     quote_validity_days=15, default_edgebanding_factor=1.1,
                                     manager_can_execute_payments=True))
    session_fixture.commit()
    assert client_fixture.post(url, headers=manager, json={}).status_code != 403
    assert client_fixture.post(url, headers=admin, json={}).status_code == 403


def test_only_director_and_design_plan(client_fixture, session_fixture):
    url = f"{API}/planning/instances/999/reschedule"
    for role in ("SALES", "MANAGER", "PRODUCTION"):
        assert client_fixture.patch(url, headers=_token_for(session_fixture, role), json={}).status_code == 403
    assert client_fixture.patch(url, headers=_token_for(session_fixture, "DESIGN"), json={}).status_code != 403
