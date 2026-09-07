from datetime import datetime, timedelta

from app.core.config import settings


def _quotation_payload(client_id: int, tax_rate_id: int) -> dict:
    return {
        "project_name": "Proyecto Cotización Test",
        "client_id": client_id,
        "tax_rate_id": tax_rate_id,
        "valid_until": (datetime.utcnow() + timedelta(days=30)).isoformat(),
        "items": [
            {
                "product_name": "Cocina Integral",
                "quantity": 1,
                "unit_price": 10000.0,
                "cost_snapshot": {},
                "frozen_unit_cost": 5000.0,
            }
        ],
    }


def test_list_quotations(client_fixture, auth_header_director):
    response = client_fixture.get(
        f"{settings.API_V1_STR}/quotations/",
        headers=auth_header_director,
    )
    assert response.status_code == 200
    assert response.json() == []


def test_create_quotation(client_fixture, auth_header_director, seed_client_and_tax):
    client, tax = seed_client_and_tax
    response = client_fixture.post(
        f"{settings.API_V1_STR}/quotations/",
        headers=auth_header_director,
        json=_quotation_payload(client.id, tax.id),
    )
    assert response.status_code == 201
    payload = response.json()
    assert payload["status"] == "DRAFT"
    assert payload["project_name"] == "Proyecto Cotización Test"


def test_send_quotation(client_fixture, auth_header_director, seed_client_and_tax):
    client, tax = seed_client_and_tax
    create_response = client_fixture.post(
        f"{settings.API_V1_STR}/quotations/",
        headers=auth_header_director,
        json=_quotation_payload(client.id, tax.id),
    )
    quotation_id = create_response.json()["id"]

    response = client_fixture.post(
        f"{settings.API_V1_STR}/quotations/{quotation_id}/send",
        headers=auth_header_director,
    )
    assert response.status_code == 200
    assert response.json()["status"] == "SENT"


def test_cancel_quotation_requires_reason(client_fixture, auth_header_director, seed_client_and_tax):
    client, tax = seed_client_and_tax
    create_response = client_fixture.post(
        f"{settings.API_V1_STR}/quotations/",
        headers=auth_header_director,
        json=_quotation_payload(client.id, tax.id),
    )
    quotation_id = create_response.json()["id"]

    response = client_fixture.post(
        f"{settings.API_V1_STR}/quotations/{quotation_id}/cancel",
        headers=auth_header_director,
        json={},
    )
    assert response.status_code == 422


def test_cancel_quotation(client_fixture, auth_header_director, seed_client_and_tax):
    client, tax = seed_client_and_tax
    create_response = client_fixture.post(
        f"{settings.API_V1_STR}/quotations/",
        headers=auth_header_director,
        json=_quotation_payload(client.id, tax.id),
    )
    quotation_id = create_response.json()["id"]

    response = client_fixture.post(
        f"{settings.API_V1_STR}/quotations/{quotation_id}/cancel",
        headers=auth_header_director,
        json={"cancel_reason": "Cliente desistió del proyecto"},
    )
    assert response.status_code == 200
    assert response.json()["status"] == "CANCELLED"
