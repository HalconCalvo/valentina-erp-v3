"""Single margin definitions: sobreprecio % (sets the price) and margen neto % sobre venta (analysis)."""
from sqlmodel import select

from app.core.config import settings
from app.core.security import create_access_token, get_password_hash
from app.models.foundations import GlobalConfig
from app.models.sales import SalesOrder, SalesOrderStatus
from app.models.users import User, UserRole
from app.services import analytics_service, margin_service, sales_service
from tests.sales_helpers import QUOTATIONS, create_order_via_quotation, quotation_payload

CONFIG = f"{settings.API_V1_STR}/foundations/config"


def _headers(user: User) -> dict:
    token = create_access_token(subject=user.email, user_id=user.id, user_role=user.role.value)
    return {"Authorization": f"Bearer {token}"}


def test_formulas():
    assert margin_service.markup_percent(10500, 5000, 0.05) == 100.0
    assert margin_service.markup_percent(10500, 5000, 5) == 100.0
    assert margin_service.markup_percent(100, 0, 0.05) is None
    assert margin_service.net_margin_percent(10500, 5000, 500) == round(5000 / 10500 * 100, 2)
    assert margin_service.net_margin_percent(0, 1, 0) is None


def test_quotation_stores_real_markup_without_commission(client_fixture, auth_header_director, seed_client_and_tax):
    payload = quotation_payload(seed_client_and_tax[0].id, seed_client_and_tax[1].id,
                                [{"product_name": "Cocina", "quantity": 2, "unit_price": 10500.0,
                                  "cost_snapshot": {}, "frozen_unit_cost": 5000.0}])
    payload["applied_commission_percent"] = 5
    payload["applied_margin_percent"] = 0.45
    response = client_fixture.post(f"{QUOTATIONS}/", headers=auth_header_director, json=payload)
    assert response.status_code == 201, response.text
    quotation = response.json()
    assert quotation["applied_margin_percent"] == 100.0
    assert round(quotation["commission_amount"], 2) == 1000.0


def test_profitability_is_after_commission_and_without_tax(client_fixture, session_fixture, auth_header_director,
                                                           seed_client_and_tax):
    order = create_order_via_quotation(client_fixture, auth_header_director, seed_client_and_tax[0].id,
                                       seed_client_and_tax[1].id)
    db_order = session_fixture.get(SalesOrder, order["id"])
    db_order.status = SalesOrderStatus.SOLD
    db_order.commission_amount = 500.0
    session_fixture.add(db_order)
    session_fixture.commit()
    row = next(r for r in analytics_service.get_order_profitability(session_fixture) if r.order_id == order["id"])
    assert row.total_price == 10000.0 and row.estimated_cost == 5000.0
    assert row.net_profit == 4500.0 and row.margin_percent == 45.0


def test_provisional_commission_base_has_no_tax(client_fixture, session_fixture, auth_header_director,
                                                seed_client_and_tax):
    order = create_order_via_quotation(client_fixture, auth_header_director, seed_client_and_tax[0].id,
                                       seed_client_and_tax[1].id)
    db_order = session_fixture.get(SalesOrder, order["id"])
    db_order.applied_commission_percent = 0.05
    session_fixture.add(db_order)
    session_fixture.commit()
    rows = sales_service.get_commissions_overview(session_fixture).retained
    row = next(r for r in rows if r.sales_order_id == order["id"])
    assert row.amount == 500.0  # 10,000 without tax × 5 %, not the 11,600 with tax


def test_only_director_changes_minimum_markup(client_fixture, session_fixture, auth_header_director):
    session_fixture.add(GlobalConfig(company_name="Test", target_profit_margin=0.45, cost_tolerance_percent=0.03,
                                     quote_validity_days=15, default_edgebanding_factor=1.1))
    session_fixture.commit()
    manager = User(email="mgr@margins.local", full_name="Mgr", hashed_password=get_password_hash("Pass123!"),
                   role=UserRole.MANAGER, is_active=True)
    session_fixture.add(manager)
    session_fixture.commit()
    session_fixture.refresh(manager)
    body = {"company_name": "Test", "target_profit_margin": 0.45, "cost_tolerance_percent": 0.03,
            "quote_validity_days": 15, "default_edgebanding_factor": 1.1}
    assert client_fixture.put(CONFIG, headers=_headers(manager), json={**body, "min_markup_percent": 20}).status_code == 403
    assert client_fixture.put(CONFIG, headers=_headers(manager), json={**body, "min_markup_percent": 25}).status_code == 200
    response = client_fixture.put(CONFIG, headers=auth_header_director, json={**body, "min_markup_percent": 30})
    assert response.status_code == 200 and response.json()["min_markup_percent"] == 30
