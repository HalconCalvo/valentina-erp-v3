"""A draft production batch is cancelled with a reason, never deleted; its reservations stay as CANCELADA."""
from sqlmodel import select

from app.core.config import settings
from app.models.inventory import InventoryReservation
from app.models.material import Material
from app.models.production import ProductionBatch, ProductionBatchStatus

PRODUCTION = f"{settings.API_V1_STR}/production"


def test_draft_batch_is_cancelled_and_kept(client_fixture, session_fixture, auth_header_director):
    material = Material(sku="B-1", name="Tablero", category="TABLERO", production_route="MATERIAL",
                        purchase_unit="Hoja", usage_unit="Hoja", physical_stock=10, committed_stock=4)
    batch = ProductionBatch(folio="LOTE-MDF-9001", batch_type="MDF", status=ProductionBatchStatus.DRAFT)
    session_fixture.add_all([material, batch])
    session_fixture.flush()
    session_fixture.add(InventoryReservation(production_batch_id=batch.id, material_id=material.id,
                                             quantity_reserved=4, status="ACTIVA"))
    session_fixture.commit()
    url = f"{PRODUCTION}/{batch.id}/cancel"
    assert client_fixture.patch(url, headers=auth_header_director, json={"reason": " "}).status_code == 422
    response = client_fixture.patch(url, headers=auth_header_director, json={"reason": "Se reprograma la OV"})
    assert response.status_code == 200, response.text
    session_fixture.expire_all()
    batch = session_fixture.get(ProductionBatch, batch.id)
    assert batch is not None and batch.status == ProductionBatchStatus.CANCELLED
    reservation = session_fixture.exec(select(InventoryReservation)).one()
    assert reservation.status == "CANCELADA"
    assert session_fixture.get(Material, material.id).committed_stock == 0
    listed = client_fixture.get(f"{PRODUCTION}/", headers=auth_header_director).json()
    assert batch.id not in [b["id"] for b in listed]
    assert client_fixture.delete(f"{PRODUCTION}/{batch.id}", headers=auth_header_director).status_code == 404  # route removed
