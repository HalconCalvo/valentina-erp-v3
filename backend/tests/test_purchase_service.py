from sqlmodel import select

from app.core.config import settings
from app.models.foundations import Provider
from app.models.inventory import PurchaseOrder, PurchaseOrderItem, PurchaseRequisition
from app.models.material import Material, ProductionRoute
from app.repositories import purchase_repository as purchase_repo
from app.services import purchase_service
from tests.sales_helpers import create_order_via_quotation


def _seed_provider_and_material(session_fixture):
    provider = Provider(business_name="Proveedor Test", credit_days=30, is_active=True)
    session_fixture.add(provider)
    session_fixture.flush()
    material = Material(
        sku="MAT-TEST-001",
        name="Material Test",
        category="GENERAL",
        production_route=ProductionRoute.MATERIAL,
        purchase_unit="pza",
        usage_unit="pza",
        current_cost=100.0,
        provider_id=provider.id,
    )
    session_fixture.add(material)
    session_fixture.commit()
    session_fixture.refresh(provider)
    session_fixture.refresh(material)
    return provider, material


def _requisition_payload(*, material_id: int | None = None) -> dict:
    return {
        "material_id": material_id,
        "custom_description": "Requisición de prueba",
        "requested_quantity": 5.0,
        "notes": "Test automatizado",
    }


def _create_draft_po(client_fixture, headers, provider_id: int, material_id: int) -> int:
    response = client_fixture.post(
        f"{settings.API_V1_STR}/purchases/orders/bulk-emit",
        headers=headers,
        json={
            "provider_id": provider_id,
            "items": [
                {
                    "material_id": material_id,
                    "name": "Material Test",
                    "qty": 10,
                    "expected_cost": 100.0,
                }
            ],
        },
    )
    assert response.status_code == 200
    return response.json()["po_id"]


def _authorize_po(client_fixture, headers, po_id: int) -> None:
    response = client_fixture.put(
        f"{settings.API_V1_STR}/purchases/orders/{po_id}/authorize",
        headers=headers,
    )
    assert response.status_code == 200
    assert response.json()["status"] == "AUTORIZADA"


def _dispatch_po(client_fixture, headers, po_id: int) -> None:
    response = client_fixture.put(
        f"{settings.API_V1_STR}/purchases/orders/{po_id}/dispatch",
        headers=headers,
    )
    assert response.status_code == 200


def test_create_requisition_success(client_fixture, session_fixture, auth_header_director):
    _, material = _seed_provider_and_material(session_fixture)
    without_session = client_fixture.post(
        f"{settings.API_V1_STR}/purchases/requisitions/",
        json=_requisition_payload(material_id=material.id),
    )
    assert without_session.status_code == 401
    response = client_fixture.post(
        f"{settings.API_V1_STR}/purchases/requisitions/",
        headers=auth_header_director,
        json=_requisition_payload(material_id=material.id),
    )
    assert response.status_code in (200, 201)
    payload = response.json()
    assert payload["status"] == "PENDIENTE"
    assert payload["requested_quantity"] == 5.0


def test_delete_requisition_marks_cancelled(
    client_fixture, auth_header_director, session_fixture
):
    _, material = _seed_provider_and_material(session_fixture)
    create_response = client_fixture.post(
        f"{settings.API_V1_STR}/purchases/requisitions/",
        headers=auth_header_director,
        json=_requisition_payload(material_id=material.id),
    )
    req_id = create_response.json()["id"]

    delete_response = client_fixture.delete(
        f"{settings.API_V1_STR}/purchases/requisitions/{req_id}",
        headers=auth_header_director,
    )
    assert delete_response.status_code == 200

    requisition = session_fixture.get(PurchaseRequisition, req_id)
    assert requisition is not None
    assert requisition.status == "CANCELADA"


def test_authorize_po_success(client_fixture, auth_header_director, session_fixture):
    provider, material = _seed_provider_and_material(session_fixture)
    po_id = _create_draft_po(client_fixture, auth_header_director, provider.id, material.id)

    response = client_fixture.put(
        f"{settings.API_V1_STR}/purchases/orders/{po_id}/authorize",
        headers=auth_header_director,
    )
    assert response.status_code == 200
    assert response.json()["status"] == "AUTORIZADA"


