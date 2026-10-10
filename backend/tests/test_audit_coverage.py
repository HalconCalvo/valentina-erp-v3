"""F4: writes that used raw SQL now go through the ORM, so they reach the change log, with the same business
result as before; a payable that drops to zero is cancelled instead of deleted."""
from datetime import date, datetime

from sqlmodel import select

from app.core.config import settings
from app.models.audit import AuditFieldChange
from app.models.finance import InvoiceStatus, PurchaseInvoice, PurchaseInvoiceItem, SupplierPayment
from app.models.foundations import Provider
from app.models.inventory import PurchaseOrder, PurchaseOrderItem, PurchaseRequisition
from app.models.material import Material, ProductionRoute
from app.services.purchase_manager import PurchaseManager

AccountsPayable = SupplierPayment.AccountsPayable
PURCHASES = f"{settings.API_V1_STR}/purchases"
FINANCE = f"{settings.API_V1_STR}/finance"


def _changes(session, table, record_id=None, field=None) -> list[AuditFieldChange]:
    query = select(AuditFieldChange).where(AuditFieldChange.table_name == table)
    if record_id is not None:
        query = query.where(AuditFieldChange.record_id == str(record_id))
    if field:
        query = query.where(AuditFieldChange.field_name == field)
    return list(session.exec(query.order_by(AuditFieldChange.id)).all())


def _received_po(session, qty=10.0, cost=100.0, folio="FAC-77"):
    """PO with one line fully received, its payable (16% tax), invoice and invoice line."""
    provider = Provider(business_name="Proveedor F4", credit_days=0, is_active=True)
    session.add(provider)
    session.flush()
    material = Material(sku="F4-MAT", name="Tablero F4", category="TABLERO", production_route=ProductionRoute.MATERIAL,
                        purchase_unit="Hoja", usage_unit="Hoja", current_cost=cost, physical_stock=qty)
    po = PurchaseOrder(provider_id=provider.id, folio="OC-F4", status="RECIBIDA_TOTAL")
    session.add_all([material, po])
    session.flush()
    item = PurchaseOrderItem(purchase_order_id=po.id, material_id=material.id, quantity_ordered=qty,
                             expected_unit_cost=cost, quantity_received=qty, is_fulfilled=True)
    subtotal = qty * cost
    payable = AccountsPayable(provider_id=provider.id, purchase_order_id=po.id, invoice_folio=folio,
                              total_amount=subtotal * 1.16, subtotal=subtotal, tax_rate=0.16, tax_amount=subtotal * 0.16)
    session.add_all([item, payable])
    session.flush()
    invoice = PurchaseInvoice(provider_id=provider.id, invoice_number=folio, total_amount=subtotal * 1.16,
                              subtotal=subtotal, tax_rate=0.16, tax_amount=subtotal * 0.16, accounts_payable_id=payable.id,
                              outstanding_balance=subtotal * 1.16, issue_date=date.today(), due_date=date.today())
    session.add(invoice)
    session.add(PurchaseInvoiceItem(accounts_payable_id=payable.id, purchase_order_item_id=item.id, material_id=material.id,
                                    quantity_received=qty, unit_cost=cost))
    session.commit()
    return po, item, payable, invoice


def _correct(client, headers, po, item, real_qty, reason="Llegaron menos hojas"):
    return client.put(f"{PURCHASES}/orders/{po.id}/items/{item.id}/correct-reception", headers=headers,
                      json={"real_qty": real_qty, "reason": reason})


def test_partial_reception_correction_updates_payable_and_invoice_with_trace(
        client_fixture, session_fixture, auth_header_director):
    po, item, payable, invoice = _received_po(session_fixture)
    response = _correct(client_fixture, auth_header_director, po, item, 6)
    assert response.status_code == 200, response.text
    session_fixture.refresh(payable)
    session_fixture.refresh(invoice)
    assert (payable.subtotal, payable.tax_amount, payable.total_amount, payable.status) == (600.0, 96.0, 696.0, "PENDIENTE")
    assert (invoice.subtotal, invoice.tax_amount, invoice.total_amount) == (600.0, 96.0, 696.0)
    changes = _changes(session_fixture, "accounts_payable", payable.id, "total_amount")
    assert changes and changes[-1].new_value == "696.0"
    assert changes[-1].reason == "Corrección de recepción: Llegaron menos hojas"
    assert _changes(session_fixture, "purchase_invoices", invoice.id, "total_amount")


def test_reception_correction_to_zero_cancels_instead_of_deleting(client_fixture, session_fixture, auth_header_director):
    po, item, payable, invoice = _received_po(session_fixture)
    response = _correct(client_fixture, auth_header_director, po, item, 0, reason="No llegó nada")
    assert response.status_code == 200, response.text
    session_fixture.expire_all()
    payable = session_fixture.get(AccountsPayable, payable.id)
    invoice = session_fixture.get(PurchaseInvoice, invoice.id)
    assert payable is not None and payable.status == "CANCELADO" and "No llegó nada" in payable.notes
    assert invoice is not None and invoice.status == InvoiceStatus.CANCELLED and invoice.outstanding_balance == 0
    line = session_fixture.exec(select(PurchaseInvoiceItem).where(PurchaseInvoiceItem.accounts_payable_id == payable.id)).one()
    assert line.quantity_received == 0
    assert not session_fixture.exec(select(AuditFieldChange).where(AuditFieldChange.operation == "DELETE")).all()
    status_change = _changes(session_fixture, "accounts_payable", payable.id, "status")[-1]
    assert (status_change.old_value, status_change.new_value) == ("PENDIENTE", "CANCELADO")


