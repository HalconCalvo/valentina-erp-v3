"""H38: installation dates (IM/IP) cannot be before production. Before production the bound is the scheduled PM;
once the house entered production it is the real production date, so a house produced ahead of PM can be
installed earlier."""
from datetime import datetime

from sqlmodel import select

from app.core.config import settings
from app.models.production import ProductionBatch, ProductionBatchStatus
from app.models.sales import InstanceStatus, SalesOrderItem, SalesOrderItemInstance
from tests.sales_helpers import create_order_via_quotation

API = settings.API_V1_STR
PM = "2026-12-10T15:00:00"  # 09:00 Mérida


def _house(client, session, headers, seed, status: InstanceStatus, started_at=None) -> int:
    order = create_order_via_quotation(client, headers, seed[0].id, seed[1].id)
    item = session.exec(select(SalesOrderItem).where(SalesOrderItem.sales_order_id == order["id"])).first()
    instance = session.exec(select(SalesOrderItemInstance)
                            .where(SalesOrderItemInstance.sales_order_item_id == item.id)).first()
    instance.scheduled_prod_mdf, instance.production_status = datetime.fromisoformat(PM), status
    if started_at:
        batch = ProductionBatch(folio=f"LOTE-H38-{instance.id}", batch_type="MDF",
                                status=ProductionBatchStatus.IN_PRODUCTION, started_at=started_at)
        session.add(batch)
        session.commit()
        instance.production_batch_id = batch.id
    session.add(instance)
    session.commit()
    return instance.id


def _set_im(client, headers, instance_id: int, day: str):
    return client.patch(f"{API}/planning/instances/{instance_id}", headers=headers,
                        json={"scheduled_inst_mdf": f"{day}T15:00:00"})


def test_before_production_im_cannot_be_before_scheduled_pm(client_fixture, session_fixture,
                                                            auth_header_director, seed_client_and_tax):
    house = _house(client_fixture, session_fixture, auth_header_director, seed_client_and_tax, InstanceStatus.PENDING)
    early = _set_im(client_fixture, auth_header_director, house, "2026-12-05")
    assert early.status_code == 400
    assert "antes de producir" in early.json()["detail"]
    assert _set_im(client_fixture, auth_header_director, house, "2026-12-10").status_code == 200


def test_produced_ahead_of_pm_the_bound_is_the_real_production_date(client_fixture, session_fixture,
                                                                    auth_header_director, seed_client_and_tax):
    house = _house(client_fixture, session_fixture, auth_header_director, seed_client_and_tax,
                   InstanceStatus.READY, started_at=datetime(2026, 12, 1, 16, 0))
    assert _set_im(client_fixture, auth_header_director, house, "2026-12-01").status_code == 200
    assert _set_im(client_fixture, auth_header_director, house, "2026-11-30").status_code == 400
    session_fixture.expire_all()
    stored = session_fixture.get(SalesOrderItemInstance, house)
    assert stored.scheduled_inst_mdf.date().isoformat() == "2026-12-01"


def test_a_started_stone_batch_does_not_open_mdf_installation(client_fixture, session_fixture,
                                                              auth_header_director, seed_client_and_tax):
    """Piloto 2: the stone batch started (house IN_PRODUCTION) but its MDF batch is a draft, so the bound is
    still the scheduled PM."""
    house = _house(client_fixture, session_fixture, auth_header_director, seed_client_and_tax,
                   InstanceStatus.IN_PRODUCTION)
    mdf = ProductionBatch(folio="LOTE-MDF-P2", batch_type="MDF", status=ProductionBatchStatus.DRAFT)
    stone = ProductionBatch(folio="LOTE-PIEDRA-P2", batch_type="PIEDRA", status=ProductionBatchStatus.PACKING,
                            started_at=datetime(2026, 12, 1, 16))
    session_fixture.add_all([mdf, stone])
    session_fixture.commit()
    instance = session_fixture.get(SalesOrderItemInstance, house)
    instance.production_batch_id, instance.stone_batch_id = mdf.id, stone.id
    session_fixture.add(instance)
    session_fixture.commit()
    assert _set_im(client_fixture, auth_header_director, house, "2026-12-05").status_code == 400
    assert _set_im(client_fixture, auth_header_director, house, "2026-12-10").status_code == 200
