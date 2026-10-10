"""D13: the seller (SALES) only sees sale prices, never costs or margins; the server prices for them."""
from fastapi.routing import APIRoute
from sqlmodel import select

from app.core.config import settings
from app.core.cost_visibility import COST_FIELDS, blank_costs
from app.core.security import create_access_token
from app.main import app
from app.models.design import ProductMaster, ProductVersion, VersionComponent
from app.models.foundations import Client, GlobalConfig, TaxRate
from app.models.material import Material
from app.models.sales import QuotationItem
from app.models.users import User
from tests.conftest import TEST_SALES_EMAIL
from tests.sales_helpers import QUOTATIONS, create_quotation, quotation_payload

API = settings.API_V1_STR


def _sales(session, commission: float = 0.05) -> tuple[User, dict]:
    user = session.exec(select(User).where(User.email == TEST_SALES_EMAIL)).first()
    user.commission_rate = commission
    session.add(user)
    session.commit()
    token = create_access_token(subject=user.email, user_id=user.id, user_role=user.role.value)
    return user, {"Authorization": f"Bearer {token}"}


def _catalog(session) -> dict:
    session.add(GlobalConfig(company_name="K", target_profit_margin=0.45, cost_tolerance_percent=0.03,
                             quote_validity_days=15, default_edgebanding_factor=1.1))
    material = Material(sku="D13-TAB", name="Tablero D13", category="TABLERO", production_route="MATERIAL",
                        purchase_unit="Hoja", usage_unit="Hoja", current_cost=100.0)
    resale = Material(sku="D13-TARJA", name="Tarja D13", category="ACCESORIO", production_route="MATERIAL",
                      purchase_unit="Pza", usage_unit="Pza", current_cost=800.0, is_resale=True)
    master = ProductMaster(name="Cocina D13", client_id=session.exec(select(Client)).first().id)
    session.add_all([material, resale, master])
    session.commit()
    version = ProductVersion(master_id=master.id, version_name="V1", status="READY")
    session.add(version)
    session.commit()
    session.add(VersionComponent(version_id=version.id, material_id=material.id, quantity=10))
    session.commit()
    return {"version_id": version.id, "master_id": master.id}


def _non_null_costs(data, path="") -> list[str]:
    found = []
    if isinstance(data, dict):
        for key, value in data.items():
            if key in COST_FIELDS and value not in (None, {}, []):
                found.append(f"{path}.{key}")
            found += _non_null_costs(value, f"{path}.{key}")
    elif isinstance(data, list):
        for value in data:
            found += _non_null_costs(value, f"{path}[]")
    return found


def test_blank_costs_is_recursive():
    data = {"total_price": 10, "items": [{"unit_price": 5, "frozen_unit_cost": 3, "cost_snapshot": {"a": 1}}],
            "config": {"min_markup_percent": 25}}
    assert blank_costs(data) == {"total_price": 10, "items": [{"unit_price": 5, "frozen_unit_cost": None,
                                 "cost_snapshot": None}], "config": {"min_markup_percent": None}}


def test_seller_sees_prices_without_costs_director_sees_both(client_fixture, session_fixture, seed_client_and_tax,
                                                             auth_header_director):
    catalog = _catalog(session_fixture)
    _, sales = _sales(session_fixture)
    item = {"product_name": "Cocina D13", "origin_version_id": catalog["version_id"], "quantity": 1,
            "unit_price": 2000.0}
    quotation = create_quotation(client_fixture, sales, seed_client_and_tax[0].id, seed_client_and_tax[1].id, [item])
    assert quotation["items"][0]["unit_price"] == 2000.0
    assert quotation["items"][0]["frozen_unit_cost"] is None and quotation["applied_margin_percent"] is None
    seen = client_fixture.get(f"{QUOTATIONS}/{quotation['id']}", headers=sales).json()
    assert _non_null_costs(seen) == [] and seen["total_price"] > 0
    director = client_fixture.get(f"{QUOTATIONS}/{quotation['id']}", headers=auth_header_director).json()
    assert director["items"][0]["frozen_unit_cost"] == 1000.0
    assert director["applied_margin_percent"] is not None


def test_catalog_materials_and_config_hide_costs_for_seller(client_fixture, session_fixture, auth_header_director):
    catalog = _catalog(session_fixture)
    _, sales = _sales(session_fixture)
    for path in ("/design/masters", f"/design/masters/{catalog['master_id']}",
                 f"/design/versions/{catalog['version_id']}", "/foundations/materials", "/foundations/config"):
        response = client_fixture.get(f"{API}{path}", headers=sales)
        assert response.status_code == 200, (path, response.text)
        assert _non_null_costs(response.json()) == [], path
    director = client_fixture.get(f"{API}/design/masters", headers=auth_header_director)
    assert director.json()[0]["versions"][0]["components"][0]["current_cost"] == 100.0


