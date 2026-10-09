"""Only MATERIAL holds stock; leaving MATERIAL (or stock left on another route) goes to expense."""
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
from app.schemas.inventory_schema import MaterialRouteUpdate, StockWriteOffCreate
from app.services import inventory_service, material_route_service
from app.services import inventory_audit_service as audits
from tests.conftest import TEST_DIRECTOR_EMAIL

FOUNDATIONS = f"{settings.API_V1_STR}/foundations"
CUT = datetime(2026, 9, 30).date()


def _user(session, role: UserRole) -> User:
    user = User(email=f"{role.value.lower()}@route.local", full_name=role.value, role=role, is_active=True,
                hashed_password=get_password_hash("Pass123!"))
    session.add(user)
    session.commit()
    session.refresh(user)
    return user


def _material(session, sku: str, route: str = "MATERIAL", cost: float = 10.0) -> Material:
    material = Material(sku=sku, name=f"Mat {sku}", category="Insumos", production_route=route, purchase_unit="Pz",
                        usage_unit="Pz", conversion_factor=1.0, current_cost=cost)
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
    board = _material(s, "TAB-R")
    tape = _material(s, "CINTA", cost=34.45)
    _move(s, board, "PURCHASE_ENTRY", 10, datetime(2026, 9, 5, 9), cost=10)
    _move(s, tape, "PURCHASE_ENTRY", 12, datetime(2026, 9, 5, 9), cost=34.45)
    _move(s, tape, "PURCHASE_ENTRY", 1, datetime(2026, 10, 3, 9), cost=34.45)
    director = s.exec(select(User).where(User.email == TEST_DIRECTOR_EMAIL)).first()
    return SimpleNamespace(s=s, board=board, tape=tape, director=director,
                           admin=_user(s, UserRole.ADMIN), sales=_user(s, UserRole.SALES))


def _line(audit: dict, material) -> dict:
    return next(i for i in audit["items"] if i["material_id"] == material.id)


def _write_offs(env, material):
    return env.s.exec(select(InventoryTransaction).where(
        InventoryTransaction.material_id == material.id,
        InventoryTransaction.transaction_type == "EXPENSE_WRITE_OFF").order_by(InventoryTransaction.created_at)).all()


def test_leaving_material_with_stock_goes_to_expense_and_leaves_the_session(env):
    audit = audits.create_audit_session(env.s, AuditCreate(cut_date=CUT), env.director)
    audits.capture_count(env.s, audit["id"], _line(audit, env.board)["id"], 10, env.director)
    with pytest.raises(HTTPException):
        audits.submit_for_approval(env.s, audit["id"], env.director)

    material_route_service.change_route(
        env.s, env.tape.id, MaterialRouteUpdate(production_route="CONSUMIBLE", reason="Cinta de empaque"), env.director)
    env.s.refresh(env.tape)
    assert env.tape.production_route == "CONSUMIBLE" and abs(env.tape.physical_stock) < 1e-9
    moves = _write_offs(env, env.tape)
    cut_at = audits.inventory_repo.get_audit_by_id(env.s, audit["id"]).cut_at
    assert [m.quantity for m in moves] == [-12, -1] and moves[0].created_at == cut_at
    assert moves[0].subtotal == round(12 * moves[0].unit_cost, 2)
    closed = audits.submit_for_approval(env.s, audit["id"], env.director)
    assert closed["status"] == "CERRADA" and all(i["material_id"] != env.tape.id for i in closed["items"])
    log = env.s.exec(select(AuditFieldChange).where(
        AuditFieldChange.table_name == "materials", AuditFieldChange.field_name == "production_route")).all()
    assert log and log[-1].reason == "Cinta de empaque"


