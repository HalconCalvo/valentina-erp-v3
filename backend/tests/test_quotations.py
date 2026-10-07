from datetime import datetime, timedelta

from sqlmodel import select

from app.core.security import create_access_token, get_password_hash
from app.models.audit import AuditFieldChange
from app.models.design import ProductMaster, ProductVersion, VersionComponent
from app.models.material import Material
from app.models.sales import Quotation, QuotationItem, QuotationStatus, SalesOrder
from app.models.users import User, UserRole
from tests.conftest import TEST_SALES_EMAIL
from tests.sales_helpers import (
    QUOTATIONS,
    authorize_payload,
    authorized_quotation,
    create_order_via_quotation,
    create_quotation,
    default_items,
)

PO = {"client_po_folio": "OC-CLIENTE-9", "client_po_date": "2026-10-07T12:00:00"}


def _headers(user: User) -> dict:
    token = create_access_token(subject=user.email, user_id=user.id, user_role=user.role.value)
    return {"Authorization": f"Bearer {token}"}


def _user(session, role: UserRole) -> User:
    user = User(email=f"{role.value.lower()}@quotes.local", full_name=f"{role.value} Quotes",
                hashed_password=get_password_hash("Pass123!"), role=role, is_active=True)
    session.add(user)
    session.commit()
    session.refresh(user)
    return user


def _sales_headers(session) -> dict:
    return _headers(session.exec(select(User).where(User.email == TEST_SALES_EMAIL)).first())


def _post(client, quotation_id, action, headers, json=None):
    return client.post(f"{QUOTATIONS}/{quotation_id}/{action}", headers=headers, json=json)


def _pending(client, headers, seed) -> dict:
    quotation = create_quotation(client, headers, seed[0].id, seed[1].id)
    assert _post(client, quotation["id"], "request-auth", headers).status_code == 200
    return quotation


def test_list_quotations_empty(client_fixture, auth_header_director):
    response = client_fixture.get(f"{QUOTATIONS}/", headers=auth_header_director)
    assert response.status_code == 200
    assert response.json() == []


def test_create_quotation_is_draft_with_folio(client_fixture, auth_header_director, seed_client_and_tax):
    quotation = create_quotation(client_fixture, auth_header_director, seed_client_and_tax[0].id, seed_client_and_tax[1].id)
    assert quotation["status"] == "DRAFT"
    assert quotation["folio"] == f"COT-{quotation['id']:04d}"
    assert len(quotation["items"]) == 1 and quotation["total_price"] > 0


def test_request_auth_requires_items(client_fixture, auth_header_director, seed_client_and_tax):
    quotation = create_quotation(client_fixture, auth_header_director, seed_client_and_tax[0].id,
                                 seed_client_and_tax[1].id, items=[])
    assert _post(client_fixture, quotation["id"], "request-auth", auth_header_director).status_code == 422


def test_full_flow_converts_to_order(client_fixture, auth_header_director, seed_client_and_tax, session_fixture):
    order = create_order_via_quotation(client_fixture, auth_header_director, seed_client_and_tax[0].id,
                                       seed_client_and_tax[1].id)
    quotation = client_fixture.get(f"{QUOTATIONS}/{order['quotation_id']}", headers=auth_header_director).json()
    assert quotation["status"] == "CONVERTED" and quotation["sales_order_id"] == order["id"]
    assert quotation["authorized_by_user_id"] is not None and quotation["converted_at"]
    assert order["status"] == "WAITING_ADVANCE" and order["client_po_folio"] == "OC-TEST-001"
    again = _post(client_fixture, quotation["id"], "convert", auth_header_director, PO)
    assert again.status_code == 422


def test_only_director_authorizes(client_fixture, auth_header_director, seed_client_and_tax, session_fixture):
    quotation = _pending(client_fixture, auth_header_director, seed_client_and_tax)
    manager = _user(session_fixture, UserRole.MANAGER)
    for headers in (_headers(manager), _sales_headers(session_fixture)):
        response = _post(client_fixture, quotation["id"], "authorize", headers, authorize_payload())
        assert response.status_code == 403
    assert _post(client_fixture, quotation["id"], "authorize", auth_header_director,
                 authorize_payload()).status_code == 200


