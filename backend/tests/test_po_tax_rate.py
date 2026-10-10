"""D4: the purchase order keeps its tax rate (16%, 8% or 0%); reception uses it when the invoice does not say."""
from types import SimpleNamespace

from sqlmodel import select

from app.core.config import settings
from app.models.inventory import PurchaseOrder
from app.models.material import Material
from app.services.purchase_service import _reception_tax_rate

PURCHASES = f"{settings.API_V1_STR}/purchases"


def _manual(client, headers, tax_rate, session=None):
    if session is not None and not session.exec(select(Material).where(Material.sku == "SERV-1")).first():
        session.add(Material(sku="SERV-1", name="Servicio", category="X", production_route="SERVICIO", purchase_unit="Pz", usage_unit="Pz"))
        session.commit()
    return client.post(f"{PURCHASES}/orders/manual", headers=headers, json={
        "provider_name": "Proveedor Frontera", "tax_rate": tax_rate, "overhead_category": "MATERIALES",
        "items": [{"sku": "SERV-1", "name": "Servicio", "qty": 1, "expected_cost": 1000}]})


def test_manual_po_keeps_its_tax_rate(client_fixture, session_fixture, auth_header_director):
    assert _manual(client_fixture, auth_header_director, 0.1).status_code == 422
    response = _manual(client_fixture, auth_header_director, 0.08, session_fixture)
    assert response.status_code == 200, response.text
    po = session_fixture.exec(select(PurchaseOrder)).one()
    assert po.tax_rate == 0.08
    edited = client_fixture.patch(f"{PURCHASES}/orders/{po.id}", headers=auth_header_director, json={"tax_rate": 0.0})
    assert edited.status_code == 200, edited.text
    session_fixture.refresh(po)
    assert po.tax_rate == 0.0


def test_reception_rate_defaults_to_the_po_and_keeps_exempt():
    po = SimpleNamespace(tax_rate=0.0)
    assert _reception_tax_rate({}, po) == 0.0
    assert _reception_tax_rate({"tax_rate": 0}, SimpleNamespace(tax_rate=0.16)) == 0.0
    assert _reception_tax_rate({"tax_rate": 0.08}, po) == 0.08
    assert _reception_tax_rate({}, SimpleNamespace(tax_rate=None)) == 0.16
