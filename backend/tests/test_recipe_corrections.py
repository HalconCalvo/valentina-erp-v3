"""F3: recipe and material price corrections when authorizing, recipe immutability and catalog security."""
from sqlmodel import select

from app.core.config import settings
from app.core.security import create_access_token, get_password_hash
from app.models.audit import AuditFieldChange
from app.models.design import ProductMaster, ProductVersion, VersionComponent
from app.models.material import Material
from app.models.sales import Quotation, QuotationItem, SalesOrderItem
from app.models.users import User, UserRole
from app.services import recipe_cost_service
from app.services.cost_engine import CostEngine
from tests.sales_helpers import ORDERS, QUOTATIONS, create_order_via_quotation, create_quotation

DESIGN = f"{settings.API_V1_STR}/design"
FOUNDATIONS = f"{settings.API_V1_STR}/foundations"


def _headers(user: User) -> dict:
    token = create_access_token(subject=user.email, user_id=user.id, user_role=user.role.value)
    return {"Authorization": f"Bearer {token}"}


def _user(session, role: UserRole, email: str) -> User:
    user = User(email=email, full_name=email, hashed_password=get_password_hash("Pass123!"), role=role, is_active=True)
    session.add(user)
    session.commit()
    session.refresh(user)
    return user


def _material(session, sku: str, cost: float, factor: float = 1.0, category: str = "TABLERO") -> Material:
    material = Material(sku=sku, name=f"Mat {sku}", category=category, production_route="MATERIAL",
                        purchase_unit="Hoja", usage_unit="Hoja", conversion_factor=factor, current_cost=cost)
    session.add(material)
    session.commit()
    session.refresh(material)
    return material


def _recipe(session, client_id: int, components: list) -> ProductVersion:
    master = ProductMaster(name="Cocina F3", client_id=client_id)
    session.add(master)
    session.commit()
    version = ProductVersion(master_id=master.id, version_name="V1.0", status="READY")
    session.add(version)
    session.commit()
    for material, quantity in components:
        session.add(VersionComponent(version_id=version.id, material_id=material.id, quantity=quantity))
    session.commit()
    session.refresh(version)
    return version


def _line(version: ProductVersion, price: float = 5000.0) -> dict:
    return {"product_name": "Cocina F3", "origin_version_id": version.id, "quantity": 1, "unit_price": price,
            "cost_snapshot": {}, "frozen_unit_cost": 0.0}


def _authorize(client, headers, quotation_id, items, corrections=None, prices=None):
    body = {"items": items, "applied_margin_percent": 40, "applied_commission_percent": 0, "advance_percent": 60,
            "recipe_corrections": corrections or [], "material_prices": prices or []}
    return client.post(f"{QUOTATIONS}/{quotation_id}/authorize", headers=headers, json=body)


def _pending(client, headers, seed, items) -> dict:
    quotation = create_quotation(client, headers, seed[0].id, seed[1].id, items)
    assert client.post(f"{QUOTATIONS}/{quotation['id']}/request-auth", headers=headers).status_code == 200
    return quotation


def test_director_corrects_recipe_and_price_when_authorizing(client_fixture, session_fixture, auth_header_director,
                                                             seed_client_and_tax):
    board = _material(session_fixture, "F3-MDF", 1000.0)
    hinge = _material(session_fixture, "F3-BIS", 100.0, category="HERRAJE")
    version = _recipe(session_fixture, seed_client_and_tax[0].id, [(board, 2), (hinge, 4)])
    quotation = _pending(client_fixture, auth_header_director, seed_client_and_tax, [_line(version)])
    corrections = [{"origin_version_id": version.id, "reason": "Faltaba media hoja",
                    "components": [{"material_id": board.id, "quantity": 2.5}, {"material_id": hinge.id, "quantity": 4}]}]
    prices = [{"material_id": hinge.id, "current_cost": 120.0, "reason": "Precio nuevo del proveedor"}]

    response = _authorize(client_fixture, auth_header_director, quotation["id"], [_line(version)], corrections, prices)
    assert response.status_code == 200, response.text
    authorized = response.json()
    session_fixture.expire_all()
    new_version = session_fixture.exec(select(ProductVersion).where(ProductVersion.replaces_version_id == version.id)).one()
    assert new_version.status == "READY" and new_version.corrected_in_quotation_id == quotation["id"]
    assert session_fixture.get(ProductVersion, version.id).status == "OBSOLETE"
    old_components = sorted(c.quantity for c in session_fixture.exec(
        select(VersionComponent).where(VersionComponent.version_id == version.id)).all())
    assert old_components == [2, 4]
    item = authorized["items"][0]
    assert item["origin_version_id"] == new_version.id
    assert item["frozen_unit_cost"] == 2980.0 and item["unit_price"] == 5000.0
    assert session_fixture.get(Material, hinge.id).current_cost == 120.0
    price_log = session_fixture.exec(select(AuditFieldChange).where(
        AuditFieldChange.table_name == "materials", AuditFieldChange.field_name == "current_cost")).all()
    assert price_log and quotation["folio"] in price_log[-1].reason and "proveedor" in price_log[-1].reason
    assert "Recetas corregidas" in authorized["director_notes"]