def test_director_returns_with_reason_and_seller_corrects(client_fixture, auth_header_director, seed_client_and_tax,
                                                           session_fixture):
    quotation = _pending(client_fixture, auth_header_director, seed_client_and_tax)
    assert _post(client_fixture, quotation["id"], "request-changes", auth_header_director, {"reason": " "}).status_code == 422
    returned = _post(client_fixture, quotation["id"], "request-changes", auth_header_director,
                     {"reason": "Revisar precio de cubierta"})
    assert returned.status_code == 200
    assert returned.json()["status"] == "CHANGES_REQUESTED"
    assert returned.json()["changes_requested_reason"] == "Revisar precio de cubierta"
    edited = client_fixture.patch(f"{QUOTATIONS}/{quotation['id']}", headers=auth_header_director,
                                  json={"items": default_items(price=11000.0)})
    assert edited.status_code == 200 and edited.json()["subtotal"] == 11000.0
    log = session_fixture.exec(select(AuditFieldChange).where(AuditFieldChange.table_name == "quotations",
                                                              AuditFieldChange.field_name == "status")).all()
    assert any(r.reason == "Revisar precio de cubierta" for r in log)


def test_seller_cannot_return_quotation_under_review(client_fixture, seed_client_and_tax, session_fixture):
    sales = _sales_headers(session_fixture)
    quotation = _pending(client_fixture, sales, seed_client_and_tax)
    response = _post(client_fixture, quotation["id"], "request-changes", sales, {"reason": "Quiero editar"})
    assert response.status_code == 403


def test_edit_rules_by_status(client_fixture, auth_header_director, seed_client_and_tax):
    quotation = _pending(client_fixture, auth_header_director, seed_client_and_tax)
    url = f"{QUOTATIONS}/{quotation['id']}"
    assert client_fixture.patch(url, headers=auth_header_director, json={"notes": "x"}).status_code == 422
    _post(client_fixture, quotation["id"], "authorize", auth_header_director, authorize_payload())
    assert client_fixture.patch(url, headers=auth_header_director, json={"notes": "Entrega en obra"}).status_code == 200
    blocked = client_fixture.patch(url, headers=auth_header_director, json={"items": default_items(price=1.0)})
    assert blocked.status_code == 422
    unlocked = _post(client_fixture, quotation["id"], "request-changes", auth_header_director,
                     {"reason": "Cliente pidió otra cubierta"})
    assert unlocked.json()["status"] == "CHANGES_REQUESTED"


def test_replaced_items_are_cancelled_not_deleted(client_fixture, auth_header_director, seed_client_and_tax,
                                                  session_fixture):
    quotation = create_quotation(client_fixture, auth_header_director, seed_client_and_tax[0].id, seed_client_and_tax[1].id)
    client_fixture.patch(f"{QUOTATIONS}/{quotation['id']}", headers=auth_header_director,
                         json={"items": default_items(price=12000.0)})
    rows = session_fixture.exec(select(QuotationItem).where(QuotationItem.quotation_id == quotation["id"])).all()
    assert sorted(r.is_cancelled for r in rows) == [False, True]
    detail = client_fixture.get(f"{QUOTATIONS}/{quotation['id']}", headers=auth_header_director).json()
    assert [i["unit_price"] for i in detail["items"]] == [12000.0]


def test_lost_and_cancel_require_reason(client_fixture, auth_header_director, seed_client_and_tax):
    seed = seed_client_and_tax
    authorized = authorized_quotation(client_fixture, auth_header_director, seed[0].id, seed[1].id)
    assert _post(client_fixture, authorized["id"], "mark-lost", auth_header_director, {"reason": ""}).status_code == 422
    lost = _post(client_fixture, authorized["id"], "mark-lost", auth_header_director, {"reason": "Eligió otro proveedor"})
    assert lost.json()["status"] == "LOST" and lost.json()["lost_reason"] == "Eligió otro proveedor"
    draft = create_quotation(client_fixture, auth_header_director, seed[0].id, seed[1].id)
    assert _post(client_fixture, draft["id"], "cancel", auth_header_director, {"cancel_reason": ""}).status_code == 422
    cancelled = _post(client_fixture, draft["id"], "cancel", auth_header_director, {"cancel_reason": "Duplicada"})
    assert cancelled.json()["status"] == "CANCELLED"
    assert _post(client_fixture, lost.json()["id"], "cancel", auth_header_director,
                 {"cancel_reason": "x"}).status_code == 422


