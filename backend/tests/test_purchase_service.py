from sqlmodel import select

from app.core.config import settings
from app.models.foundations import Provider
from app.models.inventory import PurchaseOrder, PurchaseOrderItem, PurchaseRequisition
from app.models.material import Material, ProductionRoute


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


def test_create_requisition_success(client_fixture, session_fixture):
    _, material = _seed_provider_and_material(session_fixture)
    response = client_fixture.post(
        f"{settings.API_V1_STR}/purchases/requisitions/",
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