def test_corrections_need_reason_and_a_recipe_of_the_quotation(client_fixture, session_fixture,
                                                               auth_header_director, seed_client_and_tax):
    board = _material(session_fixture, "F3-R1", 500.0)
    version = _recipe(session_fixture, seed_client_and_tax[0].id, [(board, 1)])
    other = _recipe(session_fixture, seed_client_and_tax[0].id, [(board, 3)])
    quotation = _pending(client_fixture, auth_header_director, seed_client_and_tax, [_line(version)])
    blank = [{"origin_version_id": version.id, "reason": "   ", "components": [{"material_id": board.id, "quantity": 2}]}]
    assert _authorize(client_fixture, auth_header_director, quotation["id"], [_line(version)], blank).status_code == 422
    foreign = [{"origin_version_id": other.id, "reason": "x", "components": [{"material_id": board.id, "quantity": 2}]}]
    assert _authorize(client_fixture, auth_header_director, quotation["id"], [_line(version)], foreign).status_code == 422
    manager = _user(session_fixture, UserRole.MANAGER, "manager@f3.local")
    ok = [{"origin_version_id": version.id, "reason": "x", "components": [{"material_id": board.id, "quantity": 2}]}]
    assert _authorize(client_fixture, _headers(manager), quotation["id"], [_line(version)], ok).status_code == 403
    session_fixture.expire_all()
    assert session_fixture.get(ProductVersion, version.id).status == "READY"


def test_sold_orders_keep_their_recipe(client_fixture, session_fixture, auth_header_director, seed_client_and_tax):
    board = _material(session_fixture, "F3-OV", 1000.0)
    version = _recipe(session_fixture, seed_client_and_tax[0].id, [(board, 2)])
    order = create_order_via_quotation(client_fixture, auth_header_director, seed_client_and_tax[0].id,
                                       seed_client_and_tax[1].id, [_line(version)])
    quotation = _pending(client_fixture, auth_header_director, seed_client_and_tax, [_line(version)])
    corrections = [{"origin_version_id": version.id, "reason": "Corrección", "components": [
        {"material_id": board.id, "quantity": 3}]}]
    assert _authorize(client_fixture, auth_header_director, quotation["id"], [_line(version)], corrections).status_code == 200
    session_fixture.expire_all()
    order_item = session_fixture.get(SalesOrderItem, order["items"][0]["id"])
    assert order_item.origin_version_id == version.id and order_item.frozen_unit_cost == 2000.0
    assert [c.quantity for c in session_fixture.exec(
        select(VersionComponent).where(VersionComponent.version_id == version.id)).all()] == [2]


def _version_body(version: ProductVersion, components: list, status: str = "READY", name: str = "V1.0") -> dict:
    return {"master_id": version.master_id, "version_name": name, "status": status,
            "components": [{"material_id": m.id, "quantity": q} for m, q in components]}


