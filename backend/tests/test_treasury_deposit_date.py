"""H9: an income is registered with the date of the deposit; the invoice payment it creates carries that date."""
from datetime import timedelta

from sqlmodel import select

from app.core.business_time import today_local, utc_naive_to_local
from app.core.config import settings
from app.models.sales import CustomerPaymentInstallment
from tests.sales_helpers import create_order_via_quotation
from tests.test_supplier_advances import _account

API = settings.API_V1_STR


def test_income_takes_the_deposit_date_and_rejects_a_future_one(client_fixture, session_fixture,
                                                                auth_header_director, seed_client_and_tax):
    order = create_order_via_quotation(client_fixture, auth_header_director, seed_client_and_tax[0].id,
                                       seed_client_and_tax[1].id)
    invoice = client_fixture.post(f"{API}/sales/orders/{order['id']}/emit_advance_invoice",
                                  headers=auth_header_director, json={"amount": 1000.0, "invoice_folio": "FA-H9"}).json()
    account = _account(session_fixture)
    body = {"account_id": account.id, "transaction_type": "IN", "amount": 400.0,
            "related_entity_type": "CUSTOMER_PAYMENT", "related_entity_id": invoice["cxc_id"]}
    future = client_fixture.post(f"{API}/treasury/transactions", headers=auth_header_director,
                                 json={**body, "deposit_date": (today_local() + timedelta(days=1)).isoformat()})
    assert future.status_code == 400
    yesterday = today_local() - timedelta(days=1)
    created = client_fixture.post(f"{API}/treasury/transactions", headers=auth_header_director,
                                  json={**body, "deposit_date": yesterday.isoformat()})
    assert created.status_code == 200, created.text
    paid = session_fixture.exec(select(CustomerPaymentInstallment)
                                .where(CustomerPaymentInstallment.customer_payment_id == invoice["cxc_id"])).one()
    assert utc_naive_to_local(paid.payment_date).date() == yesterday
