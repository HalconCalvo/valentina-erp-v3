"""Supplier payables: request, approve, execute and cancel payments; dashboard and lists; credit notes.

Characterization tests written before moving this logic out of the finance endpoint (same behavior after the move).
"""
from datetime import date, datetime, timedelta

from sqlmodel import select

from app.core.config import settings
from app.models.finance import (CreditNote, InvoiceStatus, PaymentStatus, PurchaseInvoice, PurchaseInvoiceItem,
                                SupplierPayment)
from app.models.inventory import PurchaseOrder, PurchaseOrderItem
from app.models.material import ProductionRoute
from app.models.treasury import BankAccount, BankTransaction
from app.models.users import User, UserRole
from tests.test_purchase_service import _seed_provider_and_material
from tests.test_supplier_advances import _account, _headers, _invoice

API = f"{settings.API_V1_STR}/finance"
AccountsPayable = SupplierPayment.AccountsPayable


def _request(client, headers, invoice_id, amount, account_id=None):
    body = {"invoice_id": invoice_id, "amount": amount, "payment_date": "2026-10-10", "payment_method": "TRANSFER",
            "suggested_account_id": account_id}
    return client.post(f"{API}/payments/request", headers=headers, json=body)


def _payable(session, provider_id, folio, total, po_id=None, status="PENDIENTE") -> AccountsPayable:
    payable = AccountsPayable(provider_id=provider_id, invoice_folio=folio, total_amount=total, subtotal=total / 1.16,
                              tax_amount=total - total / 1.16, status=status, purchase_order_id=po_id)
    session.add(payable)
    session.commit()
    session.refresh(payable)
    return payable


def _po(session, provider_id, folio, status="AUTORIZADA") -> PurchaseOrder:
    po = PurchaseOrder(provider_id=provider_id, folio=folio, status=status, authorized_by="Dirección")
    session.add(po)
    session.commit()
    session.refresh(po)
    return po


def test_request_respects_the_available_balance_and_edits_exclude_themselves(client_fixture, session_fixture):
    provider, _ = _seed_provider_and_material(session_fixture)
    invoice = _invoice(session_fixture, provider.id, "F-1", 1000.0)
    admin = _headers(session_fixture, UserRole.ADMIN)
    first = _request(client_fixture, admin, invoice.id, 600.0)
    assert first.status_code == 200 and first.json()["status"] == "PENDING"
    over = _request(client_fixture, admin, invoice.id, 500.0)
    assert over.status_code == 400 and "400.00" in over.json()["detail"]
    body = {"invoice_id": invoice.id, "amount": 1000.0, "payment_date": "2026-10-11", "payment_method": "TRANSFER"}
    edited = client_fixture.put(f"{API}/payments/request/{first.json()['id']}", headers=admin, json=body)
    assert edited.status_code == 200 and edited.json()["amount"] == 1000.0
    body["amount"] = 1000.02
    assert client_fixture.put(f"{API}/payments/request/{first.json()['id']}", headers=admin, json=body).status_code == 400
    assert _request(client_fixture, _headers(session_fixture, UserRole.SALES), invoice.id, 1.0).status_code == 403


