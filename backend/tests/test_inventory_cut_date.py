from datetime import date, datetime, timedelta
from types import SimpleNamespace

import pytest
from fastapi import HTTPException
from sqlmodel import select

from app.core.business_time import cut_end_utc, local_to_utc_naive, today_local
from app.core.config import settings
from app.core.security import create_access_token, get_password_hash
from app.models.foundations import GlobalConfig
from app.models.inventory import InventoryAuditItemRecount, InventoryTransaction
from app.models.material import Material
from app.models.users import User, UserRole
from app.schemas.inventory_audit_schema import (
    AuditCreate,
    AuditItemRecountCreate,
    AuditReopenCreate,
    AuditSettingsUpdate,
)
from app.services import inventory_audit_service as audits
from app.services import inventory_service, purchase_service
from tests.conftest import TEST_DIRECTOR_EMAIL

CUT = date(2026, 9, 30)
AUG_CUT = date(2026, 8, 31)


def _utc(local: datetime) -> datetime:
    return local_to_utc_naive(local)


def _user(session, role: UserRole) -> User:
    user = User(email=f"{role.value.lower()}@cut.local", full_name=f"{role.value} Cut",
                hashed_password=get_password_hash("Pass123!"), role=role, is_active=True)
    session.add(user)
    session.commit()
    session.refresh(user)
    return user


def _material(session, sku: str) -> Material:
    material = Material(sku=sku, name=f"Material {sku}", category="TABLERO", production_route="MATERIAL",
                        purchase_unit="Hoja", usage_unit="Hoja", conversion_factor=1.0, current_cost=10.0)
    session.add(material)
    session.commit()
    session.refresh(material)
    return material


def _move(session, material, movement_type, qty, when_local, cost=None):
    return inventory_service.register_movement(
        session, material.id, movement_type, qty, unit_cost=cost, created_at=_utc(when_local), reason="test",
    )


@pytest.fixture
def env(session_fixture):
    s = session_fixture
    board = _material(s, "TAB-CUT")
    _move(s, board, "PURCHASE_ENTRY", 100, datetime(2026, 9, 10, 9), cost=10)
    _move(s, board, "PRODUCTION_EXIT", 20, datetime(2026, 9, 20, 9))
    _move(s, board, "PURCHASE_ENTRY", 50, datetime(2026, 10, 2, 9), cost=12)
    director = s.exec(select(User).where(User.email == TEST_DIRECTOR_EMAIL)).first()
    return SimpleNamespace(s=s, board=board, director=director,
                           manager=_user(s, UserRole.MANAGER), admin=_user(s, UserRole.ADMIN))


def _new_audit(env, cut=CUT):
    return audits.create_audit_session(env.s, AuditCreate(cut_date=cut), env.director)


def _line(audit: dict, material) -> dict:
    return next(i for i in audit["items"] if i["material_id"] == material.id)


def _count(env, audit: dict, material, qty: float):
    audits.capture_count(env.s, audit["id"], _line(audit, material)["id"], qty, env.director)


def _close_with_count(env, qty: float, cut=CUT) -> dict:
    audit = _new_audit(env, cut)
    _count(env, audit, env.board, qty)
    return audits.submit_for_approval(env.s, audit["id"], env.director)


# --- Time ------------------------------------------------------------------------

def test_cut_end_is_merida_end_of_day_in_utc():
    assert cut_end_utc(CUT) == datetime(2026, 10, 1, 5, 59, 59)
    assert _utc(datetime(2026, 9, 30, 19, 0)) <= cut_end_utc(CUT)


def test_movement_at_night_of_cut_day_counts_in_the_cut(env):
    _move(env.s, env.board, "PRODUCTION_EXIT", 5, datetime(2026, 9, 30, 19, 0))
    closed = _close_with_count(env, 75)
    assert _line(closed, env.board)["system_quantity"] == 75
    assert closed["status"] == "CERRADA"


# --- Theoretical at cut, adjustment, later movements ------------------------------

def test_adjustment_uses_cut_stock_and_respects_later_movements(env):
    closed = _close_with_count(env, 78)
    line = _line(closed, env.board)
    assert line["system_quantity"] == 80 and line["variance"] == -2
    move = env.s.get(InventoryTransaction, line["adjustment_movement_id"])
    assert move.transaction_type == "INVENTORY_DIFF_OUT"
    assert move.created_at == cut_end_utc(CUT)
    assert move.recorded_at > move.created_at
    assert (move.audit_id, move.audit_item_id) == (closed["id"], line["id"])
    env.s.refresh(env.board)
    assert env.board.physical_stock == 128


def test_adjustment_cost_is_last_purchase_on_or_before_cut(env):
    closed = _close_with_count(env, 78)
    line = _line(closed, env.board)
    assert line["unit_cost_at_cut"] == 10
    assert line["valued_difference"] == -20


