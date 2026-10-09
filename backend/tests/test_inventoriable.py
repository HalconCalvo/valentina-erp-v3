"""Inventoriable yes/no: counted or not, stock or expense, and the open September session."""
from datetime import datetime
from types import SimpleNamespace

import pytest
from fastapi import HTTPException
from sqlmodel import select

from app.core.business_time import local_to_utc_naive
from app.core.config import settings
from app.core.security import create_access_token, get_password_hash
from app.models.audit import AuditFieldChange
from app.models.foundations import Provider
from app.models.inventory import InventoryTransaction
from app.models.material import Material
from app.models.users import User, UserRole
from app.schemas.inventory_audit_schema import AuditCreate
from app.schemas.inventory_schema import InventoriableUpdate
from app.services import inventoriable_service, inventory_service
from app.services import inventory_audit_service as audits
from tests.conftest import TEST_DIRECTOR_EMAIL

FOUNDATIONS = f"{settings.API_V1_STR}/foundations"
CUT = datetime(2026, 9, 30).date()


def _user(session, role: UserRole) -> User:
    user = User(email=f"{role.value.lower()}@inv.local", full_name=role.value, role=role, is_active=True,
                hashed_password=get_password_hash("Pass123!"))
    session.add(user)
    session.commit()
    session.refresh(user)
    return user


def _material(session, sku: str, route: str = "MATERIAL", cost: float = 10.0, inventoriable: bool = True) -> Material:
    material = Material(sku=sku, name=f"Mat {sku}", category="Insumos", production_route=route, purchase_unit="Pz",
                        usage_unit="Pz", conversion_factor=1.0, current_cost=cost, is_inventoriable=inventoriable)
    session.add(material)
    session.commit()
    session.refresh(material)
    return material


def _move(session, material, movement_type, qty, when, cost=None):
    inventory_service.register_movement(session, material.id, movement_type, qty, unit_cost=cost,
                                        created_at=local_to_utc_naive(when), reason="test")


@pytest.fixture
def env(session_fixture):
    s = session_fixture
    board = _material(s, "TAB-INV")
    paper = _material(s, "PAPEL", route="CONSUMIBLE", cost=510.0)
    _move(s, board, "PURCHASE_ENTRY", 10, datetime(2026, 9, 5, 9), cost=10)
    _move(s, paper, "PURCHASE_ENTRY", 2, datetime(2026, 9, 5, 9), cost=510)
    _move(s, paper, "PURCHASE_ENTRY", 1, datetime(2026, 10, 3, 9), cost=510)
    director = s.exec(select(User).where(User.email == TEST_DIRECTOR_EMAIL)).first()
    return SimpleNamespace(s=s, board=board, paper=paper, director=director,
                           admin=_user(s, UserRole.ADMIN), sales=_user(s, UserRole.SALES))


def _line(audit: dict, material) -> dict:
    return next(i for i in audit["items"] if i["material_id"] == material.id)


def test_switch_takes_the_line_out_of_the_open_session_and_writes_off_at_the_cut(env):
    audit = audits.create_audit_session(env.s, AuditCreate(cut_date=CUT), env.director)
    audits.capture_count(env.s, audit["id"], _line(audit, env.board)["id"], 10, env.director)
    with pytest.raises(HTTPException) as blocked:
        audits.submit_for_approval(env.s, audit["id"], env.director)
    assert blocked.value.detail["code"] == "UNCAPTURED_WITH_STOCK"

    inventoriable_service.set_inventoriable(
        env.s, env.paper.id, InventoriableUpdate(is_inventoriable=False, reason="Artículo de limpieza"), env.director)
    env.s.refresh(env.paper)
    assert env.paper.is_inventoriable is False and abs(env.paper.physical_stock) < 1e-9
    write_offs = env.s.exec(select(InventoryTransaction).where(
        InventoryTransaction.material_id == env.paper.id,
        InventoryTransaction.transaction_type == "EXPENSE_WRITE_OFF").order_by(InventoryTransaction.created_at)).all()
    assert [w.quantity for w in write_offs] == [-2, -1]
    assert write_offs[0].created_at == audit_cut(env, audit) and write_offs[0].subtotal == 1020.0
    assert write_offs[0].reason_code == "Artículo de limpieza"

    closed = audits.submit_for_approval(env.s, audit["id"], env.director)
    assert closed["status"] == "CERRADA"
    assert all(i["material_id"] != env.paper.id for i in closed["items"])
    log = env.s.exec(select(AuditFieldChange).where(
        AuditFieldChange.table_name == "materials", AuditFieldChange.field_name == "is_inventoriable")).all()
    assert log and log[-1].reason == "Artículo de limpieza"