def test_approve_does_not_move_money_and_execute_pays_and_closes_the_po(client_fixture, session_fixture,
                                                                         auth_header_director):
    provider, _ = _seed_provider_and_material(session_fixture)
    account = _account(session_fixture)
    po = _po(session_fixture, provider.id, "OC-0001")
    invoice = _invoice(session_fixture, provider.id, "OC-OC-0001", 1000.0)
    payment = _request(client_fixture, _headers(session_fixture, UserRole.ADMIN), invoice.id, 1000.0).json()
    admin_approve = client_fixture.put(f"{API}/payments/{payment['id']}/status", json={"status": "APPROVED"},
                                       headers=_headers(session_fixture, UserRole.WAREHOUSE))
    assert admin_approve.status_code == 403
    missing = client_fixture.put(f"{API}/payments/{payment['id']}/status", json={"status": "APPROVED"},
                                 headers=auth_header_director)
    assert missing.status_code == 400
    approved = client_fixture.put(f"{API}/payments/{payment['id']}/status", headers=auth_header_director,
                                  json={"status": "APPROVED", "approved_account_id": account.id})
    assert approved.json()["status"] == "APPROVED" and approved.json()["approved_account_id"] == account.id
    assert session_fixture.exec(select(BankTransaction)).all() == []
    executed = client_fixture.post(f"{API}/payments/{payment['id']}/execute", headers=auth_header_director)
    assert executed.status_code == 200 and executed.json()["status"] == "PAID"
    session_fixture.expire_all()
    tx = session_fixture.exec(select(BankTransaction)).one()
    assert (tx.amount, tx.reference, tx.description) == (1000.0, "Pago FAC-OC-0001", "Pago Ejecutado a Proveedor")
    assert session_fixture.get(BankAccount, account.id).current_balance == 99000.0
    assert session_fixture.get(PurchaseInvoice, invoice.id).status == InvoiceStatus.PAID
    assert session_fixture.get(PurchaseOrder, po.id).payment_status == "PAID"
    again = client_fixture.post(f"{API}/payments/{payment['id']}/execute", headers=auth_header_director)
    assert again.status_code == 400
    revoke = client_fixture.put(f"{API}/payments/{payment['id']}/status", json={"status": "PENDING"},
                                headers=auth_header_director)
    assert revoke.status_code == 400


def test_partial_execution_and_insufficient_funds(client_fixture, session_fixture, auth_header_director):
    provider, _ = _seed_provider_and_material(session_fixture)
    account = _account(session_fixture)
    invoice = _invoice(session_fixture, provider.id, "GASTO-9", 1000.0)
    payable = _payable(session_fixture, provider.id, "GASTO-9", 1000.0)
    payment = _request(client_fixture, _headers(session_fixture, UserRole.ADMIN), invoice.id, 400.0, account.id).json()
    client_fixture.put(f"{API}/payments/{payment['id']}/status", headers=auth_header_director,
                       json={"status": "APPROVED", "approved_account_id": account.id})
    account.current_balance = 100.0
    session_fixture.add(account)
    session_fixture.commit()
    poor = client_fixture.post(f"{API}/payments/{payment['id']}/execute", headers=auth_header_director)
    assert poor.status_code == 400 and "Fondos insuficientes" in poor.json()["detail"]
    account.current_balance = 1000.0
    session_fixture.add(account)
    session_fixture.commit()
    assert client_fixture.post(f"{API}/payments/{payment['id']}/execute", headers=auth_header_director).status_code == 200
    session_fixture.expire_all()
    assert session_fixture.get(PurchaseInvoice, invoice.id).status == InvoiceStatus.PARTIAL
    assert session_fixture.get(PurchaseInvoice, invoice.id).outstanding_balance == 600.0
    assert session_fixture.get(AccountsPayable, payable.id).status == "PENDIENTE"


def test_fast_track_without_account_fails_and_with_account_pays_the_payable(client_fixture, session_fixture,
                                                                            auth_header_director):
    provider, _ = _seed_provider_and_material(session_fixture)
    account = _account(session_fixture)
    invoice = _invoice(session_fixture, provider.id, "GASTO-7", 500.0)
    payable = _payable(session_fixture, provider.id, "GASTO-7", 500.0)
    no_account = _request(client_fixture, auth_header_director, invoice.id, 500.0)
    assert no_account.status_code == 400
    session_fixture.rollback()  # the request's own session discards the flushed request
    paid = _request(client_fixture, auth_header_director, invoice.id, 500.0, account.id)
    assert paid.status_code == 200 and paid.json()["status"] == "PAID"
    session_fixture.expire_all()
    tx = session_fixture.exec(select(BankTransaction)).one()
    assert (tx.reference, tx.description) == ("Pago Directo FAC-GASTO-7", "Pago Fast-Track a Proveedor")
    assert session_fixture.get(PurchaseInvoice, invoice.id).status == InvoiceStatus.PAID
    assert session_fixture.get(AccountsPayable, payable.id).status == "PAGADO"
    assert session_fixture.get(BankAccount, account.id).current_balance == 99500.0


