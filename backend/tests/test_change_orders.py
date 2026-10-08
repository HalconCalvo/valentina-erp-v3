"""Change orders (CAM) of a sales order: lifecycle, operations, material, money and credit notes."""
from datetime import datetime

from sqlmodel import select

from app.core.config import settings
from app.core.security import create_access_token, get_password_hash
from app.models.audit import AuditFieldChange
from app.models.inventory import InventoryReservation
from app.models.material import Material
from app.models.production import ProductionBatch, ProductionBatchStatus
from app.models.sales import (
    CXCStatus,
    CustomerPayment,
    InstanceStatus,
    SalesOrder,
    SalesOrderItem,
    SalesOrderItemInstance,
)
from app.models.users import User, UserRole
from app.services import production_inventory_service
from tests.conftest import TEST_SALES_EMAIL
from tests.sales_helpers import ORDERS, QUOTATIONS, authorized_quotation, create_order_via_quotation, default_items

CHANGES = f"{settings.API_V1_STR}/change-orders"
SALES = f"{settings.API_V1_STR}/sales"


def _headers(user: User) -> dict:
    token = create_access_token(subject=user.email, user_id=user.id, user_role=user.role.value)
    return {"Authorization": f"Bearer {token}"}


def _user(session, role: UserRole, email: str) -> User:
    user = User(email=email, full_name=email, hashed_password=get_password_hash("Pass123!"), role=role, is_active=True)
    session.add(user)
    session.commit()
    session.refresh(user)
    return user


def _seller(session) -> User:
    return session.exec(select(User).where(User.email == TEST_SALES_EMAIL)).first()


def _order(client, headers, seed, session=None, owner=None) -> dict:
    order = create_order_via_quotation(client, headers, seed[0].id, seed[1].id)
    if owner is not None:
        db_order = session.get(SalesOrder, order["id"])
        db_order.user_id = owner.id
        session.add(db_order)
        session.commit()
    return order


def _get_order(client, headers, order_id) -> dict:
    response = client.get(f"{ORDERS}/{order_id}", headers=headers)
    assert response.status_code == 200, response.text
    return response.json()


def _add_line(quantity=2, price=5000.0) -> dict:
    return {"change_type": "ADD", "product_name": "Vestidor", "quantity": quantity, "unit_price": price,
            "frozen_unit_cost": 2500.0}


def _create(client, headers, order_id, lines, reason="Cliente pidió cambios", advance=None):
    body = {"sales_order_id": order_id, "change_reason": reason, "lines": lines}
    if advance is not None:
        body["advance_percent"] = advance
    return client.post(f"{CHANGES}/", headers=headers, json=body)


def _authorize(client, headers, change_id, lines, advance=60.0):
    return client.post(f"{CHANGES}/{change_id}/authorize", headers=headers,
                       json={"lines": lines, "advance_percent": advance})


def _through_apply(client, headers, order_id, lines, advance=60.0) -> dict:
    created = _create(client, headers, order_id, lines)
    assert created.status_code == 201, created.text
    change_id = created.json()["id"]
    assert client.post(f"{QUOTATIONS}/{change_id}/request-auth", headers=headers).status_code == 200
    authorized = _authorize(client, headers, change_id, lines, advance)
    assert authorized.status_code == 200, authorized.text
    applied = client.post(f"{CHANGES}/{change_id}/apply", headers=headers, json={})
    assert applied.status_code == 200, applied.text
    return applied.json()


def _material(session, sku="MDF-CAM", stock=100.0, committed=0.0) -> Material:
    material = Material(sku=sku, name=f"Material {sku}", category="TABLERO", production_route="MATERIAL",
                        purchase_unit="Pz", usage_unit="Pz", conversion_factor=1, current_cost=100.0,
                        physical_stock=stock, committed_stock=committed)
    session.add(material)
    session.commit()
    session.refresh(material)
    return material


def _reserve(session, unit_id, material, status, quantity=4.0, batch_status=ProductionBatchStatus.DRAFT):
    batch = ProductionBatch(folio=f"L-CAM-{unit_id}-{status}", batch_type="MDF", status=batch_status)
    session.add(batch)
    session.commit()
    unit = session.get(SalesOrderItemInstance, unit_id)
    unit.production_batch_id = batch.id
    if status == "CONSUMIDA":
        unit.production_status = InstanceStatus.IN_PRODUCTION
    session.add(unit)
    session.add(InventoryReservation(production_batch_id=batch.id, instance_id=unit_id, material_id=material.id,
                                     quantity_reserved=quantity, status=status, consumed_unit_cost=100.0))
    session.commit()


