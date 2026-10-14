"""D32: Campo → Carga del camión shows the leader today's work and the next business day's
(crews sometimes load the truck the afternoon before)."""
from datetime import date, datetime, time
from zoneinfo import ZoneInfo

from sqlmodel import select

from app.core.config import settings
from app.models.production import InstallationAssignment
from app.models.sales import SalesOrderItem, SalesOrderItemInstance
from app.models.users import UserRole
from app.services.logistics_service import next_business_day
from tests.sales_helpers import create_order_via_quotation
from tests.test_installation_flow import _user

API = settings.API_V1_STR


def test_next_business_day_skips_the_weekend():
    assert next_business_day(date(2026, 10, 14)) == date(2026, 10, 15)  # Wednesday → Thursday
    assert next_business_day(date(2026, 10, 16)) == date(2026, 10, 19)  # Friday → Monday
    assert next_business_day(date(2026, 10, 17)) == date(2026, 10, 19)  # Saturday → Monday


def test_leader_sees_today_and_the_next_business_day_only(client_fixture, session_fixture, auth_header_director,
                                                          seed_client_and_tax):
    order = create_order_via_quotation(client_fixture, auth_header_director, seed_client_and_tax[0].id,
                                       seed_client_and_tax[1].id)
    item = session_fixture.exec(select(SalesOrderItem).where(SalesOrderItem.sales_order_id == order["id"])).first()
    house = session_fixture.exec(select(SalesOrderItemInstance)
                                 .where(SalesOrderItemInstance.sales_order_item_id == item.id)).first()
    leader, leader_headers = _user(session_fixture, UserRole.LOGISTICS, "Lider")
    today = datetime.now(ZoneInfo("America/Merida")).date()
    tomorrow = next_business_day(today)
    later = next_business_day(tomorrow)
    for lane, day in (("IM", today), ("IP", tomorrow), ("IM", later)):
        session_fixture.add(InstallationAssignment(instance_id=house.id, lane=lane, leader_user_id=leader.id,
                                                   assignment_date=datetime.combine(day, time(9))))
    session_fixture.commit()
    feed = client_fixture.get(f"{API}/logistics/my-workday", headers=leader_headers).json()
    days = sorted(row["assignment_date"][:10] for row in feed["items"])
    assert days == [today.isoformat(), tomorrow.isoformat()]
    assert feed["next_workday"] == tomorrow.isoformat()