def test_stock_left_on_a_consumable_is_written_off(env):
    paper = _material(env.s, "PAPEL", route="CONSUMIBLE", cost=510.0)
    _move(env.s, paper, "ADJUSTMENT_IN", 2, datetime(2026, 9, 5, 9), cost=510)
    audit = audits.create_audit_session(env.s, AuditCreate(cut_date=CUT), env.director)
    assert all(i["material_id"] != paper.id for i in audit["items"])  # new sessions: only MATERIAL
    data = StockWriteOffCreate(reason="Artículo de limpieza")
    with pytest.raises(HTTPException) as admin:
        material_route_service.write_off_stock(env.s, paper.id, data, env.admin)
    assert admin.value.status_code == 403
    material_route_service.write_off_stock(env.s, paper.id, data, env.director)
    env.s.refresh(paper)
    assert abs(paper.physical_stock) < 1e-9 and _write_offs(env, paper)[0].subtotal == 1020.0
    with pytest.raises(HTTPException) as on_material:
        material_route_service.write_off_stock(env.s, env.board.id, data, env.director)
    assert on_material.value.status_code == 409


def test_route_roles_and_reason(env):
    data = MaterialRouteUpdate(production_route="CONSUMIBLE", reason="Gasto")
    with pytest.raises(HTTPException) as no_role:
        material_route_service.change_route(env.s, env.tape.id, data, env.sales)
    assert no_role.value.status_code == 403
    with pytest.raises(HTTPException) as admin_with_stock:
        material_route_service.change_route(env.s, env.tape.id, data, env.admin)
    assert admin_with_stock.value.status_code == 403
    with pytest.raises(HTTPException) as blank:
        material_route_service.change_route(env.s, env.tape.id, MaterialRouteUpdate(production_route="CONSUMIBLE", reason=" "), env.director)
    assert blank.value.status_code == 422
    empty = _material(env.s, "SERV", route="SERVICIO")
    back = material_route_service.change_route(env.s, empty.id, MaterialRouteUpdate(production_route="MATERIAL", reason="Se almacena"), env.admin)
    assert back.production_route == "MATERIAL"


def test_only_material_is_counted_valued_and_received(client_fixture, env):
    material_route_service.change_route(
        env.s, env.tape.id, MaterialRouteUpdate(production_route="CONSUMIBLE", reason="Gasto"), env.director)
    audit = audits.create_audit_session(env.s, AuditCreate(cut_date=CUT), env.director)
    assert {i["material_id"] for i in audit["items"]} == {env.board.id}
    assert audits.inventory_repo.get_inventory_valuation(env.s) == 100.0
    maquila = _material(env.s, "MAQUILA", route="PROCESO")
    provider = Provider(business_name="Prov", rfc_tax_id="XAXX010101000")
    env.s.add(provider)
    env.s.commit()
    token = create_access_token(subject=env.director.email, user_id=env.director.id, user_role="DIRECTOR")
    for material in (env.tape, maquila):
        response = client_fixture.post(
            f"{settings.API_V1_STR}/inventory/reception", headers={"Authorization": f"Bearer {token}"},
            json={"provider_id": provider.id, "invoice_number": f"F-{material.sku}", "invoice_date": "2026-10-09T12:00:00",
                  "total_amount": 100, "items": [{"material_id": material.id, "quantity": 2, "line_total_cost": 100}]})
        assert response.status_code == 200, response.text
        env.s.refresh(material)
        assert abs(material.physical_stock) < 1e-9


def test_material_edit_does_not_change_the_route(client_fixture, env):
    body = {"sku": env.tape.sku, "name": env.tape.name, "category": "Insumos", "production_route": "CONSUMIBLE",
            "purchase_unit": "Pz", "usage_unit": "Pz"}
    token = create_access_token(subject=env.director.email, user_id=env.director.id, user_role="DIRECTOR")
    auth = {"Authorization": f"Bearer {token}"}
    assert client_fixture.put(f"{FOUNDATIONS}/materials/{env.tape.id}", headers=auth, json=body).status_code == 409
    body["production_route"] = "MATERIAL"
    assert client_fixture.put(f"{FOUNDATIONS}/materials/{env.tape.id}", headers=auth, json=body).status_code == 200