def test_revoke_po(client_fixture, auth_header_director, session_fixture):
    provider, material = _seed_provider_and_material(session_fixture)
    po_id = _create_draft_po(client_fixture, auth_header_director, provider.id, material.id)
    _authorize_po(client_fixture, auth_header_director, po_id)

    response = client_fixture.put(
        f"{settings.API_V1_STR}/purchases/orders/{po_id}/revoke",
        headers=auth_header_director,
    )
    assert response.status_code == 200

    po = session_fixture.get(PurchaseOrder, po_id)
    assert po.status == "DRAFT"


def test_dispatch_po(client_fixture, auth_header_director, session_fixture):
    provider, material = _seed_provider_and_material(session_fixture)
    po_id = _create_draft_po(client_fixture, auth_header_director, provider.id, material.id)
    _authorize_po(client_fixture, auth_header_director, po_id)

    response = client_fixture.put(
        f"{settings.API_V1_STR}/purchases/orders/{po_id}/dispatch",
        headers=auth_header_director,
    )
    assert response.status_code == 200

    po = session_fixture.get(PurchaseOrder, po_id)
    assert po.status == "ENVIADA"


def test_cancel_dispatched_po(client_fixture, auth_header_director, session_fixture):
    provider, material = _seed_provider_and_material(session_fixture)
    po_id = _create_draft_po(client_fixture, auth_header_director, provider.id, material.id)
    _authorize_po(client_fixture, auth_header_director, po_id)
    _dispatch_po(client_fixture, auth_header_director, po_id)

    response = client_fixture.put(
        f"{settings.API_V1_STR}/purchases/orders/{po_id}/cancel",
        headers=auth_header_director,
    )
    assert response.status_code == 200

    po = session_fixture.get(PurchaseOrder, po_id)
    assert po.status == "CANCELADA"


def test_mark_item_no_more(client_fixture, auth_header_director, session_fixture):
    provider, material = _seed_provider_and_material(session_fixture)
    po_id = _create_draft_po(client_fixture, auth_header_director, provider.id, material.id)
    _authorize_po(client_fixture, auth_header_director, po_id)
    _dispatch_po(client_fixture, auth_header_director, po_id)

    item = session_fixture.exec(
        select(PurchaseOrderItem).where(PurchaseOrderItem.purchase_order_id == po_id)
    ).first()
    assert item is not None

    response = client_fixture.put(
        f"{settings.API_V1_STR}/purchases/orders/{po_id}/items/{item.id}/no-more",
        headers=auth_header_director,
        json={"reason": "Proveedor confirmó que no surtirá el resto"},
    )
    assert response.status_code == 200
    payload = response.json()
    assert payload["po_status"] == "CANCELADA"

    session_fixture.refresh(item)
    assert item.is_cancelled is True
    assert item.cancel_reason == "Proveedor confirmó que no surtirá el resto"


def test_reject_po_cancels_not_deletes(client_fixture, auth_header_director, session_fixture):
    provider, material = _seed_provider_and_material(session_fixture)
    po_id = _create_draft_po(client_fixture, auth_header_director, provider.id, material.id)

    items_before = session_fixture.exec(
        select(PurchaseOrderItem).where(PurchaseOrderItem.purchase_order_id == po_id)
    ).all()
    assert len(items_before) == 1

    response = client_fixture.post(
        f"{settings.API_V1_STR}/purchases/orders/{po_id}/reject",
        headers=auth_header_director,
        params={"action": "CANCELAR"},
    )
    assert response.status_code == 200

    po = session_fixture.get(PurchaseOrder, po_id)
    assert po.status == "CANCELADA"

    items_after = session_fixture.exec(
        select(PurchaseOrderItem).where(PurchaseOrderItem.purchase_order_id == po_id)
    ).all()
    assert len(items_after) == len(items_before)
    assert all(item.is_cancelled for item in items_after)
    assert all(item.cancel_reason for item in items_after)


