"""H39: each calendar lane shows its own state. A started stone batch does not mark MDF production done, and
loading MDF does not mark the stone installation loaded."""
from datetime import datetime

from sqlmodel import select

from app.core.config import settings
from app.models.production import (InstallationAssignment, InstallationAssignmentStatus, ProductionBatch,
                                   ProductionBatchStatus)
from app.models.sales import InstanceStatus, SalesOrderItem, SalesOrderItemInstance
from app.models.users import UserRole
from tests.sales_helpers import create_order_via_quotation
from tests.test_installation_flow import _user

API = settings.API_V1_STR


def _pills(client, headers, instance_id: int) -> dict:
    data = client.get(f"{API}/planning/calendar", params={"year": 2026, "month": 12}, headers=headers).json()
    return {p["lane"]: p["lane_done"] for day in data["calendar"].values() for p in day
            if p["instance_id"] == instance_id}


def test_each_lane_has_its_own_state(client_fixture, session_fixture, auth_header_director, seed_client_and_tax):
    order = create_order_via_quotation(client_fixture, auth_header_director, seed_client_and_tax[0].id,
                                       seed_client_and_tax[1].id)
    item = session_fixture.exec(select(SalesOrderItem).where(SalesOrderItem.sales_order_id == order["id"])).first()
    house = session_fixture.exec(select(SalesOrderItemInstance)
                                 .where(SalesOrderItemInstance.sales_order_item_id == item.id)).first()
    mdf = ProductionBatch(folio="LOTE-MDF-H39", batch_type="MDF", status=ProductionBatchStatus.DRAFT)
    stone = ProductionBatch(folio="LOTE-PIEDRA-H39", batch_type="PIEDRA", status=ProductionBatchStatus.PACKING,
                            started_at=datetime(2026, 12, 1, 16))
    leader, _ = _user(session_fixture, UserRole.LOGISTICS, "Lider")
    session_fixture.add_all([mdf, stone])
    session_fixture.commit()
    house.production_batch_id, house.stone_batch_id = mdf.id, stone.id
    house.production_status = InstanceStatus.IN_PRODUCTION
    for field, day in (("scheduled_prod_mdf", 3), ("scheduled_prod_stone", 4), ("scheduled_inst_mdf", 10),
                       ("scheduled_inst_stone", 11)):
        setattr(house, field, datetime(2026, 12, day, 15))
    session_fixture.add(house)
    session_fixture.add(InstallationAssignment(instance_id=house.id, lane="IP", leader_user_id=leader.id,
                                               assignment_date=datetime(2026, 12, 11)))
    session_fixture.commit()
    assert _pills(client_fixture, auth_header_director, house.id) == {"PM": False, "PP": True, "IM": False, "IP": False}

    house.production_status = InstanceStatus.CARGADO
    session_fixture.add(house)
    session_fixture.add(InstallationAssignment(instance_id=house.id, lane="IM", leader_user_id=leader.id,
                                               assignment_date=datetime(2026, 12, 10),
                                               status=InstallationAssignmentStatus.IN_PROGRESS))
    session_fixture.commit()
    assert _pills(client_fixture, auth_header_director, house.id) == {"PM": False, "PP": True, "IM": True, "IP": False}
