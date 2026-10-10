"""Writes that move money or stock require a session and the right role (security audit 2026-10-10)."""
import pytest

from app.core.config import settings

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
