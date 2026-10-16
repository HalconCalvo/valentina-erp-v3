"""D37/H65/H66: commissions and installer payroll are paid through Banco (account) or Efectivo (petty cash), never
unspecified; the amount is the commission's own; one movement can pay all the rows of a person."""
from datetime import datetime

from sqlmodel import select

from app.core.config import settings
from app.models.petty_cash import PettyCashFund, PettyCashMovement
from app.models.production import InstallationAssignment, PayrollPayment, PayrollPaymentType, PayrollStatus
from app.models.sales import (CommissionType, CustomerPayment, CXCStatus, PaymentType, SalesCommission,
                              SalesOrderItem, SalesOrderItemInstance)
from app.models.treasury import BankAccount, BankTransaction
from tests.sales_helpers import create_order_via_quotation
from tests.test_installation_flow import _user
from app.models.users import UserRole

API = settings.API_V1_STR


def _commission(client, session, headers, seed) -> SalesCommission:
    order = create_order_via_quotation(client, headers, seed[0].id, seed[1].id)
    cxc = CustomerPayment(sales_order_id=order["id"], payment_type=PaymentType.ADVANCE, amount=33139.82,
                          status=CXCStatus.PAID, invoice_folio="A-PILOTO-1", created_by_user_id=1)
    session.add(cxc)
    session.commit()
    commission = SalesCommission(customer_payment_id=cxc.id, user_id=1, commission_type=CommissionType.SELLER,
                                 base_amount=28568.81, rate=0.05, commission_amount=1428.4405, is_advance=True)
    session.add_all([commission, PettyCashFund(fund_amount=5000.0, minimum_balance=1000.0, current_balance=5000.0)])
    session.commit()
    return commission


def test_a_commission_is_paid_with_a_method_and_its_movement(client_fixture, session_fixture, auth_header_director,
                                                             seed_client_and_tax):
    commission = _commission(client_fixture, session_fixture, auth_header_director, seed_client_and_tax)
    pay = f"{API}/sales/commissions/{commission.id}/pay"
    assert client_fixture.patch(f"{API}/sales/commissions/{commission.id}/mark-paid", headers=auth_header_director,
                                json={"is_paid": True}).status_code == 422
    assert client_fixture.post(pay, headers=auth_header_director, json={"payment_method": ""}).status_code == 422
    assert client_fixture.post(pay, headers=auth_header_director, json={"payment_method": "BANK"}).status_code == 422
    paid = client_fixture.post(pay, headers=auth_header_director, json={"payment_method": "CASH"})
    assert paid.status_code == 200, paid.text
    assert paid.json()["amount"] == 1428.44  # the advance commission is payable once collected (H57/H65)
    session_fixture.expire_all()
    movement = session_fixture.exec(select(PettyCashMovement)).one()
    assert (movement.movement_type, movement.amount, movement.category) == ("EGRESO", 1428.44, "Comisiones")
    assert session_fixture.exec(select(PettyCashFund)).one().current_balance == 5000.0 - 1428.44
    done = session_fixture.get(SalesCommission, commission.id)
    assert done.is_paid and done.payment_method == "CASH" and done.petty_cash_movement_id == movement.id
    assert client_fixture.post(pay, headers=auth_header_director, json={"payment_method": "CASH"}).status_code == 409


