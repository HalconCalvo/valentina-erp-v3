"""D21 (Gabriel 15:43): route CLIENTE "Lo pone el cliente" (PIEDRA DEL CLIENTE): $0 fixed, never bought, no stock,
no shortage in the Simulador, no discharge; the house still gets its stone batch like any stone."""
import pytest
from fastapi import HTTPException
from sqlmodel import select

from app.core.config import settings
from app.models.design import ProductVersion, VersionComponent
from app.models.foundations import Provider
from app.models.inventory import InventoryReservation
from app.models.material import Material
from app.models.production import ProductionBatch, ProductionBatchStatus
from app.schemas.production_inventory_schema import BatchStatusUpdate
from app.services import design_version_service, material_service
from app.services import production_inventory_service as svc
from tests.test_production_inventory import _headers, env  # noqa: F401  (fixture)

API = settings.API_V1_STR


def _client_stone(session) -> Material:
    stone = Material(sku="PIEDRA-CLIENTE", name="PIEDRA DEL CLIENTE", category="Piedra", production_route="CLIENTE",
                     purchase_unit="m²", usage_unit="m²", current_cost=0.0)
    session.add(stone)
    session.commit()
    session.refresh(stone)
    return stone


def _stone_house(env):  # noqa: F811
    stone = _client_stone(env.s)
    version = env.s.exec(select(ProductVersion)).first()
    env.s.add(VersionComponent(version_id=version.id, material_id=stone.id, quantity=4.5))
    env.s.commit()
    return stone, version


def test_client_stone_is_no_shortage_and_the_stone_batch_enters_production(client_fixture, env):  # noqa: F811
    stone, version = _stone_house(env)
    simulated = client_fixture.post(f"{API}/design/simulate_batch", headers=_headers(env.director),
                                    json={"instance_ids": [env.instances[0].id], "batch_type": "PIEDRA"})
    assert simulated.status_code == 200, simulated.text
    line = next(m for m in simulated.json()["materials"] if m["sku"] == "PIEDRA-CLIENTE")
    assert line["client_supplied"] and line["status_color"] == "GREEN" and not line["is_blocking"]
    assert simulated.json()["suggested_status"] == "DRAFT"

    components = [(c.material_id, c.quantity) for c in
                  env.s.exec(select(VersionComponent).where(VersionComponent.version_id == version.id)).all()]
    design_version_service.refresh_version_cache(env.s, version, components)
    assert version.has_stone_components  # stone category: stone batch, lane, manifest and INSTALAGRANITO as usual
    batch = ProductionBatch(folio="L-PIE-C", batch_type="PIEDRA", status=ProductionBatchStatus.DRAFT)
    env.s.add(batch)
    env.s.commit()
    assigned = client_fixture.post(f"{API}/production/{batch.id}/assign_instance/{env.instances[0].id}",
                                   headers=_headers(env.director))
    assert assigned.status_code == 200, assigned.text
    assert not env.s.exec(select(InventoryReservation).where(InventoryReservation.material_id == stone.id)).all()
    svc.change_batch_status(env.s, batch.id, BatchStatusUpdate(status="IN_PRODUCTION"), env.director)
    env.s.refresh(stone)
    assert stone.physical_stock == 0


def test_client_stone_is_never_bought_and_costs_zero(client_fixture, session_fixture, auth_header_director):
    stone = _client_stone(session_fixture)
    provider = Provider(business_name="Marmolera", credit_days=0, is_active=True)
    session_fixture.add(provider)
    session_fixture.commit()
    requisition = client_fixture.post(f"{API}/purchases/requisitions/", headers=auth_header_director,
                                      json={"material_id": stone.id, "requested_quantity": 4.5})
    assert requisition.status_code == 409 and "D21" in requisition.json()["detail"]
    order = client_fixture.post(f"{API}/purchases/orders/bulk-emit", headers=auth_header_director, json={
        "provider_id": provider.id,
        "items": [{"material_id": stone.id, "name": stone.name, "qty": 4.5, "expected_cost": 100.0}]})
    assert order.status_code == 409
    with pytest.raises(HTTPException) as exc:
        material_service.assert_client_cost(stone, 250.0)
    assert exc.value.status_code == 409
    material_service.assert_client_cost(stone, 0)


def test_route_change_to_cliente_resets_cost(client_fixture, session_fixture, auth_header_director):
    material = Material(sku="GRA-X", name="Granito X", category="Piedra", production_route="SERVICIO",
                        purchase_unit="m²", usage_unit="m²", current_cost=900.0)
    session_fixture.add(material)
    session_fixture.commit()
    response = client_fixture.patch(f"{API}/foundations/materials/{material.id}/route", headers=auth_header_director,
                                    json={"production_route": "CLIENTE", "reason": "La pone el cliente"})
    assert response.status_code == 200, response.text
    session_fixture.refresh(material)
    assert material.current_cost == 0