def test_reject_and_cancel_invoice(client_fixture, session_fixture, auth_header_director):
    provider, _ = _seed_provider_and_material(session_fixture)
    admin = _headers(session_fixture, UserRole.ADMIN)
    invoice = _invoice(session_fixture, provider.id, "F-2", 800.0)
    payable = _payable(session_fixture, provider.id, "F-2", 800.0)
    first = _request(client_fixture, admin, invoice.id, 100.0).json()
    rejected = client_fixture.put(f"{API}/payments/{first['id']}/status", json={"status": "REJECTED"},
                                  headers=auth_header_director)
    assert rejected.json()["status"] == "REJECTED"
    assert client_fixture.put(f"{API}/payments/{first['id']}/status", json={"status": "REJECTED"},
                              headers=auth_header_director).status_code == 400
    second = _request(client_fixture, admin, invoice.id, 200.0).json()
    cancelled = client_fixture.put(f"{API}/invoices/{invoice.id}/cancel", headers=admin)
    assert cancelled.status_code == 200 and cancelled.json()["message"] == "Factura F-2 cancelada."
    session_fixture.expire_all()
    assert session_fixture.get(PurchaseInvoice, invoice.id).status == InvoiceStatus.CANCELLED
    assert session_fixture.get(SupplierPayment, second["id"]).status == PaymentStatus.REJECTED
    assert session_fixture.get(AccountsPayable, payable.id).status == "CANCELADO"
    paid = _invoice(session_fixture, provider.id, "F-3", 10.0, status=InvoiceStatus.PAID)
    assert client_fixture.put(f"{API}/invoices/{paid.id}/cancel", headers=admin).status_code == 400
    assert client_fixture.put(f"{API}/invoices/99999/cancel", headers=admin).status_code == 404


def test_dashboard_syncs_received_payables_and_cancelled_orders(client_fixture, session_fixture):
    provider, material = _seed_provider_and_material(session_fixture)
    admin = _headers(session_fixture, UserRole.ADMIN)
    today = date.today()
    _invoice(session_fixture, provider.id, "OLD", 100.0).due_date = today - timedelta(days=3)
    future = _invoice(session_fixture, provider.id, "FUT", 300.0)
    future.due_date = today + timedelta(days=60)
    session_fixture.add(future)
    session_fixture.commit()
    _payable(session_fixture, provider.id, "OC-0002", 232.0)
    cancelled_po = _po(session_fixture, provider.id, "OC-0003", status="CANCELADA")
    doomed = _invoice(session_fixture, provider.id, "OC-0003", 50.0)
    pending = _request(client_fixture, admin, doomed.id, 50.0).json()
    stats = client_fixture.get(f"{API}/payable-stats", headers=admin)
    assert stats.status_code == 200, stats.text
    session_fixture.expire_all()
    created = session_fixture.exec(select(PurchaseInvoice).where(PurchaseInvoice.invoice_number == "OC-0002")).one()
    assert (created.total_amount, created.outstanding_balance, created.status) == (232.0, 232.0, InvoiceStatus.PENDING)
    assert session_fixture.get(PurchaseInvoice, doomed.id).status == InvoiceStatus.CANCELLED
    assert session_fixture.get(SupplierPayment, pending["id"]).status == PaymentStatus.REJECTED
    data = stats.json()
    assert data["future_amount"] == 300.0 and data["future_count"] == 1
    assert data["overdue_amount"] + data["next_period_amount"] == 332.0
    assert data["total_pending_approval"] == 0
    assert cancelled_po.id


