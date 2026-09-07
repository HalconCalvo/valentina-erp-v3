from datetime import datetime, timedelta

from app.core.config import settings


def _order_payload(client_id: int, tax_rate_id: int, *, with_items: bool = True) -> dict:
    payload = {
        "project_name": "Proyecto OV Test",
        "client_id": client_id,
        "tax_rate_id": tax_rate_id,
        "valid_until": (datetime.utcnow() + timedelta(days=30)).isoformat(),
    }
    if with_items:
        payload["items"] = [
            {
                "product_name": "Cocina Integral",
                "quantity": 1,
                "unit_price": 10000.0,
                "cost_snapshot": {},
                "frozen_unit_cost": 5000.0,
            }
        ]
    else:
        payload["items"] = []
    return payload


def _invoice_payload(amount: float, folio: str) -> dict:
    return {
        "amount": amount,
        "invoice_folio": folio,
    }


def _create_order(client_fixture, headers, client_id, tax_id, *, with_items: bool = True) -> dict:
    response = client_fixture.post(
        f"{settings.API_V1_STR}/sales/orders",
        headers=headers,
        json=_order_payload(client_id, tax_id, with_items=with_items),
    )
    assert response.status_code == 200
    return response.json()


def _advance_order_to_waiting_advance(client_fixture, headers, order_id: int) -> None:
    response = client_fixture.post(
        f"{settings.API_V1_STR}/sales/orders/{order_id}/request-auth",
    )
    assert response.status_code == 200
    assert response.json()["status"] == "SENT"

    response = client_fixture.post(
        f"{settings.API_V1_STR}/sales/orders/{order_id}/authorize",
    )
    assert response.status_code == 200
    assert response.json()["status"] == "ACCEPTED"

    response = client_fixture.post(
        f"{settings.API_V1_STR}/sales/orders/{order_id}/mark_waiting_advance",
        headers=headers,
        json={
            "client_po_folio": "OC-TEST-001",
            "client_po_date": datetime.utcnow().isoformat(),
        },
    )
    assert response.status_code == 200
    assert response.json()["status"] == "WAITING_ADVANCE"


def test_create_order_success(client_fixture, auth_header_director, seed_client_and_tax):
    client, tax = seed_client_and_tax
    response = client_fixture.post(
        f"{settings.API_V1_STR}/sales/orders",
        headers=auth_header_director,
        json=_order_payload(client.id, tax.id),
    )
    assert response.status_code == 200
    payload = response.json()
    assert payload["status"] == "DRAFT"
    assert len(payload["items"]) == 1
    assert payload["total_price"] > 0


def test_create_order_requires_items(client_fixture, auth_header_director, seed_client_and_tax):
    client, tax = seed_client_and_tax
    response = client_fixture.post(
        f"{settings.API_V1_STR}/sales/orders",
        headers=auth_header_director,
        json=_order_payload(client.id, tax.id, with_items=False),
    )
    assert response.status_code == 422


def test_request_authorization(client_fixture, auth_header_director, seed_client_and_tax):
    client, tax = seed_client_and_tax
    order = _create_order(client_fixture, auth_header_director, client.id, tax.id)

    response = client_fixture.post(
        f"{settings.API_V1_STR}/sales/orders/{order['id']}/request-auth",
    )
    assert response.status_code == 200
    assert response.json()["status"] == "SENT"


def test_authorize_order(client_fixture, auth_header_director, seed_client_and_tax):
    client, tax = seed_client_and_tax
    order = _create_order(client_fixture, auth_header_director, client.id, tax.id)
    client_fixture.post(f"{settings.API_V1_STR}/sales/orders/{order['id']}/request-auth")

    response = client_fixture.post(
        f"{settings.API_V1_STR}/sales/orders/{order['id']}/authorize",
    )
    assert response.status_code == 200
    assert response.json()["status"] == "ACCEPTED"


