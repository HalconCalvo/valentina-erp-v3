from datetime import datetime

import pytest
from fastapi import HTTPException
from sqlmodel import select

from app.core import audit_context
from app.core.audit_listener import LONG_JSON_VALUE, MASKED_VALUE, to_text
from app.core.config import settings
from app.core.security import create_access_token, get_password_hash
from app.models.active_session import ActiveSession
from app.models.audit import AuditFieldChange
from app.models.foundations import GlobalConfig
from app.models.inventory import InventoryTransaction
from app.models.material import Material
from app.models.users import User, UserRole
from app.services import audit_service
from tests.conftest import TEST_DIRECTOR_EMAIL


def _material(session, sku="AUD-1") -> Material:
    material = Material(sku=sku, name="Tablero auditado", category="TABLERO", production_route="MATERIAL",
                        purchase_unit="Hoja", usage_unit="Hoja", current_cost=100.0)
    session.add(material)
    session.commit()
    session.refresh(material)
    return material


def _changes(session, table=None, record_id=None) -> list[AuditFieldChange]:
    query = select(AuditFieldChange).order_by(AuditFieldChange.id)
    if table:
        query = query.where(AuditFieldChange.table_name == table)
    if record_id is not None:
        query = query.where(AuditFieldChange.record_id == str(record_id))
    return list(session.exec(query).all())


def _user(session, role: UserRole) -> User:
    user = User(email=f"{role.value.lower()}@audit.local", full_name=f"{role.value} Audit",
                hashed_password=get_password_hash("Pass123!"), role=role, is_active=True)
    session.add(user)
    session.commit()
    session.refresh(user)
    return user


def _headers(user: User) -> dict:
    token = create_access_token(subject=user.email, user_id=user.id, user_role=user.role.value)
    return {"Authorization": f"Bearer {token}"}


def test_insert_is_logged_once_without_copying_fields(session_fixture):
    material = _material(session_fixture)
    rows = _changes(session_fixture, "materials", material.id)
    assert [(r.operation, r.field_name, r.old_value, r.new_value) for r in rows] == [("INSERT", None, None, None)]
    assert rows[0].source == "system" and rows[0].user_id is None


def test_update_logs_each_changed_field_with_actor(session_fixture):
    material = _material(session_fixture)
    token = audit_context.set_actor(7, "10.0.0.1")
    try:
        material.current_cost = 125.5
        material.name = "Tablero corregido"
        material.usage_unit = "Hoja"  # unchanged value: not logged
        session_fixture.add(material)
        session_fixture.commit()
    finally:
        audit_context.reset_actor(token)
    updates = [r for r in _changes(session_fixture, "materials", material.id) if r.operation == "UPDATE"]
    assert {(r.field_name, r.old_value, r.new_value) for r in updates} == {
        ("current_cost", "100.0", "125.5"), ("name", "Tablero auditado", "Tablero corregido"),
    }
    assert {r.user_id for r in updates} == {7} and {r.ip_address for r in updates} == {"10.0.0.1"}
    assert {r.source for r in updates} == {"api"} and len({r.change_id for r in updates}) == 1


def test_reason_is_attached(session_fixture):
    material = _material(session_fixture)
    with audit_context.audit_reason("Precio de proveedor actualizado"):
        material.current_cost = 90.0
        session_fixture.add(material)
        session_fixture.commit()
    update = [r for r in _changes(session_fixture, "materials", material.id) if r.operation == "UPDATE"][0]
    assert update.reason == "Precio de proveedor actualizado"