# ---------------------------------------------------------------------------
# Lifecycle and operations
# ---------------------------------------------------------------------------

def test_change_order_adds_lines_and_units_and_recomputes(client_fixture, auth_header_director, seed_client_and_tax):
    order = _order(client_fixture, auth_header_director, seed_client_and_tax)
    item_id = order["items"][0]["id"]
    balance_before = order["outstanding_balance"]
    lines = [_add_line(), {"change_type": "QUANTITY_UP", "target_order_item_id": item_id, "quantity": 1}]
    change = _through_apply(client_fixture, auth_header_director, order["id"], lines)

    assert change["status"] == "APPLIED"
    assert change["folio"] == f"CAM-{order['id']:04d}-1"
    assert change["subtotal"] == 20000.0
    after = _get_order(client_fixture, auth_header_director, order["id"])
    assert after["subtotal"] == 30000.0
    assert after["total_price"] == 34800.0
    assert round(after["outstanding_balance"] - balance_before, 2) == 23200.0
    assert after["advance_invoice_amount"] == 20880.0
    units = [u for item in after["items"] for u in item["instances"]]
    assert len(units) == 4
    assert sum(1 for u in units if u["change_quotation_id"] == change["id"]) == 3
    original = next(i for i in after["items"] if i["id"] == item_id)
    assert original["quantity"] == 2 and original["subtotal_price"] == 20000.0


def test_only_director_authorizes_and_seller_applies_own(client_fixture, session_fixture, auth_header_director,
                                                        seed_client_and_tax):
    seller = _seller(session_fixture)
    order = _order(client_fixture, auth_header_director, seed_client_and_tax, session_fixture, seller)
    lines = [{"change_type": "PRICE", "target_order_item_id": order["items"][0]["id"], "unit_price": 12000.0}]
    created = _create(client_fixture, _headers(seller), order["id"], lines)
    assert created.status_code == 201, created.text
    change_id = created.json()["id"]
    assert client_fixture.post(f"{QUOTATIONS}/{change_id}/request-auth", headers=_headers(seller)).status_code == 200
    assert _authorize(client_fixture, _headers(seller), change_id, lines).status_code == 403
    manager = _user(session_fixture, UserRole.MANAGER, "manager@cam.local")
    assert _authorize(client_fixture, _headers(manager), change_id, lines).status_code == 403
    assert _authorize(client_fixture, auth_header_director, change_id, lines).status_code == 200
    other = _user(session_fixture, UserRole.SALES, "other@cam.local")
    assert client_fixture.post(f"{CHANGES}/{change_id}/apply", headers=_headers(other), json={}).status_code == 403
    applied = client_fixture.post(f"{CHANGES}/{change_id}/apply", headers=_headers(seller),
                                  json={"client_po_folio": "OC-COMP-1", "client_po_date": "2026-10-08T12:00:00"})
    assert applied.status_code == 200, applied.text
    assert applied.json()["client_po_folio"] == "OC-COMP-1"
    assert _get_order(client_fixture, auth_header_director, order["id"])["subtotal"] == 12000.0


def test_regular_quotation_actions_reject_change_orders(client_fixture, auth_header_director, seed_client_and_tax):
    order = _order(client_fixture, auth_header_director, seed_client_and_tax)
    change = _create(client_fixture, auth_header_director, order["id"], [_add_line()]).json()
    response = client_fixture.post(f"{QUOTATIONS}/{change['id']}/authorize", headers=auth_header_director,
                                   json={"items": default_items(), "applied_margin_percent": 40,
                                         "applied_commission_percent": 0, "advance_percent": 60})
    assert response.status_code == 422
    listed = client_fixture.get(f"{QUOTATIONS}/", headers=auth_header_director).json()
    assert change["id"] not in [q["id"] for q in listed]
    by_order = client_fixture.get(f"{CHANGES}/", headers=auth_header_director, params={"sales_order_id": order["id"]})
    assert [c["id"] for c in by_order.json()] == [change["id"]]