def audit_cut(env, audit):
    return audits.inventory_repo.get_audit_by_id(env.s, audit["id"]).cut_at


def test_roles_reason_and_back_to_inventoriable(env):
    data = InventoriableUpdate(is_inventoriable=False, reason="Gasto")
    with pytest.raises(HTTPException) as no_role:
        inventoriable_service.set_inventoriable(env.s, env.paper.id, data, env.sales)
    assert no_role.value.status_code == 403
    with pytest.raises(HTTPException) as admin_with_stock:
        inventoriable_service.set_inventoriable(env.s, env.paper.id, data, env.admin)
    assert admin_with_stock.value.status_code == 403
    with pytest.raises(HTTPException) as blank:
        inventoriable_service.set_inventoriable(env.s, env.paper.id, InventoriableUpdate(is_inventoriable=False, reason=" "),
                                                env.director)
    assert blank.value.status_code == 422
    empty = _material(env.s, "SERV", route="SERVICIO")
    assert inventoriable_service.set_inventoriable(env.s, empty.id, data, env.admin).is_inventoriable is False
    back = inventoriable_service.set_inventoriable(
        env.s, empty.id, InventoriableUpdate(is_inventoriable=True, reason="Se almacena"), env.admin)
    assert back.is_inventoriable is True


def test_non_inventoriable_is_not_counted_valued_nor_received(client_fixture, env):
    inventoriable_service.set_inventoriable(
        env.s, env.paper.id, InventoriableUpdate(is_inventoriable=False, reason="Gasto"), env.director)
    audit = audits.create_audit_session(env.s, AuditCreate(cut_date=CUT), env.director)
    assert {i["material_id"] for i in audit["items"]} == {env.board.id}
    assert audits.inventory_repo.get_inventory_valuation(env.s) == 100.0

    provider = Provider(business_name="Prov", rfc_tax_id="XAXX010101000")
    env.s.add(provider)
    env.s.commit()
    token = create_access_token(subject=env.director.email, user_id=env.director.id, user_role="DIRECTOR")
    response = client_fixture.post(f"{settings.API_V1_STR}/inventory/reception", headers={"Authorization": f"Bearer {token}"},
                                   json={"provider_id": provider.id, "invoice_number": "F-1",
                                         "invoice_date": "2026-10-09T12:00:00", "total_amount": 1020,
                                         "items": [{"material_id": env.paper.id, "quantity": 2, "line_total_cost": 1020}]})
    assert response.status_code == 200, response.text
    env.s.refresh(env.paper)
    assert abs(env.paper.physical_stock) < 1e-9


def test_new_consumables_start_as_non_inventoriable(client_fixture, env):
    token = create_access_token(subject=env.director.email, user_id=env.director.id, user_role="DIRECTOR")
    body = {"sku": "TRAPO", "name": "Trapo", "category": "Insumos", "production_route": "CONSUMIBLE",
            "purchase_unit": "Pz", "usage_unit": "Pz"}
    created = client_fixture.post(f"{FOUNDATIONS}/materials", headers={"Authorization": f"Bearer {token}"}, json=body)
    assert created.status_code == 200 and created.json()["is_inventoriable"] is False
    put = client_fixture.put(f"{FOUNDATIONS}/materials/{created.json()['id']}", json={**body, "is_inventoriable": True})
    assert put.status_code == 200 and put.json()["is_inventoriable"] is False
