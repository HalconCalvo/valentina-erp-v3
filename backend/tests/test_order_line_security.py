"""Sales order lines only change through change orders; the commercial description is edited directly."""
from sqlmodel import select

from app.core.config import settings
from app.core.security import create_access_token, get_password_hash
from app.models.audit import AuditFieldChange
from app.models.sales import SalesOrder
from app.models.users import User, UserRole
from tests.conftest import TEST_SALES_EMAIL
from tests.sales_helpers import ORDERS, create_order_via_quotation


def _headers(user: User) -> dict:
    token = create_access_token(subject=user.email, user_id=user.id, user_role=user.role.value)
    return {"Authorization": f"Bearer {token}"}


def _user(session, role: UserRole, email: str) -> User:
    user = User(email=email, full_name=email, hashed_password=get_password_hash("Pass123!"), role=role, is_active=True)
    session.add(user)
    session.commit()
    session.refresh(user)
    return user


def _order(client, headers, seed) -> tuple[dict, int, int]:
    order = create_order_via_quotation(client, headers, seed[0].id, seed[1].id)
    item = order["items"][0]
    return order, item["id"], item["instances"][0]["id"]


def test_direct_line_routes_are_retired(client_fixture, auth_header_director, seed_client_and_tax):
    order, item_id, instance_id = _order(client_fixture, auth_header_director, seed_client_and_tax)
    base = f"{ORDERS}/{order['id']}"
    calls = [
        ("post", f"{base}/add-items", {"items": []}),
        ("post", f"{base}/items/{item_id}/add-instance", None),
        ("patch", f"{base}/items/{item_id}/production", {"unit_price": 1.0}),
        ("patch", f"{base}/items/{item_id}/resale", {"unit_price": 1.0}),
        ("delete", f"{base}/items/{item_id}/resale", None),
        ("delete", f"{base}/items/{item_id}/instances/{instance_id}", None),
    ]
    for method, url, body in calls:
        kwargs = {"headers": auth_header_director}
        if body is not None:
            kwargs["json"] = body
        assert getattr(client_fixture, method)(url, **kwargs).status_code == 404, url


def test_instance_patch_cannot_cancel_or_move_units(client_fixture, session_fixture, auth_header_director,
                                                    seed_client_and_tax):
    _, _, instance_id = _order(client_fixture, auth_header_director, seed_client_and_tax)
    response = client_fixture.patch(f"{settings.API_V1_STR}/sales/instances/{instance_id}", headers=auth_header_director,
                                    json={"is_cancelled": True, "production_batch_id": 99, "custom_name": "Casa 1"})
    assert response.status_code == 200, response.text
    assert response.json()["is_cancelled"] is False
    assert response.json()["production_batch_id"] is None
    assert response.json()["custom_name"] == "Casa 1"


def test_description_edit_roles_and_change_log(client_fixture, session_fixture, auth_header_director,
                                               seed_client_and_tax):
    order, item_id, _ = _order(client_fixture, auth_header_director, seed_client_and_tax)
    url = f"{ORDERS}/{order['id']}/items/{item_id}/description"
    body = {"commercial_description": "Cocina en nogal", "reason": "Lo pidió el cliente"}
    assert client_fixture.patch(url, json=body).status_code == 401
    warehouse = _user(session_fixture, UserRole.WAREHOUSE, "warehouse@desc.local")
    assert client_fixture.patch(url, headers=_headers(warehouse), json=body).status_code == 403
    other = _user(session_fixture, UserRole.SALES, "other@desc.local")
    assert client_fixture.patch(url, headers=_headers(other), json=body).status_code == 403

    seller = session_fixture.exec(select(User).where(User.email == TEST_SALES_EMAIL)).first()
    db_order = session_fixture.get(SalesOrder, order["id"])
    db_order.user_id = seller.id
    session_fixture.add(db_order)
    session_fixture.commit()
    response = client_fixture.patch(url, headers=_headers(seller), json=body)
    assert response.status_code == 200, response.text
    assert response.json()["commercial_description"] == "Cocina en nogal"
    row = session_fixture.exec(select(AuditFieldChange).where(
        AuditFieldChange.table_name == "sales_order_items", AuditFieldChange.field_name == "commercial_description",
    )).all()[-1]
    assert row.new_value == "Cocina en nogal" and row.reason == "Lo pidió el cliente"

    no_reason = client_fixture.patch(url, headers=auth_header_director, json={"commercial_description": "Nogal claro"})
    assert no_reason.status_code == 200