def test_every_get_route_the_seller_can_read_has_no_costs(client_fixture, session_fixture, seed_client_and_tax):
    _catalog(session_fixture)
    _, sales = _sales(session_fixture)
    create_quotation(client_fixture, sales, seed_client_and_tax[0].id, seed_client_and_tax[1].id)
    checked = 0
    for route in app.routes:
        if not isinstance(route, APIRoute) or "GET" not in route.methods or "{" in route.path:
            continue
        response = client_fixture.get(route.path, headers=sales)
        if response.status_code != 200 or not response.headers.get("content-type", "").startswith("application/json"):
            continue
        checked += 1
        assert _non_null_costs(response.json()) == [], route.path
    assert checked >= 10


def test_price_suggestion_uses_target_markup_for_seller(client_fixture, session_fixture, auth_header_director,
                                                        seed_client_and_tax):
    catalog = _catalog(session_fixture)
    _, sales = _sales(session_fixture, commission=0.05)
    body = {"tax_rate_id": seed_client_and_tax[1].id, "markup_percent": 0,
            "items": [{"origin_version_id": catalog["version_id"]}, {"resale_sku": "D13-TARJA"}]}
    response = client_fixture.post(f"{QUOTATIONS}/price-suggestions", headers=sales, json=body)
    assert response.status_code == 200, response.text
    # cost 1000 × 1.45 ÷ 0.95 (the seller's markup_percent is ignored); resale 800 × 1.45 ÷ 0.95
    assert [row["unit_price"] for row in response.json()] == [1526.32, 1221.05]
    director = client_fixture.post(f"{QUOTATIONS}/price-suggestions", headers=auth_header_director,
                                   json={**body, "commission_percent": 0, "items": body["items"][:1]})
    assert director.json()[0]["unit_price"] == 1000.0


def test_price_suggestion_zero_rate_adds_material_iva(client_fixture, session_fixture):
    catalog = _catalog(session_fixture)
    zero = TaxRate(name="Tasa Cero", rate=0.0, is_active=True)
    session_fixture.add(zero)
    session_fixture.commit()
    _, sales = _sales(session_fixture, commission=0.05)
    response = client_fixture.post(f"{QUOTATIONS}/price-suggestions", headers=sales,
                                   json={"tax_rate_id": zero.id, "items": [{"origin_version_id": catalog["version_id"]}]})
    assert response.json()[0]["unit_price"] == 1770.53  # (1000 + 160) × 1.45 ÷ 0.95


def test_seller_cannot_set_costs_and_keeps_existing_ones(client_fixture, session_fixture, seed_client_and_tax):
    _catalog(session_fixture)
    _, sales = _sales(session_fixture)
    lines = [{"product_name": "Instalación especial", "quantity": 1, "unit_price": 500.0, "frozen_unit_cost": 1.0},
             {"product_name": "Tarja D13", "quantity": 2, "unit_price": 1300.0, "is_resale": True,
              "resale_sku": "D13-TARJA", "frozen_unit_cost": 1.0}]
    quotation = create_quotation(client_fixture, sales, seed_client_and_tax[0].id, seed_client_and_tax[1].id, lines)
    rows = {i.product_name: i for i in session_fixture.exec(
        select(QuotationItem).where(QuotationItem.quotation_id == quotation["id"])).all()}
    assert rows["Instalación especial"].frozen_unit_cost == 0.0
    assert rows["Tarja D13"].frozen_unit_cost == 800.0
    manual = rows["Instalación especial"]
    manual.frozen_unit_cost = 300.0  # cost set by the Director in the review
    session_fixture.add(manual)
    session_fixture.commit()
    seen = client_fixture.get(f"{QUOTATIONS}/{quotation['id']}", headers=sales).json()
    resent = [{k: v for k, v in item.items() if k in ("product_name", "quantity", "unit_price", "is_resale",
              "resale_sku", "frozen_unit_cost", "cost_snapshot")} for item in seen["items"]]
    payload = {**quotation_payload(seed_client_and_tax[0].id, seed_client_and_tax[1].id, resent),
               "applied_margin_percent": None}
    response = client_fixture.patch(f"{QUOTATIONS}/{quotation['id']}", headers=sales, json=payload)
    assert response.status_code == 200, response.text
    active = session_fixture.exec(select(QuotationItem).where(
        QuotationItem.quotation_id == quotation["id"], QuotationItem.is_cancelled == False)).all()  # noqa: E712
    assert {i.product_name: i.frozen_unit_cost for i in active} == {"Instalación especial": 300.0, "Tarja D13": 800.0}