def test_cost_without_purchases_falls_back_to_current_usage_cost(env):
    other = _material(env.s, "SIN-COMPRA")
    _move(env.s, other, "OPENING_BALANCE", 10, datetime(2026, 9, 1, 9))
    audit = _new_audit(env)
    _count(env, audit, env.board, 80)
    _count(env, audit, other, 9)
    closed = audits.submit_for_approval(env.s, audit["id"], env.director)
    assert _line(closed, other)["unit_cost_at_cut"] == 10


# --- Submit rules -----------------------------------------------------------------

def test_uncaptured_zero_theoretical_counts_as_zero(env):
    empty = _material(env.s, "VACIO")
    closed = _close_with_count(env, 80)
    line = _line(closed, empty)
    assert line["counted_quantity"] == 0 and line["auto_zero"] is True
    assert line["adjustment_movement_id"] is None


@pytest.mark.parametrize("opening", [5, -3])
def test_uncaptured_with_nonzero_theoretical_blocks_without_quantities(env, opening):
    other = _material(env.s, "CON-EXIST")
    if opening > 0:
        _move(env.s, other, "OPENING_BALANCE", opening, datetime(2026, 9, 1, 9))
    else:
        inventory_service.register_movement(env.s, other.id, "ADJUSTMENT_OUT", 3, reason="x",
                                            created_at=_utc(datetime(2026, 9, 1, 9)), allow_negative=True)
    audit = _new_audit(env)
    _count(env, audit, env.board, 80)
    with pytest.raises(HTTPException) as exc:
        audits.submit_for_approval(env.s, audit["id"], env.director)
    assert exc.value.status_code == 422
    assert exc.value.detail["materials"] == [{"sku": "CON-EXIST", "name": "Material CON-EXIST"}]


def test_approval_recalculates_with_late_registered_movement(env):
    audit = _new_audit(env)
    _count(env, audit, env.board, 60)
    submitted = audits.submit_for_approval(env.s, audit["id"], env.director)
    assert submitted["status"] == "ESPERANDO_AUTORIZACION"
    _move(env.s, env.board, "PRODUCTION_EXIT", 10, datetime(2026, 9, 25, 9))
    line_id = _line(submitted, env.board)["id"]
    approved = audits.approve_audit_item(env.s, audit["id"], line_id, "ok", env.manager)
    assert approved["system_quantity"] == 70 and approved["variance"] == -10


# --- Approval rule -----------------------------------------------------------------

@pytest.mark.parametrize(
    "theoretical, counted, cost, expected",
    [
        (200, 190, 1, []),
        (200, 189, 1, ["PERCENT"]),
        (0, 5, 1, ["ZERO_THEORETICAL"]),
        (0, 0, 1, []),
        (-3, 0, 1, ["NEGATIVE_THEORETICAL"]),
        (1000, 980, 150, ["VALUE"]),
        (1000, 980, 50, []),
        (200, 150, 100, ["PERCENT", "VALUE"]),
    ],
)
def test_approval_rule(theoretical, counted, cost, expected):
    assert audits.approval_reasons(theoretical, counted, cost, 2000.0) == expected


def test_value_threshold_comes_from_global_config(env):
    assert audits.value_threshold(env.s) == 2000.0
    config = GlobalConfig(company_name="Test", target_profit_margin=0.3, cost_tolerance_percent=0.05,
                          quote_validity_days=15, default_edgebanding_factor=1.1)
    env.s.add(config)
    env.s.commit()
    with pytest.raises(HTTPException) as forbidden:
        audits.update_audit_settings(env.s, AuditSettingsUpdate(inventory_audit_value_threshold=5000), env.manager)
    assert forbidden.value.status_code == 403
    with pytest.raises(HTTPException) as invalid:
        audits.update_audit_settings(env.s, AuditSettingsUpdate(inventory_audit_value_threshold=0), env.director)
    assert invalid.value.status_code == 422
    audits.update_audit_settings(env.s, AuditSettingsUpdate(inventory_audit_value_threshold=5000), env.director)
    assert audits.value_threshold(env.s) == 5000.0


def test_value_reason_is_stored_and_admin_cannot_approve(env):
    expensive = _material(env.s, "CARO")
    _move(env.s, expensive, "PURCHASE_ENTRY", 1000, datetime(2026, 9, 5, 9), cost=150)
    audit = _new_audit(env)
    _count(env, audit, env.board, 79)
    _count(env, audit, expensive, 980)
    submitted = audits.submit_for_approval(env.s, audit["id"], env.director)
    line = _line(submitted, expensive)
    assert line["requires_approval"] is True and line["approval_reason"] == "VALUE"
    with pytest.raises(HTTPException) as exc:
        audits.approve_audit_item(env.s, audit["id"], line["id"], None, env.admin)
    assert exc.value.status_code == 403