def test_cancel_ov_without_payments(client_fixture, auth_header_director, seed_client_and_tax):
    client, tax = seed_client_and_tax
    order = _create_order(client_fixture, auth_header_director, client.id, tax.id)
    _advance_order_to_waiting_advance(client_fixture, auth_header_director, order["id"])

    response = client_fixture.post(
        f"{settings.API_V1_STR}/sales/orders/{order['id']}/cancel_ov",
        headers=auth_header_director,
    )
    assert response.status_code == 200
    assert response.json()["status"] == "CANCELLED_OV"


def test_cancel_ov_with_advance_payment(client_fixture, auth_header_director, seed_client_and_tax):
    client, tax = seed_client_and_tax
    order = _create_order(client_fixture, auth_header_director, client.id, tax.id)
    _advance_order_to_waiting_advance(client_fixture, auth_header_director, order["id"])

    invoice_response = client_fixture.post(
        f"{settings.API_V1_STR}/sales/orders/{order['id']}/emit_advance_invoice",
        headers=auth_header_director,
        json=_invoice_payload(6000.0, "FA-001"),
    )
    assert invoice_response.status_code == 200

    response = client_fixture.post(
        f"{settings.API_V1_STR}/sales/orders/{order['id']}/cancel_ov",
        headers=auth_header_director,
    )
    assert response.status_code == 400


def test_emit_advance_invoice(client_fixture, auth_header_director, seed_client_and_tax):
    client, tax = seed_client_and_tax
    order = _create_order(client_fixture, auth_header_director, client.id, tax.id)

    response = client_fixture.post(
        f"{settings.API_V1_STR}/sales/orders/{order['id']}/emit_advance_invoice",
        headers=auth_header_director,
        json=_invoice_payload(6000.0, "FA-ANT-001"),
    )
    assert response.status_code == 200
    payload = response.json()
    assert payload["cxc_id"] > 0
    assert payload["invoice_folio"] == "FA-ANT-001"


def test_emit_advance_invoice_duplicate(client_fixture, auth_header_director, seed_client_and_tax):
    client, tax = seed_client_and_tax
    order = _create_order(client_fixture, auth_header_director, client.id, tax.id)
    first = client_fixture.post(
        f"{settings.API_V1_STR}/sales/orders/{order['id']}/emit_advance_invoice",
        headers=auth_header_director,
        json=_invoice_payload(6000.0, "FA-ANT-001"),
    )
    assert first.status_code == 200

    response = client_fixture.post(
        f"{settings.API_V1_STR}/sales/orders/{order['id']}/emit_advance_invoice",
        headers=auth_header_director,
        json=_invoice_payload(6000.0, "FA-ANT-002"),
    )
    assert response.status_code == 400


def test_emit_full_invoice(client_fixture, auth_header_director, seed_client_and_tax):
    client, tax = seed_client_and_tax
    order = _create_order(client_fixture, auth_header_director, client.id, tax.id)

    response = client_fixture.post(
        f"{settings.API_V1_STR}/sales/orders/{order['id']}/emit_full_invoice",
        headers=auth_header_director,
        json=_invoice_payload(order["total_price"], "FF-100-001"),
    )
    assert response.status_code == 200
    payload = response.json()
    assert payload["cxc_id"] > 0
    assert payload["payment_type"] == "FULL"


def test_register_installment_success(client_fixture, auth_header_director, seed_client_and_tax):
    client, tax = seed_client_and_tax
    order = _create_order(client_fixture, auth_header_director, client.id, tax.id)
    balance_before = order["outstanding_balance"]

    invoice = client_fixture.post(
        f"{settings.API_V1_STR}/sales/orders/{order['id']}/emit_full_invoice",
        headers=auth_header_director,
        json=_invoice_payload(order["total_price"], "FF-ABONO-001"),
    )
    cxc_id = invoice.json()["cxc_id"]

    installment_amount = 5000.0
    response = client_fixture.post(
        f"{settings.API_V1_STR}/sales/invoices/{cxc_id}/installments",
        headers=auth_header_director,
        json={"amount": installment_amount},
    )
    assert response.status_code == 200

    order_after = client_fixture.get(
        f"{settings.API_V1_STR}/sales/orders/{order['id']}",
        headers=auth_header_director,
    ).json()
    assert order_after["outstanding_balance"] == balance_before - installment_amount


