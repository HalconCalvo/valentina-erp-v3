from datetime import datetime, timedelta
from types import SimpleNamespace

import pytest
from fastapi import HTTPException
from sqlmodel import select

from app.core.config import settings
from app.core.security import create_access_token, get_password_hash
from app.models.design import ProductMaster, ProductVersion, VersionComponent
from app.models.foundations import Client, TaxRate
from app.models.inventory import InventoryReservation, InventoryTransaction, ProductionStockAuthorization
from app.models.material import Material
from app.models.production import ProductionBatch, ProductionBatchStatus
from app.models.sales import (
    InstanceStatus,
    SalesOrder,
    SalesOrderItem,
    SalesOrderItemInstance,
    SalesOrderStatus,
)
from app.models.users import User, UserRole
from app.schemas.production_inventory_schema import (
    BatchStatusUpdate,
    InstanceRemovalCreate,
    OVCancelCreate,
    ReversalCreate,
)
from app.services import inventory_service, inventory_valuation_service, sales_service
from app.services import production_inventory_service as svc
from tests.conftest import TEST_DIRECTOR_EMAIL

SCREW_COST_PER_THOUSAND = 169.35
SCREW_USAGE_COST = SCREW_COST_PER_THOUSAND / 1000


def _user(session, role: UserRole) -> User:
    user = User(
        email=f"{role.value.lower()}@prod.local",
        full_name=f"{role.value} Prod",
        hashed_password=get_password_hash("Pass123!"),
        role=role,
        is_active=True,
    )
    session.add(user)
    session.commit()
    session.refresh(user)
    return user


def _headers(user: User) -> dict:
    token = create_access_token(subject=user.email, user_id=user.id, user_role=user.role.value)
    return {"Authorization": f"Bearer {token}"}


def _material(session, sku, category, factor, cost, stock, purchase_unit="millar", usage_unit="Pz") -> Material:
    material = Material(
        sku=sku, name=f"Material {sku}", category=category, production_route="MATERIAL",
        purchase_unit=purchase_unit, usage_unit=usage_unit, conversion_factor=factor,
        current_cost=cost, physical_stock=stock,
    )
    session.add(material)
    session.commit()
    session.refresh(material)
    return material


@pytest.fixture
def env(session_fixture):
    s = session_fixture
    screw = _material(s, "0502-002", "HERRAJES", 1000.0, SCREW_COST_PER_THOUSAND, 1000.0)
    board = _material(s, "TAB-1", "TABLERO", 1.0, 500.0, 10.0, purchase_unit="Hoja", usage_unit="Hoja")
    master = ProductMaster(name="Cocina Test")
    s.add(master)
    s.commit()
    version = ProductVersion(master_id=master.id, version_name="V1")
    s.add(version)
    s.commit()
    s.add(VersionComponent(version_id=version.id, material_id=screw.id, quantity=100))
    s.add(VersionComponent(version_id=version.id, material_id=board.id, quantity=2))
    client = s.exec(select(Client)).first()
    tax = s.exec(select(TaxRate)).first()
    order = SalesOrder(client_id=client.id, tax_rate_id=tax.id, project_name="Proyecto Inv",
                       valid_until=datetime.utcnow() + timedelta(days=30), status=SalesOrderStatus.SOLD)
    s.add(order)
    s.commit()
    item = SalesOrderItem(sales_order_id=order.id, product_name="Cocina", quantity=2, unit_price=1000,
                          origin_version_id=version.id)
    s.add(item)
    s.commit()
    instances = []
    for n in (1, 2):
        inst = SalesOrderItemInstance(sales_order_item_id=item.id, custom_name=f"Cocina {n}")
        s.add(inst)
        instances.append(inst)
    batch = ProductionBatch(folio="L-MDF-1", batch_type="MDF", status=ProductionBatchStatus.DRAFT)
    s.add(batch)
    s.commit()
    for obj in [*instances, batch]:
        s.refresh(obj)
    director = s.exec(select(User).where(User.email == TEST_DIRECTOR_EMAIL)).first()
    return SimpleNamespace(
        s=s, screw=screw, board=board, order=order, instances=instances, batch=batch, director=director,
        manager=_user(s, UserRole.MANAGER), admin=_user(s, UserRole.ADMIN),
        sales=s.exec(select(User).where(User.role == UserRole.SALES)).first(),
    )


