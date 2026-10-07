from datetime import datetime, timedelta

from app.core.config import settings

BASE = f"{settings.API_V1_STR}/sales/orders"


def _items(price: float = 10000.0) -> list[dict]:
    return [
        {
            "product_name": "Cocina Integral",
            "quantity": 1,
            "unit_price": price,
            "cost_snapshot": {},
            "frozen_unit_cost": 5000.0,
            "commercial_description": "Color nogal, jaladeras negras",
        },
        {
            "product_name": "Parrilla",
            "quantity": 1,
            "unit_price": 3000.0,
            "cost_snapshot": {},
            "frozen_unit_cost": 2000.0,
            "is_resale": True,
            "resale_sku": "RES-PARRILLA",
            "commercial_description": "Parrilla de inducción 4 zonas",
        },
    ]


def test_director_review_keeps_description_and_resale_fields(client_fixture, auth_header_director, seed_client_and_tax):
    client, tax = seed_client_and_tax
    created = client_fixture.post(
        BASE,
        headers=auth_header_director,
        json={
            "project_name": "Proyecto Descripción",
            "client_id": client.id,
            "tax_rate_id": tax.id,
            "valid_until": (datetime.utcnow() + timedelta(days=30)).isoformat(),
            "items": _items(),
        },
    )
    assert created.status_code == 200, created.text
    order_id = created.json()["id"]
    assert client_fixture.post(f"{BASE}/{order_id}/request-auth").status_code == 200

    # Same payload shape the Director's review (FinancialReviewModal) sends when authorizing.
    reviewed = client_fixture.patch(f"{BASE}/{order_id}", headers=auth_header_director, json={"items": _items(price=12000.0)})
    assert reviewed.status_code == 200, reviewed.text
    assert client_fixture.post(f"{BASE}/{order_id}/authorize").status_code == 200

    items = {i["product_name"]: i for i in client_fixture.get(f"{BASE}/{order_id}", headers=auth_header_director).json()["items"]}
    assert items["Cocina Integral"]["commercial_description"] == "Color nogal, jaladeras negras"
    assert items["Cocina Integral"]["unit_price"] == 12000.0
    assert items["Parrilla"]["is_resale"] is True
    assert items["Parrilla"]["resale_sku"] == "RES-PARRILLA"
    assert items["Parrilla"]["commercial_description"] == "Parrilla de inducción 4 zonas"
