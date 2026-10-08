"""Line changes on a sales order require an editor role and, for sellers, ownership of the order."""
from sqlmodel import select

from app.core.security import create_access_token, get_password_hash
from app.models.sales import SalesOrder
from app.models.users import User, UserRole
from tests.conftest import TEST_SALES_EMAIL
from tests.sales_helpers import ORDERS, create_order_via_quotation

RESALE_LINE = {"product_name": "Parrilla", "quantity": 1, "unit_price": 3000.0,
               "cost_snapshot": {}, "frozen_unit_cost": 1500.0, "is_resale": True}


def _headers(user: User) -> dict:
    token = create_access_token(subject=user.email, user_id=user.id, user_role=user.role.value)
    return {"Authorization": f"Bearer {token}"}


def _user(session, role: UserRole, email: str) -> User:
    user = User(email=email, full_name=email, hashed_password=get_password_hash("Pass123!"), role=role, is_active=True)
    session.add(user)
    session.commit()
    session.refresh(user)
    return user


def _order_with_resale(client, headers, seed) -> tuple[dict, int, int, int]:
    order = create_order_via_quotation(client, headers, seed[0].id, seed[1].id)
    response = client.post(f"{ORDERS}/{order['id']}/add-items", headers=headers, json={"items": [RESALE_LINE]})
    assert response.status_code == 200, response.text
    items = response.json()["items"]
    production = next(i for i in items if not i["is_resale"])
    resale = next(i for i in items if i["is_resale"])
    return order, production["id"], production["instances"][0]["id"], resale["id"]


def _calls(order_id: int, production_id: int, instance_id: int, resale_id: int) -> list[tuple[str, str, dict | None]]:
    base = f"{ORDERS}/{order_id}/items"
    return [
        ("post", f"{base}/{production_id}/add-instance", None),
        ("patch", f"{base}/{production_id}/production", {"unit_price": 11000.0}),
        ("patch", f"{base}/{resale_id}/resale", {"unit_price": 3500.0}),
        ("delete", f"{base}/{production_id}/instances/{instance_id}", None),
        ("delete", f"{base}/{resale_id}/resale", None),
    ]


def _send(client, method: str, url: str, headers: dict | None, body: dict | None):
    if body is None:
        return getattr(client, method)(url, headers=headers or {})
    return getattr(client, method)(url, headers=headers or {}, json=body)


def test_line_changes_reject_anonymous_users(client_fixture, auth_header_director, seed_client_and_tax):
    ids = _order_with_resale(client_fixture, auth_header_director, seed_client_and_tax)
    for method, url, body in _calls(ids[0]["id"], *ids[1:]):
        assert _send(client_fixture, method, url, None, body).status_code == 401, url


def test_line_changes_reject_roles_outside_sales(client_fixture, session_fixture, auth_header_director,
                                                 seed_client_and_tax):
    ids = _order_with_resale(client_fixture, auth_header_director, seed_client_and_tax)
    headers = _headers(_user(session_fixture, UserRole.WAREHOUSE, "warehouse@lines.local"))
    for method, url, body in _calls(ids[0]["id"], *ids[1:]):
        assert _send(client_fixture, method, url, headers, body).status_code == 403, url


def test_seller_cannot_change_lines_of_another_sellers_order(client_fixture, session_fixture,
                                                             auth_header_director, seed_client_and_tax):
    ids = _order_with_resale(client_fixture, auth_header_director, seed_client_and_tax)
    headers = _headers(_user(session_fixture, UserRole.SALES, "other.seller@lines.local"))
    for method, url, body in _calls(ids[0]["id"], *ids[1:]):
        assert _send(client_fixture, method, url, headers, body).status_code == 403, url


def test_owner_seller_and_director_can_change_lines(client_fixture, session_fixture, auth_header_director,
                                                    seed_client_and_tax):
    order, production_id, instance_id, resale_id = _order_with_resale(
        client_fixture, auth_header_director, seed_client_and_tax)
    seller = session_fixture.exec(select(User).where(User.email == TEST_SALES_EMAIL)).first()
    db_order = session_fixture.get(SalesOrder, order["id"])
    db_order.user_id = seller.id
    session_fixture.add(db_order)
    session_fixture.commit()

    calls = _calls(order["id"], production_id, instance_id, resale_id)
    for method, url, body in calls[:3]:
        assert _send(client_fixture, method, url, _headers(seller), body).status_code == 200, url
    for method, url, body in calls[3:]:
        assert _send(client_fixture, method, url, auth_header_director, body).status_code == 200, url