def test_requisition_for_an_ov_carries_the_ov_to_the_purchase_order(client_fixture, session_fixture,
                                                                    auth_header_director, seed_client_and_tax):
    """H21/D31: the requisition says which OV it is for, and so does the purchase order line made from it."""
    provider, material = _seed_provider_and_material(session_fixture)
    order = create_order_via_quotation(client_fixture, auth_header_director, seed_client_and_tax[0].id,
                                       seed_client_and_tax[1].id)
    url = f"{settings.API_V1_STR}/purchases/requisitions/"
    options = client_fixture.get(f"{settings.API_V1_STR}/purchases/sales-order-options",
                                 headers=auth_header_director).json()
    assert [o["id"] for o in options] == [order["id"]]  # the OV is sold (waiting advance) and open
    bad = client_fixture.post(url, headers=auth_header_director,
                              json={**_requisition_payload(material_id=material.id), "sales_order_id": 999999})
    assert bad.status_code == 400
    created = client_fixture.post(url, headers=auth_header_director,
                                  json={**_requisition_payload(material_id=material.id), "sales_order_id": order["id"],
                                        "notes": "Para la obra"})  # "auto…" notes read as automatic
    assert created.status_code == 201, created.text
    label = f"OV-{str(order['id']).zfill(4)}"
    planning = client_fixture.get(f"{settings.API_V1_STR}/purchases/planning/consolidated",
                                  headers=auth_header_director).json()
    line = next(i for g in planning for i in g["items"] if i["requisition_id"] == created.json()["id"])
    assert line["sales_order_id"] == order["id"] and line["project_name"].startswith(label)
    emitted = client_fixture.post(f"{settings.API_V1_STR}/purchases/orders/bulk-emit", headers=auth_header_director,
                                  json={"provider_id": provider.id, "items": [{**line, "name": line["name"]}]})
    assert emitted.status_code == 200, emitted.text
    # The orders listing uses PostgreSQL-only SQL (STRING_AGG/ANY); check the stored line instead.
    po_line = session_fixture.exec(select(PurchaseOrderItem)
                                   .where(PurchaseOrderItem.purchase_order_id == emitted.json()["po_id"])).one()
    assert po_line.sales_order_id == order["id"]


def test_cancelling_a_line_recalculates_the_po_total(client_fixture, auth_header_director, session_fixture):
    """H23: cancelling a line updates the PO estimated amount, like removing it from a draft does."""
    provider, material = _seed_provider_and_material(session_fixture)
    second = Material(sku="MAT-TEST-002", name="Otro", category="GENERAL", production_route=ProductionRoute.MATERIAL,
                      purchase_unit="pza", usage_unit="pza", current_cost=50.0, provider_id=provider.id)
    session_fixture.add(second)
    session_fixture.commit()
    emitted = client_fixture.post(f"{settings.API_V1_STR}/purchases/orders/bulk-emit", headers=auth_header_director,
                                  json={"provider_id": provider.id, "items": [
                                      {"material_id": material.id, "name": "Material Test", "qty": 10, "expected_cost": 100.0},
                                      {"material_id": second.id, "name": "Otro", "qty": 4, "expected_cost": 50.0}]})
    po_id = emitted.json()["po_id"]
    line = session_fixture.exec(select(PurchaseOrderItem).where(PurchaseOrderItem.purchase_order_id == po_id,
                                                                PurchaseOrderItem.material_id == second.id)).one()
    cancelled = client_fixture.patch(f"{settings.API_V1_STR}/purchases/orders/{po_id}/items/{line.id}/cancel",
                                     headers=auth_header_director, json={"cancel_reason": "Ya no se necesita"})
    assert cancelled.status_code == 200, cancelled.text
    session_fixture.expire_all()
    assert session_fixture.get(PurchaseOrder, po_id).total_estimated_amount == 1000.0



def test_editing_a_line_recalculates_the_po_total(client_fixture, auth_header_director, session_fixture):
    """Gabriel 20/10 (OC-M261006223132): a quantity edited from 100 to 50 left the OC total with the old 100."""
    provider, material = _seed_provider_and_material(session_fixture)
    po_id = _create_draft_po(client_fixture, auth_header_director, provider.id, material.id)  # 10 x 100
    line = session_fixture.exec(select(PurchaseOrderItem).where(PurchaseOrderItem.purchase_order_id == po_id)).one()
    edited = client_fixture.patch(f"{settings.API_V1_STR}/purchases/orders/{po_id}/items/{line.id}",
                                headers=auth_header_director, json={"quantity_ordered": 5, "expected_unit_cost": 80.0})
    assert edited.status_code == 200, edited.text
    session_fixture.expire_all()
    assert session_fixture.get(PurchaseOrder, po_id).total_estimated_amount == 400.0

