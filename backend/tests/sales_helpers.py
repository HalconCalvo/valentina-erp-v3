"""Test helpers: a sales order is only born from an authorized quotation with the client's PO."""
from datetime import datetime, timedelta

from app.core.config import settings

QUOTATIONS = f"{settings.API_V1_STR}/quotations"
ORDERS = f"{settings.API_V1_STR}/sales/orders"


def default_items(price: float = 10000.0) -> list[dict]:
    return [{"product_name": "Cocina Integral", "quantity": 1, "unit_price": price,
             "cost_snapshot": {}, "frozen_unit_cost": 5000.0}]


def quotation_payload(client_id: int, tax_rate_id: int, items: list[dict] | None = None) -> dict:
    return {
        "project_name": "Proyecto Cotización Test",
        "client_id": client_id,
        "tax_rate_id": tax_rate_id,
        "valid_until": (datetime.utcnow() + timedelta(days=30)).isoformat(),
        "items": default_items() if items is None else items,
    }


def authorize_payload(items: list[dict] | None = None, advance_percent: float = 60.0) -> dict:
    return {"items": items or default_items(), "applied_margin_percent": 40.0, "applied_commission_percent": 0.0,
            "advance_percent": advance_percent}


def create_quotation(client_fixture, headers, client_id, tax_id, items=None) -> dict:
    response = client_fixture.post(f"{QUOTATIONS}/", headers=headers, json=quotation_payload(client_id, tax_id, items))
    assert response.status_code == 201, response.text
    return response.json()


def authorized_quotation(client_fixture, headers, client_id, tax_id, items=None) -> dict:
    quotation = create_quotation(client_fixture, headers, client_id, tax_id, items)
    response = client_fixture.post(f"{QUOTATIONS}/{quotation['id']}/request-auth", headers=headers)
    assert response.status_code == 200, response.text
    response = client_fixture.post(f"{QUOTATIONS}/{quotation['id']}/authorize", headers=headers,
                                   json=authorize_payload(items))
    assert response.status_code == 200, response.text
    return response.json()


def create_order_via_quotation(client_fixture, headers, client_id, tax_id, items=None) -> dict:
    quotation = authorized_quotation(client_fixture, headers, client_id, tax_id, items)
    response = client_fixture.post(f"{QUOTATIONS}/{quotation['id']}/convert", headers=headers,
                                   json={"client_po_folio": "OC-TEST-001", "client_po_date": datetime.utcnow().isoformat()})
    assert response.status_code == 200, response.text
    order = client_fixture.get(f"{ORDERS}/{response.json()['sales_order_id']}", headers=headers)
    assert order.status_code == 200, order.text
    return order.json()
