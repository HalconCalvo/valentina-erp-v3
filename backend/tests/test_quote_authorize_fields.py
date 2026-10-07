from tests.sales_helpers import QUOTATIONS, authorize_payload, create_quotation


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
    quotation = create_quotation(client_fixture, auth_header_director, client.id, tax.id, items=_items())
    assert client_fixture.post(f"{QUOTATIONS}/{quotation['id']}/request-auth", headers=auth_header_director).status_code == 200

    # Same payload shape the Director's review (FinancialReviewModal) sends when authorizing.
    reviewed = client_fixture.post(f"{QUOTATIONS}/{quotation['id']}/authorize", headers=auth_header_director,
                                   json=authorize_payload(items=_items(price=12000.0), advance_percent=50.0))
    assert reviewed.status_code == 200, reviewed.text
    assert reviewed.json()["status"] == "AUTHORIZED" and reviewed.json()["advance_percent"] == 50.0

    items = {i["product_name"]: i for i in reviewed.json()["items"]}
    assert items["Cocina Integral"]["commercial_description"] == "Color nogal, jaladeras negras"
    assert items["Cocina Integral"]["unit_price"] == 12000.0
    assert items["Parrilla"]["is_resale"] is True
    assert items["Parrilla"]["resale_sku"] == "RES-PARRILLA"
    assert items["Parrilla"]["commercial_description"] == "Parrilla de inducción 4 zonas"