def test_used_recipe_is_immutable_and_clone_copies_the_viewed_version(client_fixture, session_fixture,
                                                                      auth_header_director, seed_client_and_tax):
    board = _material(session_fixture, "F3-LOCK", 100.0)
    used = _recipe(session_fixture, seed_client_and_tax[0].id, [(board, 1)])
    create_order_via_quotation(client_fixture, auth_header_director, seed_client_and_tax[0].id,
                               seed_client_and_tax[1].id, [_line(used)])
    url = f"{DESIGN}/versions/{used.id}"
    assert client_fixture.put(url, headers=auth_header_director, json=_version_body(used, [(board, 5)])).status_code == 409
    renamed = client_fixture.put(url, headers=auth_header_director, json=_version_body(used, [(board, 1)], name="V1.0 final"))
    assert renamed.status_code == 200 and renamed.json()["version_name"] == "V1.0 final"
    assert client_fixture.patch(f"{url}/status", headers=auth_header_director, params={"status": "DRAFT"}).status_code == 409
    assert client_fixture.delete(url, headers=auth_header_director).status_code == 409
    assert client_fixture.get(url, headers=auth_header_director).json()["is_locked"] is True

    second = ProductVersion(master_id=used.master_id, version_name="V2", status="DRAFT")
    session_fixture.add(second)
    session_fixture.commit()
    session_fixture.add(VersionComponent(version_id=second.id, material_id=board.id, quantity=7))
    session_fixture.commit()
    clone = client_fixture.post(f"{DESIGN}/versions", headers=auth_header_director, json={
        "master_id": used.master_id, "version_name": "V3", "status": "DRAFT", "components": [],
        "clone_from_version_id": second.id})
    assert clone.status_code == 200, clone.text
    assert [c["quantity"] for c in clone.json()["components"]] == [7]
    free = client_fixture.put(f"{DESIGN}/versions/{second.id}", headers=auth_header_director,
                              json=_version_body(second, [(board, 8)], status="DRAFT", name="V2"))
    assert free.status_code == 200 and free.json()["estimated_cost"] == 800.0


def test_recipe_editing_roles(client_fixture, session_fixture, auth_header_director, seed_client_and_tax):
    board = _material(session_fixture, "F3-ROLE", 100.0)
    version = _recipe(session_fixture, seed_client_and_tax[0].id, [(board, 1)])
    body = _version_body(version, [(board, 2)], status="DRAFT")
    url = f"{DESIGN}/versions/{version.id}"
    assert client_fixture.put(url, json=body).status_code == 401
    sales = _headers(_user(session_fixture, UserRole.SALES, "sales@f3.local"))
    assert client_fixture.put(url, headers=sales, json=body).status_code == 403
    assert client_fixture.patch(f"{url}/blueprint", json={"blueprint_path": "x"}).status_code == 401
    assert client_fixture.patch(f"{url}/blueprint", headers=sales, json={"blueprint_path": "x"}).status_code == 403
    design = _headers(_user(session_fixture, UserRole.DESIGN, "design@f3.local"))
    assert client_fixture.put(url, headers=design, json=body).status_code == 200


def test_material_catalog_roles(client_fixture, session_fixture, auth_header_director):
    board = _material(session_fixture, "F3-CAT", 100.0)
    url = f"{FOUNDATIONS}/materials/{board.id}"
    assert client_fixture.put(url, json={"name": "x"}).status_code == 401
    warehouse = _headers(_user(session_fixture, UserRole.WAREHOUSE, "wh@f3.local"))
    assert client_fixture.put(url, headers=warehouse, json={"sku": "F3-CAT", "name": "Tablero nuevo nombre"}).status_code == 200
    assert client_fixture.put(url, headers=warehouse, json={"sku": "F3-CAT", "name": "x", "current_cost": 150}).status_code == 403
    sales = _headers(_user(session_fixture, UserRole.SALES, "sales2@f3.local"))
    assert client_fixture.put(url, headers=sales, json={"sku": "F3-CAT", "name": "y"}).status_code == 403
    admin = _headers(_user(session_fixture, UserRole.ADMIN, "admin@f3.local"))
    response = client_fixture.put(url, headers=admin, params={"reason": "Lista de precios octubre"},
                                  json={"sku": "F3-CAT", "name": "Tablero nuevo nombre", "current_cost": 150})
    assert response.status_code == 200 and response.json()["current_cost"] == 150
    row = session_fixture.exec(select(AuditFieldChange).where(
        AuditFieldChange.table_name == "materials", AuditFieldChange.field_name == "current_cost")).all()[-1]
    assert row.reason == "Lista de precios octubre"
    new = {"sku": "F3-NEW", "name": "Nuevo", "category": "TABLERO", "purchase_unit": "Hoja", "usage_unit": "Hoja",
           "current_cost": 10}
    assert client_fixture.post(f"{FOUNDATIONS}/materials", headers=warehouse, json=new).status_code == 403


