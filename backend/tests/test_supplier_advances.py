"""Supplier advances: Fast-Track respects D7, receptions never mark an unpaid advance as PAID, and the sanitation
tool absorbs the ones already marked (docs/SANEAMIENTO.md §4.1)."""
from datetime import date

from sqlmodel import select

from app.core.config import settings
from app.core.security import create_access_token, get_password_hash
from app.models.finance import InvoiceStatus, PaymentStatus, PurchaseInvoice, SupplierPayment
from app.models.foundations import GlobalConfig
from app.models.inventory import PurchaseOrder, PurchaseOrderItem
from app.models.treasury import BankAccount, BankTransaction
from app.models.users import User, UserRole
from tests.test_purchase_service import _authorize_po, _create_draft_po, _dispatch_po, _seed_provider_and_material

API = settings.API_V1_STR


def _headers(session, role: UserRole) -> dict:
    user = User(email=f"{role.value.lower()}@adv.local", full_name=role.value, role=role, is_active=True,
                hashed_password=get_password_hash("Pass123!"))
    session.add(user)
    session.commit()
    session.refresh(user)
    return {"Authorization": f"Bearer {create_access_token(subject=user.email, user_id=user.id, user_role=role.value)}"}


def _invoice(session, provider_id, number, total, status=InvoiceStatus.PENDING) -> PurchaseInvoice:
    invoice = PurchaseInvoice(provider_id=provider_id, invoice_number=number, total_amount=total, status=status,
                              outstanding_balance=0.0 if status == InvoiceStatus.PAID else total,
                              issue_date=date(2026, 10, 1), due_date=date(2026, 10, 1))
    session.add(invoice)
    session.commit()
    session.refresh(invoice)
    return invoice


def _account(session) -> BankAccount:
    account = BankAccount(name="Banco Test", account_number="1", current_balance=100000.0, initial_balance=100000.0)
    session.add(account)
    session.commit()
    session.refresh(account)
    return account


def test_fast_track_by_manager_without_switch_is_only_a_request(client_fixture, session_fixture, auth_header_director):
    session_fixture.add(GlobalConfig(company_name="K", target_profit_margin=0.45, cost_tolerance_percent=0.03,
                                     quote_validity_days=15, default_edgebanding_factor=1.1))
    provider, _ = _seed_provider_and_material(session_fixture)
    account = _account(session_fixture)
    invoice = _invoice(session_fixture, provider.id, "F-100", 1000.0)
    body = {"invoice_id": invoice.id, "amount": 400.0, "payment_date": "2026-10-10",
            "payment_method": "TRANSFER", "suggested_account_id": account.id}
    manager = client_fixture.post(f"{API}/finance/payments/request", headers=_headers(session_fixture, UserRole.MANAGER),
                                  json=body)
    assert manager.status_code == 200, manager.text
    assert manager.json()["status"] == "PENDING"
    assert session_fixture.exec(select(BankTransaction)).all() == []
    director = client_fixture.post(f"{API}/finance/payments/request", headers=auth_header_director, json=body)
    assert director.json()["status"] == "PAID"
    session_fixture.expire_all()
    assert session_fixture.get(PurchaseInvoice, invoice.id).outstanding_balance == 600.0


def test_reception_cancels_an_unpaid_advance_instead_of_marking_it_paid(client_fixture, session_fixture,
                                                                       auth_header_director):
    provider, material = _seed_provider_and_material(session_fixture)
    po_id = _create_draft_po(client_fixture, auth_header_director, provider.id, material.id)
    _authorize_po(client_fixture, auth_header_director, po_id)
    _dispatch_po(client_fixture, auth_header_director, po_id)
    po = session_fixture.get(PurchaseOrder, po_id)
    advance = _invoice(session_fixture, provider.id, f"ANT-{po.folio}", 580.0)
    item = session_fixture.exec(select(PurchaseOrderItem).where(PurchaseOrderItem.purchase_order_id == po_id)).first()
    response = client_fixture.put(f"{API}/purchases/orders/{po_id}/receive", headers=auth_header_director, json={
        "invoice_folio": "FAC-REC-1", "received_items": [{"item_id": item.id, "sku": material.sku, "received_qty": 10}]})
    assert response.status_code == 200, response.text
    session_fixture.expire_all()
    assert session_fixture.get(PurchaseInvoice, advance.id).status == InvoiceStatus.CANCELLED


def test_sanitation_absorbs_paid_advances_without_payment(client_fixture, session_fixture, auth_header_director):
    provider, _ = _seed_provider_and_material(session_fixture)
    account = _account(session_fixture)
    orphan = _invoice(session_fixture, provider.id, "ANT-OC-1", 500.0, InvoiceStatus.PAID)
    paid = _invoice(session_fixture, provider.id, "ANT-OC-2", 300.0, InvoiceStatus.PAID)
    session_fixture.add(SupplierPayment(purchase_invoice_id=paid.id, provider_id=provider.id, amount=300.0,
                                        status=PaymentStatus.PAID, created_by_user_id=1, payment_date=date(2026, 10, 1)))
    approved = SupplierPayment(purchase_invoice_id=orphan.id, provider_id=provider.id, amount=500.0,
                               status=PaymentStatus.APPROVED, approved_account_id=account.id, created_by_user_id=1,
                               payment_date=date(2026, 10, 1))
    session_fixture.add(approved)
    session_fixture.commit()
    url = f"{API}/sanitation/supplier-advances"
    rows = client_fixture.get(url, headers=auth_header_director).json()
    assert [(r["invoice_id"], r["open_payments"]) for r in rows] == [(orphan.id, 1)]
    execute = client_fixture.post(f"{API}/finance/payments/{approved.id}/execute", headers=auth_header_director)
    assert execute.status_code == 409  # an invoice already closed is never paid again
    body = {"invoice_ids": [orphan.id, paid.id], "reason": "Revisado con contabilidad"}
    assert client_fixture.post(f"{url}/apply", headers=_headers(session_fixture, UserRole.ADMIN), json=body).status_code == 403
    result = client_fixture.post(f"{url}/apply", headers=auth_header_director, json=body).json()
    assert result == {"updated": 1, "skipped": [f"Factura {paid.id}: ya no aplica"]}
    session_fixture.expire_all()
    assert session_fixture.get(PurchaseInvoice, orphan.id).status == InvoiceStatus.CANCELLED
    assert session_fixture.get(PurchaseInvoice, paid.id).status == InvoiceStatus.PAID
    assert session_fixture.get(SupplierPayment, approved.id).status == PaymentStatus.REJECTED
