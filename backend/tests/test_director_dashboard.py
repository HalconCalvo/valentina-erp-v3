"""Director dashboard (Gabriel, 2026-10-12): sales of the year without VAT, liquidity with inventory, weighted
Margen neto % sobre venta, receivables that agree with the cash flow, top clients and sales by lane."""
from datetime import datetime

from app.core.config import settings
from app.core.security import create_access_token
from app.models.foundations import GlobalConfig
from app.models.material import Material, ProductionRoute
from app.models.sales import (CustomerPayment, CustomerPaymentInstallment, CXCStatus, PaymentType, SalesOrder,
                              SalesOrderItem, SalesOrderStatus)
from app.models.treasury import BankAccount
from app.models.users import User, UserRole
from app.services import director_dashboard_service as svc

URL = f"{settings.API_V1_STR}/analytics/director-summary"
YEAR = datetime.utcnow().year


def _order(session, client, tax, subtotal, status=SalesOrderStatus.SOLD, sold_on=None, commission=0.0, items=()):
    order = SalesOrder(client_id=client.id, tax_rate_id=tax.id, project_name="Obra", status=status, valid_until=datetime(YEAR, 12, 31),
                       subtotal=subtotal, tax_amount=subtotal * 0.16, total_price=subtotal * 1.16,
                       commission_amount=commission, client_po_date=sold_on or datetime(YEAR, 3, 1))
    session.add(order)
    session.commit()
    for sale, cost, ingredients in items:
        session.add(SalesOrderItem(sales_order_id=order.id, product_name="Cocina", quantity=1, unit_price=sale,
                                   subtotal_price=sale, frozen_unit_cost=cost,
                                   cost_snapshot={"ingredients": ingredients} if ingredients else {}))
    session.commit()
    return order


def _material(session, sku, category):
    material = Material(sku=sku, name=sku, category=category, production_route=ProductionRoute.MATERIAL,
                        purchase_unit="Pz", usage_unit="Pz")
    session.add(material)
    session.commit()
    return material


def _seed(session, seed):
    client, tax = seed
    session.add(GlobalConfig(company_name="K", target_profit_margin=0.45, cost_tolerance_percent=0.03,
                             quote_validity_days=15, default_edgebanding_factor=1.1, annual_sales_target=1000.0))
    session.add(BankAccount(name="Banco", account_number="0001", current_balance=300.0, is_active=True))
    board, stone = _material(session, "MDF", "Tablero"), _material(session, "GRANITO", "Piedra")
    kitchen = [{"material_id": board.id, "sku": "MDF", "line_total": 30.0},
               {"material_id": stone.id, "sku": "GRANITO", "line_total": 10.0}]
    sold = _order(session, client, tax, 100.0, commission=5.0, items=[(100.0, 40.0, kitchen)])
    _order(session, client, tax, 400.0, status=SalesOrderStatus.WAITING_ADVANCE, items=[(400.0, 0.0, None)])
    _order(session, client, tax, 999.0, status=SalesOrderStatus.CANCELLED)
    _order(session, client, tax, 777.0, sold_on=datetime(YEAR - 1, 12, 31))
    cxc = CustomerPayment(sales_order_id=sold.id, payment_type=PaymentType.PROGRESS, amount=116.0,
                          status=CXCStatus.PENDING, invoice_date=datetime(YEAR, 3, 1), created_by_user_id=1)
    session.add(cxc)
    session.commit()
    session.add(CustomerPaymentInstallment(customer_payment_id=cxc.id, amount=16.0, payment_date=datetime(YEAR, 3, 11),
                                           created_by_user_id=1))
    session.commit()
    return sold


def test_summary_cards_agree(client_fixture, session_fixture, auth_header_director, seed_client_and_tax):
    _seed(session_fixture, seed_client_and_tax)
    response = client_fixture.get(URL, headers=auth_header_director)
    assert response.status_code == 200, response.text
    data = response.json()
    # Ventas: sold OVs of the year without VAT (waiting for advance counts; cancelled and last year do not)
    assert (data["sales"]["sales_without_tax"], data["sales"]["orders"], data["sales"]["target_percent"]) == (500.0, 2, 50.0)
    liquidity = data["liquidity"]
    assert liquidity["banks"] == 300.0 and liquidity["receivables"] == 100.0
    assert liquidity["net"] == round(liquidity["banks"] + liquidity["receivables"] + liquidity["inventory"]
                                     - liquidity["payables"], 2)
    assert [line["label"] for line in liquidity["inventory_lines"]] == ["Materia prima", "Producción en proceso",
                                                                       "Producto terminado"]
    # Cartera = the same receivables as Liquidez, and the cash flow projection adds up to them
    assert data["receivables"]["pending"] == liquidity["receivables"] == data["receivables"]["cash_flow_income"]
    # Rentabilidad: only OVs with cost; (100 - 40 - 5) / 100
    profit = data["profitability"]
    assert (profit["net_margin_percent"], profit["orders_without_cost"], profit["sales_without_cost"]) == (55.0, 1, 400.0)
    top = data["top_clients"]
    assert top["by_sales"][0]["sales_without_tax"] == 500.0 and top["by_sales"][0]["net_margin_percent"] == 55.0
    assert top["by_payment_speed"][0]["avg_days_to_collect"] == 10.0
    lanes = {lane["lane"]: lane for lane in top["by_lane"]}
    assert (lanes["MDF"]["sales_without_tax"], lanes["Piedra"]["sales_without_tax"]) == (75.0, 25.0)
    assert lanes["Sin receta"]["net_margin_percent"] is None


def test_only_the_director_sees_the_summary(client_fixture, session_fixture, seed_client_and_tax):
    manager = User(email="mgr@dash.local", full_name="Gerente", role=UserRole.MANAGER, is_active=True,
                   hashed_password="x")
    session_fixture.add(manager)
    session_fixture.commit()
    token = create_access_token(subject=manager.email, user_id=manager.id, user_role="MANAGER")
    assert client_fixture.get(URL, headers={"Authorization": f"Bearer {token}"}).status_code == 403


def test_stone_share_counts_stone_processes():
    item = SalesOrderItem(sales_order_id=1, product_name="x", quantity=1, unit_price=1, cost_snapshot={"ingredients": [
        {"material_id": 1, "sku": "MDF", "line_total": 50.0}, {"material_id": 2, "sku": "INSTALAGRANITO", "line_total": 50.0}]})
    assert svc._stone_share(item, {1: "Tablero", 2: "Proceso"}) == 0.5
    assert svc._stone_share(SalesOrderItem(sales_order_id=1, product_name="x", quantity=1, unit_price=1), {}) is None