def test_removing_a_draft_line_returns_its_requisition_to_compras(client_fixture, auth_header_director,
                                                                 session_fixture):
    """H22: "Quitar partida" is not destructive: the line leaves the draft PO and its requisition is pending again."""
    provider, material = _seed_provider_and_material(session_fixture)
    req = client_fixture.post(f"{settings.API_V1_STR}/purchases/requisitions/", headers=auth_header_director,
                              json={**_requisition_payload(material_id=material.id), "notes": "Para la obra"}).json()
    emitted = client_fixture.post(f"{settings.API_V1_STR}/purchases/orders/bulk-emit", headers=auth_header_director,
                                  json={"provider_id": provider.id, "items": [
                                      {"requisition_id": req["id"], "material_id": material.id, "name": "Material Test",
                                       "qty": 5, "expected_cost": 100.0}]})
    po_id = emitted.json()["po_id"]
    assert session_fixture.get(PurchaseRequisition, req["id"]).status == "PROCESADA"
    line = session_fixture.exec(select(PurchaseOrderItem).where(PurchaseOrderItem.purchase_order_id == po_id)).one()
    removed = client_fixture.delete(f"{settings.API_V1_STR}/purchases/orders/{po_id}/items/{line.id}",
                                    headers=auth_header_director)
    assert removed.status_code == 200, removed.text
    session_fixture.expire_all()
    assert session_fixture.get(PurchaseRequisition, req["id"]).status == "PENDIENTE"


def test_kardex_shows_the_po_folio_of_a_reception(client_fixture, auth_header_director, session_fixture):
    """H29: a PO reception reads the PO folio in the kardex, not "RECEPCION_OC"."""
    provider, material = _seed_provider_and_material(session_fixture)
    po_id = _create_draft_po(client_fixture, auth_header_director, provider.id, material.id)
    _authorize_po(client_fixture, auth_header_director, po_id)
    _dispatch_po(client_fixture, auth_header_director, po_id)
    item = session_fixture.exec(select(PurchaseOrderItem).where(PurchaseOrderItem.purchase_order_id == po_id)).first()
    received = client_fixture.put(f"{settings.API_V1_STR}/purchases/orders/{po_id}/receive",
                                  headers=auth_header_director, json={
                                      "invoice_folio": "FAC-H29", "received_items": [
                                          {"item_id": item.id, "sku": material.sku, "received_qty": 10}]})
    assert received.status_code == 200, received.text
    kardex = client_fixture.get(f"{settings.API_V1_STR}/foundations/materials/{material.id}/kardex",
                                headers=auth_header_director).json()
    folio = session_fixture.get(PurchaseOrder, po_id).folio
    assert [e["reference"] for e in kardex["entries"]] == [folio]


def test_po_creator_and_authorizer_names(client_fixture, auth_header_director, session_fixture):
    """Gabriel 20/10: Mesa de control shows "Creada el … por …" and later views "Autorizada por <nombre> el …"
    (the list endpoint uses PostgreSQL-only SQL, so the two helpers it calls are tested directly)."""
    provider, material = _seed_provider_and_material(session_fixture)
    po_id = _create_draft_po(client_fixture, auth_header_director, provider.id, material.id)
    po = session_fixture.get(PurchaseOrder, po_id)
    assert purchase_service.resolve_po_authorizer_name(session_fixture, po) is None
    creator = purchase_repo.get_user_names(session_fixture, [po.created_by_user_id])
    _authorize_po(client_fixture, auth_header_director, po_id)
    session_fixture.refresh(po)
    assert po.authorized_at is not None
    assert purchase_service.resolve_po_authorizer_name(session_fixture, po) == creator[po.created_by_user_id]
    po.authorized_by = "Dirección"  # legacy text that matches no user
    assert purchase_service.resolve_po_authorizer_name(session_fixture, po) == "Dirección"