def test_one_open_change_order_per_sales_order(client_fixture, auth_header_director, seed_client_and_tax):
    order = _order(client_fixture, auth_header_director, seed_client_and_tax)
    assert _create(client_fixture, auth_header_director, order["id"], [_add_line()]).status_code == 201
    assert _create(client_fixture, auth_header_director, order["id"], [_add_line()]).status_code == 409


def test_cancel_change_order_leaves_order_untouched(client_fixture, auth_header_director, seed_client_and_tax):
    order = _order(client_fixture, auth_header_director, seed_client_and_tax)
    change = _create(client_fixture, auth_header_director, order["id"], [_add_line()]).json()
    response = client_fixture.post(f"{QUOTATIONS}/{change['id']}/cancel", headers=auth_header_director,
                                   json={"cancel_reason": "El cliente se arrepintió"})
    assert response.status_code == 200
    assert _get_order(client_fixture, auth_header_director, order["id"])["subtotal"] == order["subtotal"]
    assert _create(client_fixture, auth_header_director, order["id"], [_add_line()]).status_code == 201


def test_quantity_down_cancels_unit_and_releases_reservations(client_fixture, session_fixture, auth_header_director,
                                                              seed_client_and_tax):
    order = _order(client_fixture, auth_header_director, seed_client_and_tax)
    item_id = order["items"][0]["id"]
    client_fixture.post(f"{CHANGES}/", headers=auth_header_director, json={
        "sales_order_id": order["id"], "change_reason": "Más unidades",
        "lines": [{"change_type": "QUANTITY_UP", "target_order_item_id": item_id, "quantity": 1}]})
    change_id = client_fixture.get(f"{CHANGES}/", headers=auth_header_director).json()[0]["id"]
    client_fixture.post(f"{QUOTATIONS}/{change_id}/cancel", headers=auth_header_director, json={"cancel_reason": "x"})
    unit_id = order["items"][0]["instances"][0]["id"]
    material = _material(session_fixture, committed=4.0)
    _reserve(session_fixture, unit_id, material, "ACTIVA")

    lines = [{"change_type": "CANCEL_LINE", "target_order_item_id": item_id, "change_reason": "Ya no lo quiere"}]
    _through_apply(client_fixture, auth_header_director, order["id"], lines)

    session_fixture.expire_all()
    unit = session_fixture.get(SalesOrderItemInstance, unit_id)
    assert unit.is_cancelled and unit.production_batch_id is None and "Ya no lo quiere" in unit.cancel_reason
    item = session_fixture.get(SalesOrderItem, item_id)
    assert item.is_cancelled and item.cancel_reason
    reservation = session_fixture.exec(select(InventoryReservation).where(InventoryReservation.instance_id == unit_id)).one()
    assert reservation.status == "CANCELADA"
    assert session_fixture.get(Material, material.id).committed_stock == 0.0
    after = _get_order(client_fixture, auth_header_director, order["id"])
    assert after["subtotal"] == 0.0 and after["total_price"] == 0.0


def test_unit_with_consumed_material_needs_director_disposition(client_fixture, session_fixture, auth_header_director,
                                                                seed_client_and_tax):
    order = _order(client_fixture, auth_header_director, seed_client_and_tax)
    item_id = order["items"][0]["id"]
    unit_id = order["items"][0]["instances"][0]["id"]
    material = _material(session_fixture, stock=96.0)
    _reserve(session_fixture, unit_id, material, "CONSUMIDA", batch_status=ProductionBatchStatus.IN_PRODUCTION)
    lines = [{"change_type": "QUANTITY_DOWN", "target_order_item_id": item_id, "cancel_instance_ids": [unit_id]}]
    change_id = _create(client_fixture, auth_header_director, order["id"], lines).json()["id"]
    client_fixture.post(f"{QUOTATIONS}/{change_id}/request-auth", headers=auth_header_director)
    assert _authorize(client_fixture, auth_header_director, change_id, lines).status_code == 422
    lines[0]["reversal_dispositions"] = {str(unit_id): "RETURN_TO_STOCK"}
    assert _authorize(client_fixture, auth_header_director, change_id, lines).status_code == 200
    assert client_fixture.post(f"{CHANGES}/{change_id}/apply", headers=auth_header_director, json={}).status_code == 200
    session_fixture.expire_all()
    reservation = session_fixture.exec(select(InventoryReservation).where(InventoryReservation.instance_id == unit_id)).one()
    assert reservation.status == "REVERTIDA" and reservation.reversal_disposition == "RETURN_TO_STOCK"
    assert session_fixture.get(Material, material.id).physical_stock == 100.0