# --- Period lock, reopen, recount ------------------------------------------------------

def test_closed_period_blocks_backdated_movements(env):
    _close_with_count(env, 80)
    with pytest.raises(HTTPException) as exc:
        _move(env.s, env.board, "PRODUCTION_EXIT", 1, datetime(2026, 9, 29, 9))
    assert exc.value.status_code == 400 and "30/09/2026" in exc.value.detail
    _move(env.s, env.board, "PRODUCTION_EXIT", 1, datetime(2026, 10, 3, 9))


def test_reception_date_rules(env):
    _close_with_count(env, 80)
    with pytest.raises(HTTPException) as future:
        purchase_service._reception_effective_at(env.s, (today_local() + timedelta(days=1)).isoformat())
    assert future.value.status_code == 400
    with pytest.raises(HTTPException) as closed:
        purchase_service._reception_effective_at(env.s, "2026-09-28")
    assert closed.value.status_code == 400
    assert purchase_service._reception_effective_at(env.s, "2026-10-02") == _utc(datetime(2026, 10, 2, 12))


def test_new_session_cannot_be_future_or_inside_closed_period(env):
    with pytest.raises(HTTPException) as future:
        _new_audit(env, today_local() + timedelta(days=1))
    assert future.value.status_code == 400
    _close_with_count(env, 80)
    with pytest.raises(HTTPException) as closed:
        _new_audit(env, CUT)
    assert closed.value.status_code == 400


def test_reopen_rules(env):
    closed = _close_with_count(env, 80)
    with pytest.raises(HTTPException) as forbidden:
        audits.reopen_audit(env.s, closed["id"], AuditReopenCreate(reason="x"), env.manager)
    assert forbidden.value.status_code == 403
    with pytest.raises(HTTPException) as no_reason:
        audits.reopen_audit(env.s, closed["id"], AuditReopenCreate(reason=" "), env.director)
    assert no_reason.value.status_code == 422
    reopened = audits.reopen_audit(env.s, closed["id"], AuditReopenCreate(reason="Error de captura"), env.director)
    assert reopened["status"] == "REABIERTA"
    _move(env.s, env.board, "PRODUCTION_EXIT", 1, datetime(2026, 9, 29, 9))


def test_reopen_requires_later_cut_reopened_first(env):
    august = _close_with_count(env, 0, cut=AUG_CUT)
    assert august["status"] == "CERRADA"
    _close_with_count(env, 80)
    with pytest.raises(HTTPException) as exc:
        audits.reopen_audit(env.s, august["id"], AuditReopenCreate(reason="x"), env.director)
    assert exc.value.status_code == 400


def test_recount_reverses_and_reposts_at_cut_date(env):
    closed = _close_with_count(env, 78)
    line = _line(closed, env.board)
    with pytest.raises(HTTPException) as not_reopened:
        audits.recount_item(env.s, closed["id"], line["id"], AuditItemRecountCreate(counted_quantity=80, reason="x"), env.director)
    assert not_reopened.value.status_code == 400
    audits.reopen_audit(env.s, closed["id"], AuditReopenCreate(reason="Se contó mal"), env.director)
    result = audits.recount_item(env.s, closed["id"], line["id"],
                                 AuditItemRecountCreate(counted_quantity=80, reason="Se contó mal"), env.manager)
    assert result["variance"] == 0 and result["adjustment_movement_id"] is None
    reversal = env.s.exec(select(InventoryTransaction).where(
        InventoryTransaction.reverses_movement_id == line["adjustment_movement_id"])).one()
    assert reversal.created_at == cut_end_utc(CUT) and reversal.quantity == 2
    recount = env.s.exec(select(InventoryAuditItemRecount)).one()
    assert (recount.previous_counted, recount.new_counted, recount.reversed_movement_id) == (78, 80, reversal.id)
    env.s.refresh(env.board)
    assert env.board.physical_stock == 130
    closed_again = audits.close_again(env.s, closed["id"], env.director)
    assert closed_again["status"] == "CERRADA"


# --- Retired endpoints -------------------------------------------------------------

def test_retired_endpoints_are_gone(client_fixture, env):
    token = create_access_token(subject=env.director.email, user_id=env.director.id, user_role="DIRECTOR")
    headers = {"Authorization": f"Bearer {token}"}
    base = f"{settings.API_V1_STR}/foundations/materials/{env.board.id}"
    assert client_fixture.patch(f"{base}/adjust-stock", headers=headers, json={"counted_quantity": 1}).status_code in (404, 405)
    assert client_fixture.post(f"{base}/physical-count", headers=headers,
                               json={"counted_quantity": 1, "fecha_conteo": "2026-09-30"}).status_code in (404, 405)
