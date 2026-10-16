"""D41 (Gabriel 16/10): Gerencia (MANAGER) does not see or operate Bancos, does not register customer collections and
does not register supplier payments (403 with a clear message); Dirección and Administración keep what they had."""
from app.core.config import settings
from app.models.foundations import GlobalConfig
from app.models.petty_cash import PettyCashFund, PettyCashMovement
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


def test_manager_only_sees_petty_cash_and_admin_registers(client_fixture, session_fixture, auth_header_director):
    """D41 (17:04): Gerencia only reads petty cash; Administración registers and sets the fund; Dirección cancels."""
    session_fixture.add(PettyCashFund(fund_amount=5000.0, minimum_balance=1000.0, current_balance=5000.0))
    movement = PettyCashMovement(movement_type="EGRESO", amount=10.0, concept="Agua", created_by_id=1)
    session_fixture.add(movement)
    session_fixture.commit()
    _, manager = _user(session_fixture, UserRole.MANAGER, "Karina")
    _, admin = _user(session_fixture, UserRole.ADMIN, "Admin")
    expense = {"movement_type": "EGRESO", "amount": 5.0, "concept": "Papel"}
    denied = [
        ("put", f"{API}/petty-cash/fund", {"fund_amount": 6000.0}),
        ("post", f"{API}/petty-cash/movements", expense),
        ("patch", f"{API}/petty-cash/movements/{movement.id}", {"concept": "x"}),
        ("patch", f"{API}/petty-cash/movements/{movement.id}/cancel", {"reason": "x"}),
    ]
    for method, url, body in denied:
        response = getattr(client_fixture, method)(url, headers=manager, json=body)
        assert response.status_code == 403, (url, response.text)
        assert "D41" in response.json()["detail"], url
    assert client_fixture.get(f"{API}/petty-cash/fund", headers=manager).status_code == 200
    assert client_fixture.get(f"{API}/petty-cash/movements", headers=manager).status_code == 200
    assert client_fixture.post(f"{API}/petty-cash/movements", headers=admin, json=expense).status_code == 200
    assert client_fixture.put(f"{API}/petty-cash/fund", headers=admin, json={"fund_amount": 6000.0}).status_code == 200
    cancel = f"{API}/petty-cash/movements/{movement.id}/cancel"
    assert client_fixture.patch(cancel, headers=admin, json={"reason": "x"}).status_code == 403
    assert client_fixture.patch(cancel, headers=auth_header_director, json={"reason": "Error"}).status_code == 200


def test_manager_never_pays_people_nor_approves_supplier_payments(client_fixture, session_fixture):
    """D41 (17:04): crew payroll and commissions are paid by Dirección even with the switch on; Gerencia does not
    approve supplier payment requests either."""
    session_fixture.add(GlobalConfig(company_name="K", target_profit_margin=0.45, cost_tolerance_percent=5,
                                     quote_validity_days=15, default_edgebanding_factor=1.1,
                                     manager_can_execute_payments=True))
    session_fixture.commit()
    _, manager = _user(session_fixture, UserRole.MANAGER, "Karina")
    cash = {"payment_method": "CASH"}
    denied = [
        ("post", f"{API}/logistics/payroll/pay-person", {"user_id": 1, "payroll_ids": [1], **cash}),
        ("patch", f"{API}/logistics/payroll/1/mark-paid", {"paid": True, **cash}),
        ("post", f"{API}/sales/commissions/pay-person", {"user_id": 1, "commission_ids": [1], **cash}),
        ("post", f"{API}/sales/commissions/1/pay", cash),
        ("put", f"{API}/finance/payments/1/status", {"status": "APPROVED", "approved_account_id": 1}),
    ]
    for method, url, body in denied:
        response = getattr(client_fixture, method)(url, headers=manager, json=body)
        assert response.status_code == 403, (url, response.text)
        assert "D41" in response.json()["detail"], url