def test_catalog_endpoints_need_session_and_role(client_fixture, session_fixture):
    assert client_fixture.get(f"{FOUNDATIONS}/clients").status_code == 401
    assert client_fixture.get(f"{FOUNDATIONS}/materials").status_code == 401
    assert client_fixture.post(f"{FOUNDATIONS}/tax-rates", json={"name": "X", "rate": 0.1}).status_code == 401
    sales = _headers(_user(session_fixture, UserRole.SALES, "sales3@f3.local"))
    assert client_fixture.post(f"{FOUNDATIONS}/providers", headers=sales, json={"business_name": "P"}).status_code == 403
    assert client_fixture.post(f"{FOUNDATIONS}/tax-rates", headers=sales, json={"name": "X", "rate": 0.1}).status_code == 403
    assert client_fixture.put(f"{FOUNDATIONS}/config", headers=sales, json={}).status_code == 403
    created = client_fixture.post(f"{FOUNDATIONS}/clients", headers=sales, json={"full_name": "Cliente F3", "email": "f3@cliente.local", "phone": "5550000000"})
    assert created.status_code == 200, created.text
    reception = client_fixture.post(f"{settings.API_V1_STR}/inventory/reception", headers=sales, json={
        "provider_id": 1, "invoice_number": "F", "invoice_date": "2026-10-09T00:00:00", "total_amount": 1, "items": []})
    assert reception.status_code == 403


def test_single_recipe_cost_rule(client_fixture, session_fixture, auth_header_director, seed_client_and_tax):
    screw = _material(session_fixture, "F3-TOR", 169.35, factor=1000, category="HERRAJE")
    board = _material(session_fixture, "F3-TAB", 1234.567)
    version = _recipe(session_fixture, seed_client_and_tax[0].id, [(screw, 37), (board, 1.25)])
    expected = round(37 * 169.35 / 1000 + 1.25 * 1234.567, 2)
    catalog = client_fixture.get(f"{DESIGN}/versions/{version.id}", headers=auth_header_director).json()
    assert catalog["estimated_cost"] == expected
    quotation = create_quotation(client_fixture, auth_header_director, seed_client_and_tax[0].id,
                                 seed_client_and_tax[1].id, [_line(version)])
    assert quotation["items"][0]["frozen_unit_cost"] == expected
    item = session_fixture.exec(select(QuotationItem).where(QuotationItem.quotation_id == quotation["id"])).first()
    assert CostEngine.analyze_items_drift(session_fixture, [item])["variation_percent"] == 0
    assert recipe_cost_service.version_cost(session_fixture, version.id).total == expected


def test_order_list_exposes_only_seller_id_and_name(client_fixture, auth_header_director, seed_client_and_tax):
    create_order_via_quotation(client_fixture, auth_header_director, seed_client_and_tax[0].id, seed_client_and_tax[1].id)
    rows = client_fixture.get(ORDERS, headers=auth_header_director).json()
    assert rows and set(rows[0]["user"].keys()) == {"id", "full_name"}


def test_open_quotations_see_the_corrected_recipe(client_fixture, session_fixture, auth_header_director,
                                                  seed_client_and_tax):
    board = _material(session_fixture, "F3-OPEN", 1000.0)
    version = _recipe(session_fixture, seed_client_and_tax[0].id, [(board, 2)])
    draft = create_quotation(client_fixture, auth_header_director, seed_client_and_tax[0].id,
                             seed_client_and_tax[1].id, [_line(version)])
    quotation = _pending(client_fixture, auth_header_director, seed_client_and_tax, [_line(version)])
    corrections = [{"origin_version_id": version.id, "reason": "Corrección",
                    "components": [{"material_id": board.id, "quantity": 3}]}]
    assert _authorize(client_fixture, auth_header_director, quotation["id"], [_line(version)], corrections).status_code == 200

    line = client_fixture.get(f"{QUOTATIONS}/{draft['id']}", headers=auth_header_director).json()["items"][0]
    assert line["recipe_obsolete"] is True and line["replacement_version_id"] not in (None, version.id)
    refreshed = dict(_line(version), origin_version_id=line["replacement_version_id"])
    updated = client_fixture.patch(f"{QUOTATIONS}/{draft['id']}", headers=auth_header_director, json={"items": [refreshed]})
    assert updated.status_code == 200
    item = updated.json()["items"][0]
    assert item["recipe_obsolete"] is False and item["frozen_unit_cost"] == 3000.0 and item["unit_price"] == 5000.0