def test_invoiced_or_loaded_units_are_protected(client_fixture, session_fixture, auth_header_director,
                                                seed_client_and_tax):
    order = _order(client_fixture, auth_header_director, seed_client_and_tax)
    item_id = order["items"][0]["id"]
    unit = session_fixture.get(SalesOrderItemInstance, order["items"][0]["instances"][0]["id"])
    unit.administration_invoice_folio = "F-100"
    session_fixture.add(unit)
    session_fixture.commit()
    price = [{"change_type": "PRICE", "target_order_item_id": item_id, "unit_price": 9000.0}]
    assert _create(client_fixture, auth_header_director, order["id"], price).status_code == 409
    cancel = [{"change_type": "CANCEL_LINE", "target_order_item_id": item_id}]
    assert _create(client_fixture, auth_header_director, order["id"], cancel).status_code == 409


def test_apply_revalidates_against_current_order(client_fixture, session_fixture, auth_header_director,
                                                 seed_client_and_tax):
    order = _order(client_fixture, auth_header_director, seed_client_and_tax)
    item_id = order["items"][0]["id"]
    lines = [{"change_type": "CANCEL_LINE", "target_order_item_id": item_id}]
    change_id = _create(client_fixture, auth_header_director, order["id"], lines).json()["id"]
    client_fixture.post(f"{QUOTATIONS}/{change_id}/request-auth", headers=auth_header_director)
    assert _authorize(client_fixture, auth_header_director, change_id, lines).status_code == 200
    unit = session_fixture.get(SalesOrderItemInstance, order["items"][0]["instances"][0]["id"])
    unit.production_status = InstanceStatus.CARGADO
    session_fixture.add(unit)
    session_fixture.commit()
    response = client_fixture.post(f"{CHANGES}/{change_id}/apply", headers=auth_header_director, json={})
    assert response.status_code == 409
    change = client_fixture.get(f"{CHANGES}/{change_id}", headers=auth_header_director).json()
    assert change["status"] == "CHANGES_REQUESTED" and "cargada" in change["changes_requested_reason"]
    assert _get_order(client_fixture, auth_header_director, order["id"])["subtotal"] == order["subtotal"]


def test_change_orders_stop_when_every_unit_is_signed(client_fixture, session_fixture, auth_header_director,
                                                      seed_client_and_tax):
    order = _order(client_fixture, auth_header_director, seed_client_and_tax)
    unit = session_fixture.get(SalesOrderItemInstance, order["items"][0]["instances"][0]["id"])
    unit.production_status = InstanceStatus.CLOSED
    session_fixture.add(unit)
    session_fixture.commit()
    assert _create(client_fixture, auth_header_director, order["id"], [_add_line()]).status_code == 409


def test_change_order_is_logged_with_reason(client_fixture, session_fixture, auth_header_director, seed_client_and_tax):
    order = _order(client_fixture, auth_header_director, seed_client_and_tax)
    item_id = order["items"][0]["id"]
    lines = [{"change_type": "PRICE", "target_order_item_id": item_id, "unit_price": 11000.0}]
    change = _through_apply(client_fixture, auth_header_director, order["id"], lines)
    rows = session_fixture.exec(select(AuditFieldChange).where(
        AuditFieldChange.table_name == "sales_order_items", AuditFieldChange.record_id == str(item_id),
        AuditFieldChange.field_name == "unit_price")).all()
    assert rows and rows[-1].new_value in ("11000.0", "11000") and change["folio"] in rows[-1].reason


# ---------------------------------------------------------------------------
# Advance
# ---------------------------------------------------------------------------

def _pay_advance(client, headers, order_id, amount, change_id=None):
    body = {"amount": amount, "invoice_folio": "ANT-1"}
    if change_id:
        body["change_quotation_id"] = change_id
    response = client.post(f"{ORDERS}/{order_id}/advance_payments", headers=headers, json=body)
    assert response.status_code == 200, response.text


