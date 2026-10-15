"""H42: rescheduling an installation never removes its crew; the crew follows the lane date (modal save and
calendar drag & drop)."""
from datetime import datetime

from sqlmodel import select

from app.core.config import settings
from app.models.production import InstallationAssignment
from app.models.sales import InstanceStatus, SalesOrderItem, SalesOrderItemInstance
from app.models.users import UserRole
from tests.sales_helpers import create_order_via_quotation
from tests.test_installation_flow import _user

API = settings.API_V1_STR


def _house_with_crews(client, session, headers, seed) -> int:
    order = create_order_via_quotation(client, headers, seed[0].id, seed[1].id)
    item = session.exec(select(SalesOrderItem).where(SalesOrderItem.sales_order_id == order["id"])).first()
    instance = session.exec(select(SalesOrderItemInstance)
                            .where(SalesOrderItemInstance.sales_order_item_id == item.id)).first()
    instance.production_status = InstanceStatus.PENDING
    instance.scheduled_prod_mdf = datetime(2026, 12, 10, 15)
    instance.scheduled_inst_mdf = datetime(2026, 12, 20, 15)
    instance.scheduled_inst_stone = datetime(2026, 12, 22, 15)
    leader, _ = _user(session, UserRole.LOGISTICS, "Lider")
    stone, _ = _user(session, UserRole.LOGISTICS, "Piedrero")
    session.add_all([instance,
                     InstallationAssignment(instance_id=instance.id, lane="IM", leader_user_id=leader.id,
                                            assignment_date=datetime(2026, 12, 20)),
                     InstallationAssignment(instance_id=instance.id, lane="IP", leader_user_id=stone.id,
                                            assignment_date=datetime(2026, 12, 22))])
    session.commit()
    return instance.id


def _crews(session, instance_id: int) -> dict:
    session.expire_all()
    rows = session.exec(select(InstallationAssignment).where(InstallationAssignment.instance_id == instance_id)).all()
    return {r.lane: (r.leader_user_id, r.assignment_date.date().isoformat()) for r in rows}


def test_modal_reschedule_keeps_the_crews_and_moves_their_dates(client_fixture, session_fixture,
                                                                auth_header_director, seed_client_and_tax):
    house = _house_with_crews(client_fixture, session_fixture, auth_header_director, seed_client_and_tax)
    before = _crews(session_fixture, house)
    res = client_fixture.patch(f"{API}/planning/instances/{house}", headers=auth_header_director,
                               json={"scheduled_inst_stone": "2026-12-15T15:00:00"})
    assert res.status_code == 200
    after = _crews(session_fixture, house)
    assert after["IP"] == (before["IP"][0], "2026-12-15")
    assert after["IM"] == before["IM"]


def test_drag_and_drop_keeps_the_crew_and_respects_production(client_fixture, session_fixture,
                                                              auth_header_director, seed_client_and_tax):
    house = _house_with_crews(client_fixture, session_fixture, auth_header_director, seed_client_and_tax)
    url = f"{API}/planning/instances/{house}/reschedule"
    moved = client_fixture.patch(url, headers=auth_header_director, json={
        "field": "scheduled_inst_mdf", "new_date": "2026-12-18T15:00:00", "proportional": False})
    assert moved.status_code == 200
    assert _crews(session_fixture, house)["IM"][1] == "2026-12-18"
    early = client_fixture.patch(url, headers=auth_header_director, json={
        "field": "scheduled_inst_mdf", "new_date": "2026-12-05T15:00:00", "proportional": False})
    assert early.status_code == 400
    assert _crews(session_fixture, house)["IM"][1] == "2026-12-18"


def test_unscheduling_a_lane_keeps_its_crew(client_fixture, session_fixture,
                                            auth_header_director, seed_client_and_tax):
    house = _house_with_crews(client_fixture, session_fixture, auth_header_director, seed_client_and_tax)
    res = client_fixture.patch(f"{API}/planning/instances/{house}", headers=auth_header_director,
                               json={"clear_inst_stone": True})
    assert res.status_code == 200
    assert "IP" in _crews(session_fixture, house)