def _assign_all(client, env, headers=None):
    for inst in env.instances:
        response = client.post(
            f"{settings.API_V1_STR}/production/{env.batch.id}/assign_instance/{inst.id}",
            headers=headers or _headers(env.director),
        )
        assert response.status_code == 200, response.text


def _status(env, status, user=None, **kwargs):
    return svc.change_batch_status(env.s, env.batch.id, BatchStatusUpdate(status=status, **kwargs), user or env.director)


def _reservations(env, status=None):
    query = select(InventoryReservation).where(InventoryReservation.production_batch_id == env.batch.id)
    if status:
        query = query.where(InventoryReservation.status == status)
    return env.s.exec(query).all()


def _refresh(env, *objs):
    for obj in objs:
        env.s.refresh(obj)


# --- Assignment and discharge -------------------------------------------------

def test_assign_creates_active_reservations(client_fixture, env):
    _assign_all(client_fixture, env)
    assert len(_reservations(env, "ACTIVA")) == 4
    _refresh(env, env.screw, env.board)
    assert env.screw.committed_stock == 200
    assert env.screw.physical_stock == 1000


def test_enter_production_discharges_recipe_at_usage_cost(client_fixture, env):
    _assign_all(client_fixture, env)
    _status(env, "IN_PRODUCTION")
    _refresh(env, env.screw, env.board, env.batch, *env.instances)
    assert env.screw.physical_stock == 800
    assert env.screw.committed_stock == 0
    assert env.board.physical_stock == 6
    assert env.batch.started_at is not None
    assert all(i.production_status == InstanceStatus.IN_PRODUCTION for i in env.instances)
    consumed = _reservations(env, "CONSUMIDA")
    assert len(consumed) == 4
    screw_res = [r for r in consumed if r.material_id == env.screw.id][0]
    assert screw_res.consumed_unit_cost == pytest.approx(SCREW_USAGE_COST)
    exit_move = env.s.get(InventoryTransaction, screw_res.consumed_movement_id)
    assert exit_move.transaction_type == "PRODUCTION_EXIT"
    assert exit_move.quantity == -100
    assert exit_move.subtotal == pytest.approx(100 * SCREW_USAGE_COST, abs=0.01)
    assert exit_move.project_id == env.order.id
    assert exit_move.production_batch_id == env.batch.id


def test_shortage_blocks_with_detail_and_changes_nothing(client_fixture, env):
    _assign_all(client_fixture, env)
    env.board.physical_stock = 3
    env.s.add(env.board)
    env.s.commit()
    with pytest.raises(HTTPException) as exc:
        _status(env, "IN_PRODUCTION")
    assert exc.value.status_code == 409
    shortage = exc.value.detail["shortages"][0]
    assert (shortage["sku"], shortage["required"], shortage["available"], shortage["missing"]) == ("TAB-1", 4, 3, 1)
    _refresh(env, env.board, env.screw, env.batch)
    assert env.board.physical_stock == 3 and env.screw.physical_stock == 1000
    assert env.batch.status == ProductionBatchStatus.DRAFT
    assert len(_reservations(env, "ACTIVA")) == 4


