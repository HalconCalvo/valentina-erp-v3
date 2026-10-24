"""Programadas sin cuadrilla (Gabriel, 2026-10-12): Planning schedules an installation with or without a crew and
assigns the crew later. A lane without crew is red when its date is 3 days away or less (or already passed)."""
from datetime import date
from typing import List

from sqlmodel import Session

from app.repositories import installation_staffing_repository as repo
from app.services.logistics_service import instance_context
from app.core.business_time import today_local

ALERT_DAYS = 3
LANE_DATES = (("IM", "scheduled_inst_mdf"), ("IP", "scheduled_inst_stone"))


def get_unstaffed(session: Session, today: date | None = None) -> List[dict]:
    """Every scheduled installation lane without crew, the closest first."""
    today = today or today_local()
    instances = repo.get_scheduled_open_instances(session)
    staffed = repo.get_staffed_lanes(session, (i.id for i in instances))
    rows = []
    for inst in instances:
        for lane, field in LANE_DATES:
            scheduled = getattr(inst, field)
            if not scheduled or (inst.id, lane) in staffed:
                continue
            folio, client_name, address = instance_context(session, inst)
            days_left = (scheduled.date() - today).days
            rows.append({"instance_id": inst.id, "lane": lane, "instance_name": inst.custom_name or "—",
                         "order_folio": folio, "client_name": client_name, "address": address,
                         "scheduled_date": scheduled.date().isoformat(), "days_left": days_left,
                         "is_urgent": days_left <= ALERT_DAYS})
    return sorted(rows, key=lambda r: (r["scheduled_date"], r["instance_name"]))