def test_pay_everything_to_a_person_with_one_movement(client_fixture, session_fixture, auth_header_director,
                                                      seed_client_and_tax):
    order = create_order_via_quotation(client_fixture, auth_header_director, seed_client_and_tax[0].id,
                                       seed_client_and_tax[1].id)
    item = session_fixture.exec(select(SalesOrderItem).where(SalesOrderItem.sales_order_id == order["id"])).first()
    house = session_fixture.exec(select(SalesOrderItemInstance)
                                 .where(SalesOrderItemInstance.sales_order_item_id == item.id)).first()
    david, _ = _user(session_fixture, UserRole.LOGISTICS, "David")
    other, _ = _user(session_fixture, UserRole.LOGISTICS, "Otro")
    lanes = [InstallationAssignment(instance_id=house.id, lane=lane, assignment_date=datetime(2026, 10, 16),
                                    leader_user_id=david.id) for lane in ("IM", "IP")]
    account = BankAccount(name="Santander", account_number="1", current_balance=10000.0, initial_balance=10000.0)
    session_fixture.add_all(lanes + [account])
    session_fixture.commit()
    rows = [PayrollPayment(installation_assignment_id=lane.id, user_id=david.id, payment_type=PayrollPaymentType.LEADER,
                           days_worked=1, daily_rate=800.0, total_amount=800.0, status=PayrollStatus.READY_TO_PAY)
            for lane in lanes]
    stranger = PayrollPayment(installation_assignment_id=lanes[0].id, user_id=other.id,
                              payment_type=PayrollPaymentType.HELPER, days_worked=1, daily_rate=700.0,
                              total_amount=700.0, status=PayrollStatus.READY_TO_PAY)
    session_fixture.add_all(rows + [stranger])
    session_fixture.commit()
    url = f"{API}/logistics/payroll/pay-person"
    mixed = client_fixture.post(url, headers=auth_header_director, json={
        "user_id": david.id, "payroll_ids": [rows[0].id, stranger.id], "payment_method": "BANK",
        "bank_account_id": account.id})
    assert mixed.status_code == 422
    paid = client_fixture.post(url, headers=auth_header_director, json={
        "user_id": david.id, "payroll_ids": [r.id for r in rows], "payment_method": "BANK", "bank_account_id": account.id})
    assert paid.status_code == 200, paid.text
    session_fixture.expire_all()
    tx = session_fixture.exec(select(BankTransaction)).one()
    assert tx.amount == 1600.0 and session_fixture.get(BankAccount, account.id).current_balance == 8400.0
    assert {(r.status, r.bank_transaction_id, r.payment_method) for r in
            (session_fixture.get(PayrollPayment, row.id) for row in rows)} == {(PayrollStatus.PAID, tx.id, "BANK")}
    single = client_fixture.patch(f"{API}/logistics/payroll/{stranger.id}/mark-paid", headers=auth_header_director,
                                  json={"paid": True})
    assert single.status_code == 422  # D37: never without a payment method


def test_collected_commissions_are_payable_from_the_list_with_one_movement(client_fixture, session_fixture,
                                                                           auth_header_director, seed_client_and_tax):
    """H67: an advance commission (even created unreleased) is in "Por pagar"; H69: its reference is folio · type;
    H68: every commission of a seller paid from the list with one movement."""
    advance = _commission(client_fixture, session_fixture, auth_header_director, seed_client_and_tax)
    cxc = session_fixture.get(CustomerPayment, advance.customer_payment_id)
    progress_cxc = CustomerPayment(sales_order_id=cxc.sales_order_id, payment_type=PaymentType.PROGRESS,
                                   amount=18411.01, amortized_advance=11046.61, status=CXCStatus.PAID,
                                   invoice_folio="F-Piloto1-01", created_by_user_id=1)
    session_fixture.add(progress_cxc)
    session_fixture.commit()
    progress = SalesCommission(customer_payment_id=progress_cxc.id, user_id=1, commission_type=CommissionType.SELLER,
                               base_amount=6348.62, rate=0.05, commission_amount=317.431, is_released=True)
    account = BankAccount(name="Santander", account_number="1", current_balance=5000.0, initial_balance=5000.0)
    session_fixture.add_all([progress, account])
    session_fixture.commit()
    overview = client_fixture.get(f"{API}/sales/commissions/payroll-overview", headers=auth_header_director).json()
    payable = {r["id"]: r for r in overview["payable"]}
    assert set(payable) == {advance.id, progress.id}
    assert [r for r in overview["retained"] if r["kind"] == "ACCRUED"] == []
    assert payable[advance.id]["reference_label"] == "A-PILOTO-1 · Anticipo"
    assert payable[progress.id]["reference_label"] == "F-Piloto1-01 · Avance"
    assert (payable[advance.id]["base_amount"], payable[advance.id]["rate"]) == (28568.81, 0.05)
    paid = client_fixture.post(f"{API}/sales/commissions/pay-person", headers=auth_header_director, json={
        "user_id": 1, "commission_ids": [advance.id, progress.id], "payment_method": "BANK", "account_id": account.id})
    assert paid.status_code == 200, paid.text
    assert paid.json()["amount"] == round(1428.4405 + 317.431, 2)
    session_fixture.expire_all()
    tx = session_fixture.exec(select(BankTransaction)).one()
    assert {session_fixture.get(SalesCommission, i).bank_transaction_id for i in (advance.id, progress.id)} == {tx.id}