def test_complementary_advance_and_production_gate(client_fixture, session_fixture, auth_header_director,
                                                   seed_client_and_tax):
    order = _order(client_fixture, auth_header_director, seed_client_and_tax)
    client_fixture.patch(f"{ORDERS}/{order['id']}", headers=auth_header_director, json={"advance_invoice_amount": 6960.0})
    _pay_advance(client_fixture, auth_header_director, order["id"], 6960.0)
    change = _through_apply(client_fixture, auth_header_director, order["id"], [_add_line(quantity=1)])
    assert change["complementary_advance_amount"] == 3480.0

    summary = client_fixture.get(f"{ORDERS}/{order['id']}/money-summary", headers=auth_header_director).json()
    assert summary["complementary_advances"][0]["amount"] == 3480.0
    assert summary["complementary_advances"][0]["folio"] == change["folio"]

    session_fixture.expire_all()
    units = session_fixture.exec(select(SalesOrderItemInstance)).all()
    original = [u for u in units if u.change_quotation_id is None]
    added = [u for u in units if u.change_quotation_id == change["id"]]
    assert production_inventory_service.payment_cleared(session_fixture, original)
    assert not production_inventory_service.payment_cleared(session_fixture, added)

    _pay_advance(client_fixture, auth_header_director, order["id"], 3480.0, change["id"])
    session_fixture.expire_all()
    assert production_inventory_service.payment_cleared(session_fixture, added)
    summary = client_fixture.get(f"{ORDERS}/{order['id']}/money-summary", headers=auth_header_director).json()
    assert summary["complementary_advances"] == []


def test_advance_follows_total_while_not_invoiced(client_fixture, auth_header_director, seed_client_and_tax):
    order = _order(client_fixture, auth_header_director, seed_client_and_tax)
    change = _through_apply(client_fixture, auth_header_director, order["id"], [_add_line(quantity=1)], advance=50.0)
    assert change["complementary_advance_amount"] == 0.0
    after = _get_order(client_fixture, auth_header_director, order["id"])
    assert after["advance_percent"] == 50.0 and after["advance_invoice_amount"] == 8700.0


# ---------------------------------------------------------------------------
# Credit notes
# ---------------------------------------------------------------------------

def _full_invoice(client, headers, order_id, amount) -> int:
    response = client.post(f"{ORDERS}/{order_id}/emit_full_invoice", headers=headers,
                           json={"amount": amount, "invoice_folio": "F-FULL-1"})
    assert response.status_code == 200, response.text
    return response.json()["cxc_id"]


def test_lower_total_needs_credit_note_that_lowers_invoice_balance(client_fixture, session_fixture,
                                                                   auth_header_director, seed_client_and_tax):
    order = _order(client_fixture, auth_header_director, seed_client_and_tax)
    cxc_id = _full_invoice(client_fixture, auth_header_director, order["id"], 11600.0)
    lines = [{"change_type": "PRICE", "target_order_item_id": order["items"][0]["id"], "unit_price": 8000.0}]
    change = _through_apply(client_fixture, auth_header_director, order["id"], lines)

    summary = client_fixture.get(f"{ORDERS}/{order['id']}/money-summary", headers=auth_header_director).json()
    assert summary["credit_note_pending"] == 2320.0
    seller = _seller(session_fixture)
    note = {"folio": "NC-1", "note_date": "2026-10-08T12:00:00", "amount": 2320.0, "reason": "Baja de precio",
            "customer_payment_id": cxc_id, "change_quotation_id": change["id"]}
    assert client_fixture.post(f"{ORDERS}/{order['id']}/credit-notes", headers=_headers(seller), json=note).status_code == 403
    created = client_fixture.post(f"{ORDERS}/{order['id']}/credit-notes", headers=auth_header_director, json=note)
    assert created.status_code == 201, created.text
    summary = client_fixture.get(f"{ORDERS}/{order['id']}/money-summary", headers=auth_header_director).json()
    assert summary["credit_note_pending"] == 0.0

    paid = client_fixture.post(f"{SALES}/invoices/{cxc_id}/installments", headers=auth_header_director,
                               json={"amount": 9280.0})
    assert paid.status_code == 200, paid.text
    session_fixture.expire_all()
    assert session_fixture.get(CustomerPayment, cxc_id).status == CXCStatus.PAID
    cancel = client_fixture.post(f"{SALES}/credit-notes/{created.json()['id']}/cancel", headers=auth_header_director,
                                 json={"cancel_reason": "Error"})
    assert cancel.status_code == 409


