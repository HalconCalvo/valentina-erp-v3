"""Petty cash movements and supplier payment requests are cancelled with a reason, never deleted."""
from datetime import date

from sqlmodel import select

from app.core.config import settings
from app.models.finance import PaymentStatus, PurchaseInvoice, SupplierPayment
from app.models.foundations import Provider
from app.models.petty_cash import PettyCashFund, PettyCashMovement
from app.models.users import User

API = settings.API_V1_STR


def _director(session):
    return session.exec(select(User).where(User.role == "DIRECTOR")).first()


def test_petty_cash_movement_is_cancelled_and_balance_reverted(client_fixture, session_fixture, auth_header_director):
    director = _director(session_fixture)
    fund = PettyCashFund(fund_amount=5000, minimum_balance=1000, current_balance=4500)
    movement = PettyCashMovement(movement_type="EGRESO", amount=500, concept="Gasolina", created_by_id=director.id)
    session_fixture.add_all([fund, movement])
    session_fixture.commit()
    url = f"{API}/petty-cash/movements/{movement.id}"
    assert client_fixture.patch(f"{url}/cancel", headers=auth_header_director, json={"reason": " "}).status_code == 422
    response = client_fixture.patch(f"{url}/cancel", headers=auth_header_director, json={"reason": "Capturado dos veces"})
    assert response.status_code == 200, response.text
    assert response.json()["is_cancelled"] is True and response.json()["cancel_reason"] == "Capturado dos veces"
    session_fixture.expire_all()
    assert session_fixture.get(PettyCashMovement, movement.id) is not None
    assert session_fixture.get(PettyCashFund, fund.id).current_balance == 5000
    assert client_fixture.patch(url, headers=auth_header_director, json={"amount": 10}).status_code == 409
    assert client_fixture.patch(f"{url}/cancel", headers=auth_header_director, json={"reason": "otra vez"}).status_code == 409
    assert client_fixture.delete(url, headers=auth_header_director).status_code == 405


def test_sales_cannot_cancel_petty_cash(client_fixture, session_fixture, sales_token):
    movement = PettyCashMovement(movement_type="EGRESO", amount=50, concept="x", created_by_id=_director(session_fixture).id)
    session_fixture.add(movement)
    session_fixture.commit()
    response = client_fixture.patch(f"{API}/petty-cash/movements/{movement.id}/cancel",
                                    headers={"Authorization": f"Bearer {sales_token}"}, json={"reason": "x"})
    assert response.status_code == 403


def test_payment_request_is_cancelled_with_reason(client_fixture, session_fixture, auth_header_director):
    provider = Provider(business_name="Prov pago", credit_days=0, is_active=True)
    session_fixture.add(provider)
    session_fixture.flush()
    invoice = PurchaseInvoice(provider_id=provider.id, invoice_number="F-9", total_amount=100, outstanding_balance=100,
                              issue_date=date.today(), due_date=date.today())
    session_fixture.add(invoice)
    session_fixture.flush()
    payment = SupplierPayment(purchase_invoice_id=invoice.id, provider_id=provider.id, amount=100,
                              payment_date=date.today(), created_by_user_id=_director(session_fixture).id)
    session_fixture.add(payment)
    session_fixture.commit()
    url = f"{API}/finance/payments/request/{payment.id}"
    response = client_fixture.patch(f"{url}/cancel", headers=auth_header_director, json={"reason": "Proveedor dio descuento"})
    assert response.status_code == 200, response.text
    session_fixture.expire_all()
    payment = session_fixture.get(SupplierPayment, payment.id)
    assert payment.status == PaymentStatus.CANCELLED and "Proveedor dio descuento" in payment.notes
    assert client_fixture.delete(url, headers=auth_header_director).status_code == 405