def test_sensitive_fields_are_masked_and_noise_is_ignored(session_fixture):
    config = GlobalConfig(company_name="Test", target_profit_margin=0.3, cost_tolerance_percent=0.05,
                          quote_validity_days=15, default_edgebanding_factor=1.1, smtp_password="secreta")
    session_fixture.add(config)
    session_fixture.commit()
    config.updated_at = datetime(2030, 1, 1)
    session_fixture.add(config)
    session_fixture.commit()
    assert [r for r in _changes(session_fixture, "global_config") if r.operation == "UPDATE"] == []
    config.smtp_password = "otra"
    session_fixture.add(config)
    session_fixture.commit()
    update = [r for r in _changes(session_fixture, "global_config") if r.operation == "UPDATE"][0]
    assert (update.field_name, update.old_value, update.new_value) == ("smtp_password", MASKED_VALUE, MASKED_VALUE)
    assert "secreta" not in str([r.model_dump() for r in _changes(session_fixture)])


def test_excluded_tables_and_ledger_inserts(session_fixture):
    director = session_fixture.exec(select(User).where(User.email == TEST_DIRECTOR_EMAIL)).first()
    session_fixture.add(ActiveSession(user_id=director.id, session_token="tok"))
    material = _material(session_fixture)
    session_fixture.add(InventoryTransaction(material_id=material.id, quantity=1, unit_cost=1, subtotal=1))
    session_fixture.commit()
    assert _changes(session_fixture, "active_sessions") == []
    assert _changes(session_fixture, "inventory_transactions") == []


def test_long_json_is_summarized(session_fixture):
    assert to_text({"ingredients": ["x" * 2000]}) == LONG_JSON_VALUE
    assert to_text(UserRole.MANAGER) == "MANAGER"
    assert to_text(True) == "true"


def test_rollback_leaves_no_log(session_fixture):
    material = _material(session_fixture)
    before = len(_changes(session_fixture))
    material.current_cost = 1.0
    session_fixture.add(material)
    session_fixture.flush()
    session_fixture.rollback()
    assert len(_changes(session_fixture)) == before


def test_delete_is_logged(session_fixture):
    material = _material(session_fixture)
    session_fixture.delete(material)
    session_fixture.commit()
    assert [r.operation for r in _changes(session_fixture, "materials", material.id)] == ["INSERT", "DELETE"]


def test_request_through_sync_endpoint_records_user_and_ip(client_fixture, session_fixture):
    director = session_fixture.exec(select(User).where(User.email == TEST_DIRECTOR_EMAIL)).first()
    material = _material(session_fixture)
    payload = {"name": "Tablero por API"}
    response = client_fixture.put(f"{settings.API_V1_STR}/foundations/materials/{material.id}",
                                  headers=_headers(director), json=payload)
    assert response.status_code == 200, response.text
    update = [r for r in _changes(session_fixture, "materials", material.id) if r.field_name == "name"][0]
    assert (update.user_id, update.source, update.new_value) == (director.id, "api", "Tablero por API")
    assert update.ip_address


def test_history_endpoint_and_roles(client_fixture, session_fixture):
    director = session_fixture.exec(select(User).where(User.email == TEST_DIRECTOR_EMAIL)).first()
    manager, admin = _user(session_fixture, UserRole.MANAGER), _user(session_fixture, UserRole.ADMIN)
    material = _material(session_fixture)
    url = f"{settings.API_V1_STR}/audit/history/materials/{material.id}"
    for user, expected in ((director, 200), (manager, 200), (admin, 403)):
        assert client_fixture.get(url, headers=_headers(user)).status_code == expected
    rows = client_fixture.get(url, headers=_headers(manager)).json()
    assert rows[0]["operation"] == "INSERT" and rows[0]["user_name"] == "Sistema"
    listing = client_fixture.get(f"{settings.API_V1_STR}/audit/changes", headers=_headers(director),
                                 params={"table_name": "materials"}).json()
    assert listing["total"] >= 1
    tables = client_fixture.get(f"{settings.API_V1_STR}/audit/tables", headers=_headers(director)).json()
    assert "materials" in tables


def test_service_rejects_sales_role(session_fixture):
    sales = session_fixture.exec(select(User).where(User.role == UserRole.SALES)).first()
    with pytest.raises(HTTPException) as exc:
        audit_service.list_field_changes(session_fixture, sales)
    assert exc.value.status_code == 403