def test_lists_name_provider_folio_items_and_authorizer(client_fixture, session_fixture, auth_header_director):
    provider, material = _seed_provider_and_material(session_fixture)
    admin = _headers(session_fixture, UserRole.ADMIN)
    account = _account(session_fixture)
    po = _po(session_fixture, provider.id, "OC-0004")
    session_fixture.add(PurchaseOrderItem(purchase_order_id=po.id, material_id=material.id, quantity_ordered=3,
                                          expected_unit_cost=10.0, custom_description="Tablero"))
    session_fixture.commit()
    payable = _payable(session_fixture, provider.id, "OC-0004", 34.8, po_id=po.id, status="PAGADO")
    invoice = _invoice(session_fixture, provider.id, "OC-OC-0004", 34.8)
    gasto = _invoice(session_fixture, provider.id, "GASTO-1", 20.0)
    gasto_payable = _payable(session_fixture, provider.id, "GASTO-1", 20.0, status="PAGADO")
    gasto_payable.notes = "  Luz de octubre  "
    session_fixture.add_all([gasto_payable, PurchaseInvoiceItem(accounts_payable_id=payable.id, material_id=material.id,
                             sku="MAT-TEST-001", description="Tablero", quantity_received=3, unit_cost=10.0)])
    session_fixture.commit()
    first = _request(client_fixture, admin, invoice.id, 10.0).json()
    second = _request(client_fixture, admin, invoice.id, 5.0).json()
    client_fixture.put(f"{API}/payments/{second['id']}/status", headers=auth_header_director,
                       json={"status": "APPROVED", "approved_account_id": account.id})
    pending = client_fixture.get(f"{API}/payments/pending-approvals", headers=admin).json()
    approved = client_fixture.get(f"{API}/payments/approved", headers=admin).json()
    assert [(p["id"], p["provider_name"], p["invoice_folio"]) for p in pending] == [
        (first["id"], "Proveedor Test", "OC-0004")]
    assert [(p["id"], p["approved_account_id"]) for p in approved] == [(second["id"], account.id)]
    rows = {r["id"]: r for r in client_fixture.get(f"{API}/invoices/pending", headers=admin).json()}
    assert rows[invoice.id]["po_folio"] == "OC-0004" and rows[invoice.id]["authorized_by"]
    assert rows[invoice.id]["items"] == [{"description": "Tablero", "qty": 3, "price": 10.0, "sku": "MAT-TEST-001"}]
    assert rows[gasto.id]["expense_notes"] == "Luz de octubre" and rows[gasto.id]["items"] == []
    received = client_fixture.get(f"{API}/invoices/{invoice.id}/received-items", headers=admin).json()
    assert [(r["sku"], r["quantity_received"], r["line_total"]) for r in received] == [("MAT-TEST-001", 3.0, 30.0)]
    assert client_fixture.get(f"{API}/invoices/{gasto.id}/received-items", headers=admin).json() == []
    assert client_fixture.get(f"{API}/invoices/99999/received-items", headers=admin).status_code == 404


def _received_invoice(session, provider, material, total=116.0, qty=1.0, unit_cost=100.0):
    payable = _payable(session, provider.id, "F-NC", total, status="PAGADO")
    invoice = _invoice(session, provider.id, "F-NC", total)
    invoice.accounts_payable_id = payable.id
    session.add_all([invoice, PurchaseInvoiceItem(accounts_payable_id=payable.id, material_id=material.id,
                                                  quantity_received=qty, unit_cost=unit_cost)])
    session.commit()
    return invoice


def test_credit_note_discount_and_price_adjustment(client_fixture, session_fixture):
    provider, material = _seed_provider_and_material(session_fixture)
    admin = _headers(session_fixture, UserRole.ADMIN)
    invoice = _received_invoice(session_fixture, provider, material, total=232.0, qty=2.0)
    body = {"purchase_invoice_id": invoice.id, "folio": "NC-1", "credit_type": "PRICE_ADJUSTMENT", "total_amount": 23.2}
    nc = client_fixture.post(f"{API}/credit-notes", headers=admin, json=body)
    assert nc.status_code == 200, nc.text
    data = nc.json()
    assert (data["subtotal"], data["tax_amount"], data["new_outstanding_balance"]) == (20.0, 3.2, 208.8)
    assert data["cost_adjustment_message"] == "Costo del material ajustado de $100.00 a $90.00"
    session_fixture.expire_all()
    assert session_fixture.get(type(material), material.id).current_cost == 90.0
    over = client_fixture.post(f"{API}/credit-notes", headers=admin, json={**body, "folio": "NC-2", "total_amount": 300})
    assert over.status_code == 400
    rest = client_fixture.post(f"{API}/credit-notes", headers=admin,
                               json={**body, "folio": "NC-3", "credit_type": "DISCOUNT", "total_amount": 208.8})
    assert rest.json()["new_outstanding_balance"] == 0.0
    session_fixture.expire_all()
    assert session_fixture.get(PurchaseInvoice, invoice.id).status == InvoiceStatus.PAID
    assert client_fixture.post(f"{API}/credit-notes", headers=_headers(session_fixture, UserRole.WAREHOUSE),
                               json=body).status_code == 403