def test_register_installment_exceeds_amount(client_fixture, auth_header_director, seed_client_and_tax):
    client, tax = seed_client_and_tax
    order = _create_order(client_fixture, auth_header_director, client.id, tax.id)

    invoice = client_fixture.post(
        f"{settings.API_V1_STR}/sales/orders/{order['id']}/emit_full_invoice",
        headers=auth_header_director,
        json=_invoice_payload(5000.0, "FF-EXCESS-001"),
    )
    cxc_id = invoice.json()["cxc_id"]

    response = client_fixture.post(
        f"{settings.API_V1_STR}/sales/invoices/{cxc_id}/installments",
        headers=auth_header_director,
        json={"amount": 6000.0},
    )
    assert response.status_code == 400


def test_cancel_installment_requires_reason(client_fixture, auth_header_director, seed_client_and_tax):
    client, tax = seed_client_and_tax
    order = _create_order(client_fixture, auth_header_director, client.id, tax.id)

    invoice = client_fixture.post(
        f"{settings.API_V1_STR}/sales/orders/{order['id']}/emit_full_invoice",
        headers=auth_header_director,
        json=_invoice_payload(order["total_price"], "FF-CANCEL-001"),
    )
    cxc_id = invoice.json()["cxc_id"]

    client_fixture.post(
        f"{settings.API_V1_STR}/sales/invoices/{cxc_id}/installments",
        headers=auth_header_director,
        json={"amount": 3000.0},
    )
    installments = client_fixture.get(
        f"{settings.API_V1_STR}/sales/invoices/{cxc_id}/installments",
        headers=auth_header_director,
    ).json()
    installment_id = installments["abonos"][0]["id"]

    response = client_fixture.patch(
        f"{settings.API_V1_STR}/sales/installments/{installment_id}/cancel",
        headers=auth_header_director,
        json={},
    )
    assert response.status_code == 422


def test_cancel_installment_reverts_balance(client_fixture, auth_header_director, seed_client_and_tax):
    client, tax = seed_client_and_tax
    order = _create_order(client_fixture, auth_header_director, client.id, tax.id)
    balance_before = order["outstanding_balance"]

    invoice = client_fixture.post(
        f"{settings.API_V1_STR}/sales/orders/{order['id']}/emit_full_invoice",
        headers=auth_header_director,
        json=_invoice_payload(order["total_price"], "FF-REVERT-001"),
    )
    cxc_id = invoice.json()["cxc_id"]

    client_fixture.post(
        f"{settings.API_V1_STR}/sales/invoices/{cxc_id}/installments",
        headers=auth_header_director,
        json={"amount": 4000.0},
    )
    order_after_payment = client_fixture.get(
        f"{settings.API_V1_STR}/sales/orders/{order['id']}",
        headers=auth_header_director,
    ).json()
    assert order_after_payment["outstanding_balance"] == balance_before - 4000.0

    installments = client_fixture.get(
        f"{settings.API_V1_STR}/sales/invoices/{cxc_id}/installments",
        headers=auth_header_director,
    ).json()
    installment_id = installments["abonos"][0]["id"]

    cancel_response = client_fixture.patch(
        f"{settings.API_V1_STR}/sales/installments/{installment_id}/cancel",
        headers=auth_header_director,
        json={"cancel_reason": "Abono registrado por error"},
    )
    assert cancel_response.status_code == 200

    order_after_cancel = client_fixture.get(
        f"{settings.API_V1_STR}/sales/orders/{order['id']}",
        headers=auth_header_director,
    ).json()
    assert order_after_cancel["outstanding_balance"] == balance_before