def test_cancelled_invoice_frees_its_folio_for_the_finance_sync(client_fixture, session_fixture, auth_header_director):
    po, item, payable, invoice = _received_po(session_fixture)
    assert _correct(client_fixture, auth_header_director, po, item, 0).status_code == 200
    again = AccountsPayable(provider_id=payable.provider_id, purchase_order_id=po.id, invoice_folio="FAC-77",
                            total_amount=116.0, subtotal=100.0, tax_rate=0.16, tax_amount=16.0)
    session_fixture.add(again)
    session_fixture.commit()
    assert client_fixture.get(f"{FINANCE}/invoices/pending", headers=auth_header_director).status_code == 200
    invoices = session_fixture.exec(select(PurchaseInvoice).where(PurchaseInvoice.invoice_number == "FAC-77")).all()
    assert sorted(str(getattr(i.status, "value", i.status)) for i in invoices) == ["CANCELLED", "PENDING"]


def test_manual_invoice_cancel_cancels_payable_in_the_log(client_fixture, session_fixture, auth_header_director):
    _, _, payable, invoice = _received_po(session_fixture)
    response = client_fixture.put(f"{FINANCE}/invoices/{invoice.id}/cancel", headers=auth_header_director)
    assert response.status_code == 200, response.text
    session_fixture.refresh(payable)
    assert payable.status == "CANCELADO"
    assert _changes(session_fixture, "accounts_payable", payable.id, "status")[-1].new_value == "CANCELADO"


def test_operational_expense_create_edit_cancel_are_logged(client_fixture, session_fixture, auth_header_director):
    body = {"provider_name": "Luz F4", "concept": "Recibo de luz", "overhead_category": "PLANTA",
            "total_amount": 1500.0, "issue_date": "2026-10-01", "due_date": "2026-10-15", "notes": "Octubre"}
    created = client_fixture.post(f"{PURCHASES}/operational-expenses", headers=auth_header_director, json=body)
    assert created.status_code == 200, created.text
    row = session_fixture.exec(select(AccountsPayable).where(AccountsPayable.invoice_folio == created.json()["folio"])).one()
    assert row.due_date == datetime(2026, 10, 15) and row.notes == "Octubre"
    assert [c.operation for c in _changes(session_fixture, "accounts_payable", row.id)] == ["INSERT"]

    edited = client_fixture.patch(f"{PURCHASES}/operational-expenses/{row.id}", headers=auth_header_director,
                                  json={"total_amount": 1600.0, "due_date": "2026-10-20"})
    assert edited.status_code == 200, edited.text
    assert edited.json()["total_amount"] == 1600.0
    assert _changes(session_fixture, "accounts_payable", row.id, "total_amount")[-1].new_value == "1600.0"

    cancelled = client_fixture.patch(f"{PURCHASES}/operational-expenses/{row.id}/cancel", headers=auth_header_director,
                                     json={"cancel_reason": "Duplicado"})
    assert cancelled.status_code == 200, cancelled.text
    assert cancelled.json()["status"] == "CANCELADO"
    status_change = _changes(session_fixture, "accounts_payable", row.id, "status")[-1]
    assert status_change.new_value == "CANCELADO" and status_change.reason == "Duplicado"


def test_automatic_requisitions_are_created_and_closed_in_the_log(session_fixture):
    low = Material(sku="F4-LOW", name="Bisagra", category="HERRAJE", production_route=ProductionRoute.MATERIAL,
                   purchase_unit="Pz", usage_unit="Pz", physical_stock=2, min_stock=10, max_stock=30)
    consumable = Material(sku="F4-CON", name="Thinner", category="INSUMO", production_route=ProductionRoute.CONSUMIBLE,
                          purchase_unit="L", usage_unit="L", physical_stock=0, min_stock=5)
    provider = Provider(business_name="Proveedor tránsito", credit_days=0, is_active=True)
    session_fixture.add_all([low, consumable, provider])
    session_fixture.flush()
    po = PurchaseOrder(provider_id=provider.id, folio="OC-TR", status="ENVIADA")
    session_fixture.add(po)
    session_fixture.flush()
    session_fixture.add(PurchaseOrderItem(purchase_order_id=po.id, material_id=low.id, quantity_ordered=3, expected_unit_cost=1))
    session_fixture.commit()

    assert PurchaseManager.evaluate_and_create_automatic_requisitions(session_fixture) == 1
    req = session_fixture.exec(select(PurchaseRequisition)).one()
    assert (req.material_id, req.requested_quantity, req.status) == (low.id, 25.0, "PENDIENTE")  # 30 − (2 + 3 in transit)
    assert [c.operation for c in _changes(session_fixture, "purchase_requisitions", req.id)] == ["INSERT"]
    assert PurchaseManager.evaluate_and_create_automatic_requisitions(session_fixture) == 0  # already requested

    low.physical_stock = 12
    session_fixture.add(low)
    session_fixture.commit()
    PurchaseManager.evaluate_and_create_automatic_requisitions(session_fixture)
    session_fixture.refresh(req)
    assert req.status == "PROCESADA"
    assert _changes(session_fixture, "purchase_requisitions", req.id, "status")[-1].new_value == "PROCESADA"