def test_manager_override_goes_negative_with_trace(client_fixture, env):
    _assign_all(client_fixture, env)
    env.board.physical_stock = 3
    env.s.add(env.board)
    env.s.commit()
    with pytest.raises(HTTPException) as forbidden:
        _status(env, "IN_PRODUCTION", user=env.admin, override_reason="urge")
    assert forbidden.value.status_code == 403
    with pytest.raises(HTTPException) as blank:
        _status(env, "IN_PRODUCTION", user=env.manager, override_reason="   ")
    assert blank.value.status_code == 409
    _status(env, "IN_PRODUCTION", user=env.manager, override_reason="Llega hoy la compra")
    _refresh(env, env.board)
    assert env.board.physical_stock == -1
    auth = env.s.exec(select(ProductionStockAuthorization)).one()
    assert auth.reason == "Llega hoy la compra" and auth.authorized_by_user_id == env.manager.id
    moves = env.s.exec(select(InventoryTransaction).where(InventoryTransaction.authorization_id == auth.id)).all()
    assert len(moves) == 4


def test_discharge_is_idempotent_and_skipping_in_production_also_discharges(client_fixture, env):
    _assign_all(client_fixture, env)
    _status(env, "PACKING")
    _status(env, "IN_PRODUCTION")
    _status(env, "PACKING")
    exits = env.s.exec(select(InventoryTransaction).where(InventoryTransaction.transaction_type == "PRODUCTION_EXIT")).all()
    assert len(exits) == 4


def test_assign_to_batch_in_production_discharges_immediately(client_fixture, env):
    client_fixture.post(f"{settings.API_V1_STR}/production/{env.batch.id}/assign_instance/{env.instances[0].id}",
                        headers=_headers(env.director))
    _status(env, "IN_PRODUCTION")
    response = client_fixture.post(
        f"{settings.API_V1_STR}/production/{env.batch.id}/assign_instance/{env.instances[1].id}",
        headers=_headers(env.director),
    )
    assert response.status_code == 200
    _refresh(env, env.screw)
    assert env.screw.physical_stock == 800
    assert len(_reservations(env, "ACTIVA")) == 0


# --- Reversals ------------------------------------------------------------------

def test_leaving_production_requires_reversal_by_director_or_manager(client_fixture, env):
    _assign_all(client_fixture, env)
    _status(env, "IN_PRODUCTION")
    with pytest.raises(HTTPException) as missing:
        _status(env, "DRAFT")
    assert missing.value.status_code == 409 and missing.value.detail["code"] == "REVERSAL_REQUIRED"
    with pytest.raises(HTTPException) as forbidden:
        _status(env, "DRAFT", user=env.admin, reversal=ReversalCreate(reason="x", disposition="WASTE"))
    assert forbidden.value.status_code == 403
    with pytest.raises(HTTPException) as no_reason:
        _status(env, "DRAFT", user=env.manager, reversal=ReversalCreate(reason=" ", disposition="WASTE"))
    assert no_reason.value.status_code == 422


def test_reversal_return_to_stock_restores_and_recreates_reservations(client_fixture, env):
    _assign_all(client_fixture, env)
    _status(env, "IN_PRODUCTION")
    _status(env, "DRAFT", user=env.manager, reversal=ReversalCreate(reason="Error de corte", disposition="RETURN_TO_STOCK"))
    _refresh(env, env.screw, env.batch, *env.instances)
    assert env.screw.physical_stock == 1000
    assert env.screw.committed_stock == 200
    reversed_rows = _reservations(env, "REVERTIDA")
    assert len(reversed_rows) == 4 and reversed_rows[0].reversal_reason == "Error de corte"
    assert len(_reservations(env, "ACTIVA")) == 4
    assert all(i.production_status == InstanceStatus.PENDING for i in env.instances)
    returns = env.s.exec(select(InventoryTransaction).where(InventoryTransaction.transaction_type == "PRODUCTION_RETURN")).all()
    assert len(returns) == 4


