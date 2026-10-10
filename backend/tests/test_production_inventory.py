from datetime import datetime, timedelta
from types import SimpleNamespace

import pytest
from fastapi import HTTPException
from sqlmodel import select

from app.core import material_groups as mg
from app.core.config import settings
from app.core.security import create_access_token, get_password_hash
from app.models.design import ProductMaster, ProductVersion, VersionComponent
from app.models.foundations import Client, TaxRate
from app.models.inventory import InventoryReservation, InventoryTransaction, ProductionStockAuthorization
from app.models.material import Material
from app.models.production import ProductionBatch, ProductionBatchStatus
from app.models.sales import (
    CXCStatus,
    CustomerPayment,
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
from app.services.inventory_service import _apply_purchase_cost
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


def _pay_advance(session, order, director):
    session.add(CustomerPayment(sales_order_id=order.id, amount=1000, created_by_user_id=director.id,
                                payment_type="ADVANCE", status=CXCStatus.PAID))
    session.commit()


@pytest.fixture
def env(session_fixture):
    s = session_fixture
    screw = _material(s, "0502-002", "HERRAJES", 1000.0, SCREW_COST_PER_THOUSAND, 1000.0)
    board = _material(s, "TAB-1", "TABLERO", 1.0, 500.0, 10.0, purchase_unit="Hoja", usage_unit="Hoja")
    glue = _material(s, "PEG-1", "INSUMOS", 1.0, 50.0, 5.0, purchase_unit="Lt", usage_unit="Lt")
    master = ProductMaster(name="Cocina Test")
    s.add(master)
    s.commit()
    version = ProductVersion(master_id=master.id, version_name="V1")
    s.add(version)
    s.commit()
    s.add(VersionComponent(version_id=version.id, material_id=screw.id, quantity=100))
    s.add(VersionComponent(version_id=version.id, material_id=board.id, quantity=2))
    s.add(VersionComponent(version_id=version.id, material_id=glue.id, quantity=1))
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
    _pay_advance(s, order, director)
    return SimpleNamespace(
        s=s, screw=screw, board=board, glue=glue, order=order, instances=instances, batch=batch, director=director,
        manager=_user(s, UserRole.MANAGER), admin=_user(s, UserRole.ADMIN),
        warehouse=_user(s, UserRole.WAREHOUSE),
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


def _reservations(env, status=None, material=None):
    query = select(InventoryReservation).where(InventoryReservation.production_batch_id == env.batch.id)
    if status:
        query = query.where(InventoryReservation.status == status)
    if material:
        query = query.where(InventoryReservation.material_id == material.id)
    return env.s.exec(query).all()


def _refresh(env, *objs):
    for obj in objs:
        env.s.refresh(obj)


def _exits(env, reason=None):
    query = select(InventoryTransaction).where(InventoryTransaction.transaction_type == "PRODUCTION_EXIT")
    if reason:
        query = query.where(InventoryTransaction.reason_code == reason)
    return env.s.exec(query).all()


def _set_stock(env, material, stock):
    material.physical_stock = stock
    env.s.add(material)
    env.s.commit()


# --- Assignment and discharge by material group ---------------------------------

def test_assign_creates_active_reservations(client_fixture, env):
    _assign_all(client_fixture, env)
    assert len(_reservations(env, "ACTIVA")) == 6
    _refresh(env, env.screw, env.board)
    assert env.screw.committed_stock == 200
    assert env.screw.physical_stock == 1000


def test_enter_production_discharges_main_and_consumables_not_hardware(client_fixture, env):
    _assign_all(client_fixture, env)
    _status(env, "IN_PRODUCTION")
    _refresh(env, env.screw, env.board, env.glue, env.batch, *env.instances)
    assert env.board.physical_stock == 6 and env.glue.physical_stock == 3
    assert env.screw.physical_stock == 1000 and env.screw.committed_stock == 200
    assert len(_reservations(env, "ACTIVA", env.screw)) == 2
    assert env.batch.started_at is not None
    assert all(i.production_status == InstanceStatus.IN_PRODUCTION for i in env.instances)
    board_res = _reservations(env, "CONSUMIDA", env.board)[0]
    exit_move = env.s.get(InventoryTransaction, board_res.consumed_movement_id)
    assert (exit_move.quantity, exit_move.subtotal, exit_move.project_id) == (-2, 1000, env.order.id)
    assert exit_move.production_batch_id == env.batch.id


def test_main_material_shortage_blocks_with_detail_and_changes_nothing(client_fixture, env):
    _assign_all(client_fixture, env)
    _set_stock(env, env.board, 3)
    with pytest.raises(HTTPException) as exc:
        _status(env, "IN_PRODUCTION")
    assert exc.value.status_code == 409
    assert [(s["sku"], s["required"], s["available"], s["missing"]) for s in exc.value.detail["shortages"]] == [("TAB-1", 4, 3, 1)]
    _refresh(env, env.board, env.glue, env.batch)
    assert env.board.physical_stock == 3 and env.glue.physical_stock == 5
    assert env.batch.status == ProductionBatchStatus.DRAFT
    assert len(_reservations(env, "ACTIVA")) == 6


def test_consumable_and_hardware_shortages_never_block(client_fixture, env):
    _assign_all(client_fixture, env)
    _set_stock(env, env.glue, 0)
    _set_stock(env, env.screw, 0)
    _status(env, "IN_PRODUCTION")
    _refresh(env, env.glue)
    assert env.glue.physical_stock == -2
    assert env.s.exec(select(ProductionStockAuthorization)).all() == []


def test_manager_override_goes_negative_with_trace(client_fixture, env):
    _assign_all(client_fixture, env)
    _set_stock(env, env.board, 3)
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
    assert {m.material_id for m in moves} == {env.board.id}


def test_stone_batch_blocks_only_on_stone(client_fixture, env):
    stone = _material(env.s, "GRA-1", "PIEDRA", 1.0, 2000.0, 0.0, purchase_unit="M2", usage_unit="M2")
    stone_batch = ProductionBatch(folio="L-PIE-1", batch_type="PIEDRA", status=ProductionBatchStatus.DRAFT)
    env.s.add(stone_batch)
    env.s.commit()
    env.s.add(VersionComponent(version_id=env.s.exec(select(ProductVersion)).first().id, material_id=stone.id, quantity=3))
    env.s.commit()
    client_fixture.post(f"{settings.API_V1_STR}/production/{stone_batch.id}/assign_instance/{env.instances[0].id}",
                        headers=_headers(env.director))
    with pytest.raises(HTTPException) as exc:
        svc.change_batch_status(env.s, stone_batch.id, BatchStatusUpdate(status="IN_PRODUCTION"), env.director)
    assert exc.value.detail["shortages"][0]["sku"] == "GRA-1"
    svc.change_batch_status(env.s, stone_batch.id, BatchStatusUpdate(status="IN_PRODUCTION", override_reason="Ya llegó"), env.manager)
    env.s.refresh(stone)
    assert stone.physical_stock == -3


def test_discharge_is_idempotent_and_skipping_in_production_also_discharges(client_fixture, env):
    _assign_all(client_fixture, env)
    _status(env, "PACKING")
    _status(env, "IN_PRODUCTION")
    _status(env, "PACKING")
    assert len(_exits(env)) == 4


def test_assign_to_batch_in_production_discharges_immediately(client_fixture, env):
    client_fixture.post(f"{settings.API_V1_STR}/production/{env.batch.id}/assign_instance/{env.instances[0].id}",
                        headers=_headers(env.director))
    _status(env, "IN_PRODUCTION")
    response = client_fixture.post(
        f"{settings.API_V1_STR}/production/{env.batch.id}/assign_instance/{env.instances[1].id}",
        headers=_headers(env.director),
    )
    assert response.status_code == 200
    _refresh(env, env.board)
    assert env.board.physical_stock == 6
    assert len(_reservations(env, "ACTIVA")) == 2  # only hardware waits for dispatch


# --- Advance payment ------------------------------------------------------------

def _unpay(env):
    for payment in env.s.exec(select(CustomerPayment)).all():
        payment.status = CXCStatus.PENDING
        env.s.add(payment)
    env.s.commit()


def test_agreed_unpaid_advance_blocks_entering_production(client_fixture, env):
    _assign_all(client_fixture, env)
    _unpay(env)
    with pytest.raises(HTTPException) as exc:
        _status(env, "IN_PRODUCTION")
    assert exc.value.status_code == 409 and exc.value.detail["code"] == "ADVANCE_REQUIRED"
    assert exc.value.detail["orders"] == [env.order.id]
    assert svc.payment_cleared(env.s, env.instances) is False


def test_order_without_agreed_advance_is_not_blocked(client_fixture, env):
    _assign_all(client_fixture, env)
    _unpay(env)
    env.order.advance_percent = 0
    env.order.advance_invoice_amount = None
    env.s.add(env.order)
    env.s.commit()
    assert svc.payment_cleared(env.s, env.instances) is True
    _status(env, "IN_PRODUCTION")


def test_empty_batch_cannot_enter_production(env):
    with pytest.raises(HTTPException) as exc:
        _status(env, "IN_PRODUCTION")
    assert exc.value.status_code == 400


def test_assign_to_batch_in_production_checks_advance(client_fixture, env):
    client_fixture.post(f"{settings.API_V1_STR}/production/{env.batch.id}/assign_instance/{env.instances[0].id}",
                        headers=_headers(env.director))
    _status(env, "IN_PRODUCTION")
    _unpay(env)
    response = client_fixture.post(
        f"{settings.API_V1_STR}/production/{env.batch.id}/assign_instance/{env.instances[1].id}",
        headers=_headers(env.director),
    )
    assert response.status_code == 409


def test_batch_list_padlock_uses_same_rule(client_fixture, env):
    _assign_all(client_fixture, env)
    rows = client_fixture.get(f"{settings.API_V1_STR}/production/batches", headers=_headers(env.director)).json()
    assert rows[0]["is_payment_cleared"] is True
    _unpay(env)
    rows = client_fixture.get(f"{settings.API_V1_STR}/production/batches", headers=_headers(env.director)).json()
    assert rows[0]["is_payment_cleared"] is False


# --- Hardware dispatch and truck-load safety net ------------------------------------

def test_dispatch_hardware_discharges_instance_hardware(client_fixture, env):
    _assign_all(client_fixture, env)
    _status(env, "IN_PRODUCTION")
    _set_stock(env, env.screw, 50)
    response = client_fixture.patch(f"{settings.API_V1_STR}/production/instances/{env.instances[0].id}/dispatch-hardware",
                                    headers=_headers(env.warehouse))
    assert response.status_code == 200 and response.json()["materials_discharged"] == 1
    _refresh(env, env.screw, env.instances[0])
    assert env.screw.physical_stock == -50
    assert env.instances[0].hardware_dispatched is True
    assert len(_exits(env, "SURTIDO_HERRAJES")) == 1
    again = client_fixture.patch(f"{settings.API_V1_STR}/production/instances/{env.instances[0].id}/dispatch-hardware",
                                 headers=_headers(env.warehouse))
    assert again.status_code == 400


def test_dispatch_hardware_requires_role(client_fixture, env):
    _assign_all(client_fixture, env)
    response = client_fixture.patch(f"{settings.API_V1_STR}/production/instances/{env.instances[0].id}/dispatch-hardware",
                                    headers=_headers(env.sales))
    assert response.status_code == 403


def test_truck_load_safety_net_discharges_undispatched_hardware(client_fixture, env):
    _assign_all(client_fixture, env)
    _status(env, "IN_PRODUCTION")
    assert svc.transfer_instance_to_cogs(env.s, env.instances[0].id, env.director) == 3
    env.s.commit()
    _refresh(env, env.screw, env.instances[0])
    assert env.screw.physical_stock == 900
    assert env.instances[0].hardware_dispatched is True
    assert len(_exits(env, "DESCARGA_EN_CARGA")) == 1
    assert svc.transfer_instance_to_cogs(env.s, env.instances[0].id, env.director) == 0


def test_returned_hardware_clears_dispatch_flag_but_waste_does_not(client_fixture, env):
    _assign_all(client_fixture, env)
    _status(env, "IN_PRODUCTION")
    for inst in env.instances:
        svc.dispatch_instance_hardware(env.s, inst.id, env.director)
    _status(env, "DRAFT", user=env.manager, reversal=ReversalCreate(reason="Regresa", disposition="RETURN_TO_STOCK"))
    _refresh(env, *env.instances, env.screw)
    assert all(i.hardware_dispatched is False for i in env.instances)
    assert env.screw.physical_stock == 1000
    _status(env, "IN_PRODUCTION")
    svc.dispatch_instance_hardware(env.s, env.instances[0].id, env.director)
    _status(env, "DRAFT", user=env.manager, reversal=ReversalCreate(reason="Se dañó", disposition="WASTE"))
    _refresh(env, env.instances[0])
    assert env.instances[0].hardware_dispatched is True


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
    _refresh(env, env.board, env.batch, *env.instances)
    assert env.board.physical_stock == 10 and env.board.committed_stock == 4
    reversed_rows = _reservations(env, "REVERTIDA")
    assert len(reversed_rows) == 4 and reversed_rows[0].reversal_reason == "Error de corte"
    assert len(_reservations(env, "ACTIVA")) == 6
    assert all(i.production_status == InstanceStatus.PENDING for i in env.instances)
    returns = env.s.exec(select(InventoryTransaction).where(InventoryTransaction.transaction_type == "PRODUCTION_RETURN")).all()
    assert len(returns) == 4


def test_reversal_waste_keeps_stock_out(client_fixture, env):
    _assign_all(client_fixture, env)
    _status(env, "IN_PRODUCTION")
    _status(env, "ON_HOLD", user=env.director, reversal=ReversalCreate(reason="Se dañó", disposition="WASTE"))
    _refresh(env, env.board)
    assert env.board.physical_stock == 6
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
    assert len(cancelled) == 3 and cancelled[0].reversal_reason == "Va en otro lote"


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
    _refresh(env, inst, env.board, env.screw)
    assert env.board.physical_stock == 8
    assert env.screw.committed_stock == 100
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


def _drop_payments(env):
    for payment in env.s.exec(select(CustomerPayment)).all():
        payment.status = CXCStatus.PENDING
        payment.payment_type = "PROGRESS"
        env.s.add(payment)
    env.s.commit()


def test_cancel_ov_releases_active_reservations(client_fixture, env):
    _assign_all(client_fixture, env)
    _waiting_advance(env)
    _drop_payments(env)
    sales_service.cancel_ov(env.s, env.order.id, env.director)
    _refresh(env, env.screw)
    assert env.screw.committed_stock == 0
    assert len(_reservations(env, "CANCELADA")) == 6


def test_cancel_ov_with_discharged_material_requires_reversal(client_fixture, env):
    _assign_all(client_fixture, env)
    _status(env, "IN_PRODUCTION")
    _waiting_advance(env)
    _drop_payments(env)
    with pytest.raises(HTTPException) as exc:
        sales_service.cancel_ov(env.s, env.order.id, env.director)
    assert exc.value.status_code == 409
    env.s.rollback()
    payload = OVCancelCreate(reversal=ReversalCreate(reason="Cliente canceló", disposition="WASTE"))
    order = sales_service.cancel_ov(env.s, env.order.id, env.manager, payload)
    assert order.status == SalesOrderStatus.CANCELLED_OV
    assert len(_reservations(env, "REVERTIDA")) == 4
    assert len(_reservations(env, "CANCELADA")) == 2


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


# --- Valuation and costs ----------------------------------------------------------

def test_valuation_buckets(client_fixture, env):
    _assign_all(client_fixture, env)
    production_value = 2 * 500 + 1 * 50
    hardware_value = 100 * SCREW_USAGE_COST
    before = inventory_valuation_service.get_valuation_summary(env.s, env.director)
    assert before["raw_materials"] == pytest.approx(1000 * SCREW_USAGE_COST + 10 * 500 + 5 * 50, abs=0.01)
    _status(env, "IN_PRODUCTION")
    wip = inventory_valuation_service.get_valuation_summary(env.s, env.director)
    assert wip["work_in_progress"] == pytest.approx(2 * production_value, abs=0.01)
    assert wip["total"] == pytest.approx(before["total"], abs=0.02)
    svc.dispatch_instance_hardware(env.s, env.instances[0].id, env.director)
    dispatched = inventory_valuation_service.get_valuation_summary(env.s, env.director)
    assert dispatched["work_in_progress"] == pytest.approx(2 * production_value + hardware_value, abs=0.01)
    _status(env, "PACKING")
    svc.transfer_instance_to_cogs(env.s, env.instances[0].id, env.director)
    env.s.commit()
    packed = inventory_valuation_service.get_valuation_summary(env.s, env.director)
    assert packed["work_in_progress"] == 0
    assert packed["finished_goods"] == pytest.approx(production_value, abs=0.01)
    assert packed["cost_of_sales"] == pytest.approx(production_value + hardware_value, abs=0.01)
    assert packed["total"] == pytest.approx(before["total"] - production_value - hardware_value, abs=0.02)


def test_negative_stock_report_and_roles(client_fixture, env):
    _assign_all(client_fixture, env)
    _set_stock(env, env.board, 3)
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


def test_material_groups_single_definition():
    assert mg.group_for("Tablero", "MDF") == mg.MAIN
    assert mg.group_for("PIEDRA", "PIEDRA") == mg.MAIN
    assert mg.group_for("PIEDRA", "MDF") == mg.DISPATCH_GROUP
    assert mg.group_for("CHAPACINTA", "MDF") == mg.CONSUMABLE
    assert mg.group_for("INSUMOS", "MDF") == mg.CONSUMABLE
    for category in ("HERRAJES", "ACCESORIO", "ELECTRODOMÉSTICO", "VIDRIO", "ELECTRICIDAD", "ESPECIAL", "NUEVA"):
        assert mg.group_for(category, "MDF") == mg.DISPATCH_GROUP


def test_purchase_cost_rounds_up_to_the_cent_without_float_noise():
    material = Material(sku="CENT-1", name="Centavos", category="X", purchase_unit="Pz", usage_unit="Pz")
    assert _apply_purchase_cost(material, 34.45) == 34.45  # 34.45 * 100 = 3445.0000000000005 in float
    assert _apply_purchase_cost(material, 34.451) == 34.46
    assert _apply_purchase_cost(material, 0.001) == 0.01
