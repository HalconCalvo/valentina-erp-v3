from app.core.config import settings
from tests.sales_helpers import create_order_via_quotation


def _invoice_payload(amount: float, folio: str) -> dict:
    return {
        "amount": amount,
        "invoice_folio": folio,
    }


def _create_order(client_fixture, headers, client_id, tax_id) -> dict:
    return create_order_via_quotation(client_fixture, headers, client_id, tax_id)


def test_order_is_born_waiting_advance_with_instances(client_fixture, auth_header_director, seed_client_and_tax):
    client, tax = seed_client_and_tax
    order = _create_order(client_fixture, auth_header_director, client.id, tax.id)
    assert order["status"] == "WAITING_ADVANCE"
    assert order["quotation_id"] is not None
    assert order["client_po_folio"] == "OC-TEST-001"
    assert len(order["items"]) == 1 and len(order["items"][0]["instances"]) == 1
    assert order["total_price"] > 0


def test_list_orders_route(client_fixture, auth_header_director, seed_client_and_tax):
    client, tax = seed_client_and_tax
    order = _create_order(client_fixture, auth_header_director, client.id, tax.id)
    response = client_fixture.get(f"{settings.API_V1_STR}/sales/orders", headers=auth_header_director)
    assert response.status_code == 200, response.text
    assert order["id"] in [row["id"] for row in response.json()]


def test_retired_order_endpoints(client_fixture, auth_header_director, seed_client_and_tax):
    client, tax = seed_client_and_tax
    order = _create_order(client_fixture, auth_header_director, client.id, tax.id)
    base = f"{settings.API_V1_STR}/sales/orders"
    assert client_fixture.post(base, headers=auth_header_director, json={}).status_code == 405
    for action in ("request-auth", "authorize", "mark_waiting_advance", "request_changes", "mark_lost", "reject"):
        assert client_fixture.post(f"{base}/{order['id']}/{action}", headers=auth_header_director).status_code == 404
    assert client_fixture.delete(f"{base}/{order['id']}", headers=auth_header_director).status_code == 405


def test_cancel_ov_without_payments(client_fixture, auth_header_director, seed_client_and_tax):
    client, tax = seed_client_and_tax
    order = _create_order(client_fixture, auth_header_director, client.id, tax.id)

    response = client_fixture.post(
        f"{settings.API_V1_STR}/sales/orders/{order['id']}/cancel_ov",
        headers=auth_header_director,
    )
    assert response.status_code == 200
    assert response.json()["status"] == "CANCELLED_OV"


def test_cancel_ov_with_advance_payment(client_fixture, auth_header_director, seed_client_and_tax):
    client, tax = seed_client_and_tax
    order = _create_order(client_fixture, auth_header_director, client.id, tax.id)

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


def test_emit_advance_invoice_allows_complementary(client_fixture, auth_header_director, seed_client_and_tax):
    """An OV may have several advance invoices (complementary advance of a change order)."""
    client, tax = seed_client_and_tax
    order = _create_order(client_fixture, auth_header_director, client.id, tax.id)
    for folio in ("FA-ANT-001", "FA-ANT-002"):
        response = client_fixture.post(
            f"{settings.API_V1_STR}/sales/orders/{order['id']}/emit_advance_invoice",
            headers=auth_header_director,
            json=_invoice_payload(6000.0, folio),
        )
        assert response.status_code == 200, response.text


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