def test_reversal_waste_keeps_stock_out(client_fixture, env):
    _assign_all(client_fixture, env)
    _status(env, "IN_PRODUCTION")
    _status(env, "ON_HOLD", user=env.director, reversal=ReversalCreate(reason="Se dañó", disposition="WASTE"))
    _refresh(env, env.screw)
    assert env.screw.physical_stock == 800
    assert {r.reversal_disposition for r in _reservations(env, "REVERTIDA")} == {"WASTE"}


def test_manual_dead_is_rejected(env):
    with pytest.raises(HTTPException) as exc:
        _status(env, "DEAD")
    assert exc.value.status_code == 400


def test_remove_instance_from_batch_before_production_releases(client_fixture, env):
    _assign_all(client_fixture, env)
    inst = env.instances[0]
    svc.remove_instance_from_batch(env.s, env.batch.id, inst.id, InstanceRemovalCreate(reason="Va en otro lote"), env.director)
    _refresh(env, inst, env.screw)
    assert inst.production_batch_id is None
    assert env.screw.committed_stock == 100
    cancelled = [r for r in _reservations(env, "CANCELADA") if r.instance_id == inst.id]
    assert len(cancelled) == 2 and cancelled[0].reversal_reason == "Va en otro lote"


def test_remove_instance_in_production_requires_reversal(client_fixture, env):
    _assign_all(client_fixture, env)
    _status(env, "IN_PRODUCTION")
    inst = env.instances[0]
    with pytest.raises(HTTPException) as exc:
        svc.remove_instance_from_batch(env.s, env.batch.id, inst.id, InstanceRemovalCreate(reason="Cliente pausó"), env.director)
    assert exc.value.status_code == 409
    svc.remove_instance_from_batch(
        env.s, env.batch.id, inst.id,
        InstanceRemovalCreate(reason="Cliente pausó", reversal=ReversalCreate(reason="Cliente pausó", disposition="RETURN_TO_STOCK")),
        env.manager,
    )
    _refresh(env, inst, env.screw)
    assert env.screw.physical_stock == 900
    assert inst.production_status == InstanceStatus.PENDING and inst.production_batch_id is None


def test_loaded_instance_cannot_leave_batch(client_fixture, env):
    _assign_all(client_fixture, env)
    inst = env.instances[0]
    inst.production_status = InstanceStatus.CARGADO
    env.s.add(inst)
    env.s.commit()
    with pytest.raises(HTTPException) as exc:
        svc.remove_instance_from_batch(env.s, env.batch.id, inst.id, InstanceRemovalCreate(reason="x"), env.director)
    assert exc.value.status_code == 400


# --- OV cancellation, DEAD, truck load -------------------------------------------

def _waiting_advance(env):
    env.order.status = SalesOrderStatus.WAITING_ADVANCE
    env.s.add(env.order)
    env.s.commit()


def test_cancel_ov_releases_active_reservations(client_fixture, env):
    _assign_all(client_fixture, env)
    _waiting_advance(env)
    sales_service.cancel_ov(env.s, env.order.id, env.director)
    _refresh(env, env.screw)
    assert env.screw.committed_stock == 0
    assert len(_reservations(env, "CANCELADA")) == 4


def test_cancel_ov_with_discharged_material_requires_reversal(client_fixture, env):
    _assign_all(client_fixture, env)
    _status(env, "IN_PRODUCTION")
    _waiting_advance(env)
    with pytest.raises(HTTPException) as exc:
        sales_service.cancel_ov(env.s, env.order.id, env.director)
    assert exc.value.status_code == 409
    env.s.rollback()
    payload = OVCancelCreate(reversal=ReversalCreate(reason="Cliente canceló", disposition="WASTE"))
    order = sales_service.cancel_ov(env.s, env.order.id, env.manager, payload)
    assert order.status == SalesOrderStatus.CANCELLED_OV
    assert len(_reservations(env, "REVERTIDA")) == 4


