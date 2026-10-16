"""D41 (Gabriel 16/10): Gerencia (MANAGER) does not see or operate Bancos, does not register customer collections and
does not register supplier payments (403 with a clear message); Dirección and Administración keep what they had."""
from app.core.config import settings
from app.models.treasury import BankAccount
from app.models.users import UserRole
from tests.test_installation_flow import _user

API = settings.API_V1_STR


def test_manager_is_kept_out_of_banks_collections_and_supplier_payments(client_fixture, session_fixture,
                                                                         auth_header_director):
    account = BankAccount(name="Santander", account_number="1", current_balance=1000.0, initial_balance=1000.0)
    session_fixture.add(account)
    session_fixture.commit()
    _, manager = _user(session_fixture, UserRole.MANAGER, "Karina")
    _, admin = _user(session_fixture, UserRole.ADMIN, "Admin")
    denied = [
        ("get", f"{API}/treasury/accounts", None),
        ("get", f"{API}/treasury/accounts/{account.id}/transactions", None),
        ("post", f"{API}/treasury/transactions", {"account_id": account.id, "transaction_type": "IN", "amount": 10.0}),
        ("post", f"{API}/treasury/transactions/bulk-cxc", {"account_id": account.id, "amount": 10.0, "items": []}),
        ("post", f"{API}/sales/invoices/1/installments", {"amount": 10.0}),
        ("patch", f"{API}/sales/installments/1/cancel", {"cancel_reason": "x"}),
        ("post", f"{API}/sales/orders/1/confirm_payment/1", None),
        ("post", f"{API}/sales/payments/1/retention/collect", None),
        ("post", f"{API}/finance/payments/request", {"invoice_id": 1, "amount": 10.0, "payment_date": "2026-10-16",
                                                     "payment_method": "TRANSFER"}),
        ("post", f"{API}/finance/payments/1/execute", None),
        ("patch", f"{API}/treasury/transactions/1/cancel", {"cancel_reason": "x"}),
    ]
    for method, url, body in denied:
        response = getattr(client_fixture, method)(url, headers=manager, **({"json": body} if body else {}))
        assert response.status_code == 403, (url, response.text)
        assert "D41" in response.json()["detail"], url
    assert client_fixture.get(f"{API}/treasury/accounts", headers=auth_header_director).status_code == 200
    assert client_fixture.get(f"{API}/treasury/accounts", headers=admin).status_code == 200