def test_credit_note_without_invoice_is_credit_in_favour(client_fixture, session_fixture, auth_header_director,
                                                         seed_client_and_tax):
    order = _order(client_fixture, auth_header_director, seed_client_and_tax)
    note = {"folio": "NC-2", "note_date": datetime.utcnow().isoformat(), "amount": 500.0, "reason": "Bonificación"}
    created = client_fixture.post(f"{ORDERS}/{order['id']}/credit-notes", headers=auth_header_director, json=note)
    assert created.status_code == 201, created.text
    summary = client_fixture.get(f"{ORDERS}/{order['id']}/money-summary", headers=auth_header_director).json()
    assert summary["unapplied_credit"] == 500.0
    cxc_id = _full_invoice(client_fixture, auth_header_director, order["id"], 11600.0)
    applied = client_fixture.post(f"{SALES}/credit-notes/{created.json()['id']}/apply", headers=auth_header_director,
                                  json={"customer_payment_id": cxc_id})
    assert applied.status_code == 200, applied.text
    summary = client_fixture.get(f"{ORDERS}/{order['id']}/money-summary", headers=auth_header_director).json()
    assert summary["unapplied_credit"] == 0.0
    cancelled = client_fixture.post(f"{SALES}/credit-notes/{created.json()['id']}/cancel",
                                    headers=auth_header_director, json={"cancel_reason": "Capturada por error"})
    assert cancelled.status_code == 200 and cancelled.json()["status"] == "CANCELLED"


# ---------------------------------------------------------------------------
# Complementary OV
# ---------------------------------------------------------------------------

def test_complementary_order_is_linked_to_the_original(client_fixture, auth_header_director, seed_client_and_tax):
    client, tax = seed_client_and_tax
    original = _order(client_fixture, auth_header_director, seed_client_and_tax)
    payload = {"project_name": "Adicional", "client_id": client.id, "tax_rate_id": tax.id,
               "valid_until": "2099-01-01T00:00:00", "items": default_items(),
               "parent_sales_order_id": original["id"]}
    quotation = client_fixture.post(f"{QUOTATIONS}/", headers=auth_header_director, json=payload).json()
    assert quotation["parent_sales_order_id"] == original["id"]
    client_fixture.post(f"{QUOTATIONS}/{quotation['id']}/request-auth", headers=auth_header_director)
    client_fixture.post(f"{QUOTATIONS}/{quotation['id']}/authorize", headers=auth_header_director,
                        json={"items": default_items(), "applied_margin_percent": 40,
                              "applied_commission_percent": 0, "advance_percent": 60})
    converted = client_fixture.post(f"{QUOTATIONS}/{quotation['id']}/convert", headers=auth_header_director,
                                    json={"client_po_folio": "OC-2", "client_po_date": "2026-10-08T12:00:00"})
    assert converted.status_code == 200, converted.text
    complementary = _get_order(client_fixture, auth_header_director, converted.json()["sales_order_id"])
    assert complementary["parent_sales_order_id"] == original["id"]
    assert complementary["id"] != original["id"]


def test_authorized_quotation_helper_still_regular(client_fixture, auth_header_director, seed_client_and_tax):
    quotation = authorized_quotation(client_fixture, auth_header_director, seed_client_and_tax[0].id,
                                     seed_client_and_tax[1].id)
    assert quotation["kind"] == "NEW" and quotation["folio"].startswith("COT-")


def test_cancelled_units_leave_batches_and_baptism(client_fixture, session_fixture, auth_header_director,
                                                   seed_client_and_tax):
    order = _order(client_fixture, auth_header_director, seed_client_and_tax)
    item_id = order["items"][0]["id"]
    unit_id = order["items"][0]["instances"][0]["id"]
    _reserve(session_fixture, unit_id, _material(session_fixture, committed=4.0), "ACTIVA")
    batch_id = session_fixture.get(SalesOrderItemInstance, unit_id).production_batch_id
    _through_apply(client_fixture, auth_header_director, order["id"],
                   [{"change_type": "CANCEL_LINE", "target_order_item_id": item_id}])

    session_fixture.expire_all()
    batch = session_fixture.get(ProductionBatch, batch_id)
    assert production_inventory_service.prod_inv_repo.get_batch_instances(session_fixture, batch) == []
    response = client_fixture.patch(f"{settings.API_V1_STR}/planning/orders/{order['id']}/baptize",
                                    headers=auth_header_director,
                                    json={"instances": [{"instance_id": unit_id, "custom_name": "Casa 1"}]})
    assert response.status_code == 400