def test_credit_note_return_lowers_stock_and_validates_lines(client_fixture, session_fixture):
    provider, material = _seed_provider_and_material(session_fixture)
    material.physical_stock = 5.0
    session_fixture.add(material)
    session_fixture.commit()
    admin = _headers(session_fixture, UserRole.ADMIN)
    invoice = _received_invoice(session_fixture, provider, material, total=464.0, qty=4.0)
    body = {"purchase_invoice_id": invoice.id, "folio": "NC-R", "credit_type": "RETURN",
            "items": [{"material_id": material.id, "returned_quantity": 5}]}
    assert client_fixture.post(f"{API}/credit-notes", headers=admin, json=body).status_code == 400  # more than invoiced
    assert client_fixture.post(f"{API}/credit-notes", headers=admin,
                               json={**body, "items": []}).status_code == 400
    body["items"][0]["returned_quantity"] = 2
    nc = client_fixture.post(f"{API}/credit-notes", headers=admin, json=body)
    assert nc.status_code == 200, nc.text
    assert nc.json()["total_amount"] == 232.0 and nc.json()["returned_items"][0]["line_total"] == 200.0
    session_fixture.expire_all()
    assert session_fixture.get(type(material), material.id).physical_stock == 3.0
    assert session_fixture.exec(select(CreditNote)).one().folio == "NC-R"
    consumable = type(material)(sku="CONS-1", name="Thinner", category="GENERAL", purchase_unit="lt", usage_unit="lt",
                                production_route=ProductionRoute.CONSUMIBLE, current_cost=10.0, provider_id=provider.id)
    session_fixture.add(consumable)
    session_fixture.commit()
    session_fixture.add(PurchaseInvoiceItem(accounts_payable_id=invoice.accounts_payable_id, material_id=consumable.id,
                                            quantity_received=1, unit_cost=10.0))
    session_fixture.commit()
    body["items"] = [{"material_id": consumable.id, "returned_quantity": 1}]
    assert client_fixture.post(f"{API}/credit-notes", headers=admin, json={**body, "folio": "NC-C"}).status_code == 200


def test_pending_invoice_says_who_authorized_its_oc(client_fixture, session_fixture):
    """Gabriel 19/10: paying a supplier invoice shows "OC-xxx autorizada por <nombre> el DD/MM/AAAA"."""
    provider, _ = _seed_provider_and_material(session_fixture)
    admin = _headers(session_fixture, UserRole.ADMIN)
    authorizer = session_fixture.exec(select(User).where(User.role == UserRole.ADMIN)).first()
    po = _po(session_fixture, provider.id, "OC-0009")
    po.authorized_by, po.authorized_at = authorizer.email, datetime(2026, 10, 14, 18, 23)
    session_fixture.add(po)
    session_fixture.commit()
    _payable(session_fixture, provider.id, "OC-0009", 116.0, po_id=po.id)
    invoice = _invoice(session_fixture, provider.id, "OC-OC-0009", 116.0)
    without_po = _invoice(session_fixture, provider.id, "GASTO-9", 20.0)
    rows = {r["id"]: r for r in client_fixture.get(f"{API}/invoices/pending", headers=admin).json()}
    assert (rows[invoice.id]["po_folio"], rows[invoice.id]["po_authorizer_name"],
            rows[invoice.id]["po_authorized_at"]) == ("OC-0009", authorizer.full_name, "2026-10-14T18:23:00")
    assert (rows[without_po.id]["po_folio"], rows[without_po.id]["po_authorizer_name"]) == (None, None)