def test_batch_dead_keeps_consumed_reservations(client_fixture, env):
    _assign_all(client_fixture, env)
    _status(env, "IN_PRODUCTION")
    _status(env, "PACKING")
    for inst in env.instances:
        response = client_fixture.patch(f"{settings.API_V1_STR}/production/instances/{inst.id}/ready",
                                        headers=_headers(env.director))
        assert response.status_code == 200
    _refresh(env, env.batch)
    assert env.batch.status == ProductionBatchStatus.DEAD
    assert len(_reservations(env, "CONSUMIDA")) == 4


def test_truck_load_moves_material_to_cost_of_sales_without_stock_movement(client_fixture, env):
    _assign_all(client_fixture, env)
    _status(env, "IN_PRODUCTION")
    moves_before = len(env.s.exec(select(InventoryTransaction)).all())
    assert svc.transfer_instance_to_cogs(env.s, env.instances[0].id) == 2
    env.s.commit()
    assert len(env.s.exec(select(InventoryTransaction)).all()) == moves_before
    assert svc.transfer_instance_to_cogs(env.s, env.instances[0].id) == 0


# --- Valuation and costs ----------------------------------------------------------

def test_valuation_buckets(client_fixture, env):
    _assign_all(client_fixture, env)
    recipe_value = 100 * SCREW_USAGE_COST + 2 * 500
    before = inventory_valuation_service.get_valuation_summary(env.s, env.director)
    assert before["raw_materials"] == pytest.approx(1000 * SCREW_USAGE_COST + 10 * 500, abs=0.01)
    _status(env, "IN_PRODUCTION")
    wip = inventory_valuation_service.get_valuation_summary(env.s, env.director)
    assert wip["work_in_progress"] == pytest.approx(2 * recipe_value, abs=0.01)
    assert wip["total"] == pytest.approx(before["total"], abs=0.02)
    _status(env, "PACKING")
    svc.transfer_instance_to_cogs(env.s, env.instances[0].id)
    env.s.commit()
    packed = inventory_valuation_service.get_valuation_summary(env.s, env.director)
    assert packed["work_in_progress"] == 0
    assert packed["finished_goods"] == pytest.approx(recipe_value, abs=0.01)
    assert packed["cost_of_sales"] == pytest.approx(recipe_value, abs=0.01)
    assert packed["total"] == pytest.approx(before["total"] - recipe_value, abs=0.02)


def test_negative_stock_report_and_roles(client_fixture, env):
    _assign_all(client_fixture, env)
    env.board.physical_stock = 3
    env.s.add(env.board)
    env.s.commit()
    _status(env, "IN_PRODUCTION", user=env.manager, override_reason="Autorizo")
    report = inventory_valuation_service.get_negative_stock_report(env.s, env.director)
    assert [m["sku"] for m in report["materials"]] == ["TAB-1"]
    assert report["authorizations"][0]["reason"] == "Autorizo"
    assert report["authorizations"][0]["batch_folio"] == "L-MDF-1"
    with pytest.raises(HTTPException) as exc:
        inventory_valuation_service.get_valuation_summary(env.s, env.sales)
    assert exc.value.status_code == 403


def test_purchase_entry_stores_usage_cost_in_kardex(env):
    result = inventory_service.register_movement(env.s, env.screw.id, "PURCHASE_ENTRY", 10000, unit_cost=169.35)
    move = env.s.get(InventoryTransaction, result["movement_id"])
    _refresh(env, env.screw)
    assert env.screw.current_cost == 169.35
    assert move.unit_cost == pytest.approx(0.16935)
    assert move.subtotal == pytest.approx(1693.50)


def test_valuation_endpoints_respect_roles(client_fixture, env):
    ok = client_fixture.get(f"{settings.API_V1_STR}/foundations/inventory/valuation-summary", headers=_headers(env.admin))
    assert ok.status_code == 200 and "total" in ok.json()
    denied = client_fixture.get(f"{settings.API_V1_STR}/foundations/inventory/negative-stock", headers=_headers(env.sales))
    assert denied.status_code == 403