def test_convert_requires_authorized_and_client_po(client_fixture, auth_header_director, seed_client_and_tax):
    seed = seed_client_and_tax
    draft = create_quotation(client_fixture, auth_header_director, seed[0].id, seed[1].id)
    assert _post(client_fixture, draft["id"], "convert", auth_header_director, PO).status_code == 422
    authorized = authorized_quotation(client_fixture, auth_header_director, seed[0].id, seed[1].id)
    no_folio = _post(client_fixture, authorized["id"], "convert", auth_header_director,
                     {"client_po_folio": "", "client_po_date": PO["client_po_date"]})
    assert no_folio.status_code == 422
    assert _post(client_fixture, authorized["id"], "convert", auth_header_director, PO).status_code == 200


def _recipe_item(session) -> dict:
    material = Material(sku="DRIFT-1", name="Tablero drift", category="TABLERO", production_route="MATERIAL",
                        purchase_unit="Hoja", usage_unit="Hoja", current_cost=100.0)
    master = ProductMaster(name="Cocina drift")
    session.add(material)
    session.add(master)
    session.commit()
    version = ProductVersion(master_id=master.id, version_name="V1", status="READY")
    session.add(version)
    session.commit()
    session.add(VersionComponent(version_id=version.id, material_id=material.id, quantity=10))
    session.commit()
    return {"product_name": "Cocina drift", "origin_version_id": version.id, "quantity": 1, "unit_price": 3000.0,
            "cost_snapshot": {}, "frozen_unit_cost": 0.0}


def test_cost_drift_blocks_conversion(client_fixture, auth_header_director, seed_client_and_tax, session_fixture):
    item = _recipe_item(session_fixture)
    quotation = authorized_quotation(client_fixture, auth_header_director, seed_client_and_tax[0].id,
                                     seed_client_and_tax[1].id, items=[item])
    assert quotation["items"][0]["frozen_unit_cost"] == 1000.0
    material = session_fixture.exec(select(Material).where(Material.sku == "DRIFT-1")).first()
    material.current_cost = 150.0
    session_fixture.add(material)
    session_fixture.commit()
    response = _post(client_fixture, quotation["id"], "convert", auth_header_director, PO)
    assert response.status_code == 409 and "SEMÁFORO ROJO" in response.json()["detail"]
    detail = client_fixture.get(f"{QUOTATIONS}/{quotation['id']}", headers=auth_header_director).json()
    assert detail["status"] == "CHANGES_REQUESTED" and detail["sales_order_id"] is None
    assert session_fixture.exec(select(SalesOrder)).all() == []


def test_expired_validity_and_renewal(client_fixture, auth_header_director, seed_client_and_tax, session_fixture):
    quotation = authorized_quotation(client_fixture, auth_header_director, seed_client_and_tax[0].id,
                                     seed_client_and_tax[1].id)
    row = session_fixture.get(Quotation, quotation["id"])
    row.valid_until = datetime.utcnow() - timedelta(days=3)
    session_fixture.add(row)
    session_fixture.commit()
    listing = client_fixture.get(f"{QUOTATIONS}/", headers=auth_header_director).json()
    assert [q["status"] for q in listing] == ["EXPIRED"]
    assert _post(client_fixture, quotation["id"], "convert", auth_header_director, PO).status_code == 422
    past = {"valid_until": (datetime.utcnow() - timedelta(days=2)).isoformat()}
    assert _post(client_fixture, quotation["id"], "renew", auth_header_director, past).status_code == 422
    future = {"valid_until": (datetime.utcnow() + timedelta(days=15)).isoformat()}
    renewed = _post(client_fixture, quotation["id"], "renew", auth_header_director, future)
    assert renewed.status_code == 200 and renewed.json()["status"] == "DRAFT"


def test_seller_sees_only_own_quotations(client_fixture, auth_header_director, seed_client_and_tax, session_fixture):
    quotation = create_quotation(client_fixture, auth_header_director, seed_client_and_tax[0].id, seed_client_and_tax[1].id)
    sales = _sales_headers(session_fixture)
    assert client_fixture.get(f"{QUOTATIONS}/{quotation['id']}", headers=sales).status_code == 403
    assert client_fixture.get(f"{QUOTATIONS}/", headers=sales).json() == []
    assert QuotationStatus.PENDING_AUTH.value == "PENDING_AUTH"


def test_pdf_requires_auth_and_prints(client_fixture, auth_header_director, seed_client_and_tax):
    quotation = create_quotation(client_fixture, auth_header_director, seed_client_and_tax[0].id, seed_client_and_tax[1].id)
    url = f"{QUOTATIONS}/{quotation['id']}/pdf"
    assert client_fixture.get(url).status_code == 401
    response = client_fixture.get(url, headers=auth_header_director)
    assert response.status_code == 200 and response.headers["content-type"] == "application/pdf"
