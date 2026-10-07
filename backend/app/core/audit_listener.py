"""Automatic change log for every table written through the ORM.

- before_flush: collects field-level UPDATEs (old -> new, only values that really changed) and DELETEs, and
  remembers new objects.
- after_flush: new objects now have ids; writes all rows with a Core INSERT on the same connection, so the log
  commits or rolls back together with the business change and never re-enters the ORM flush.
Raw SQL and bulk statements bypass this listener (covered separately).
"""
import enum
import json
import uuid
from datetime import date, datetime
from decimal import Decimal
from typing import Any, Optional

from sqlalchemy import and_, event, inspect, insert, select
from sqlalchemy.orm import Session

from app.core.audit_context import current_actor, current_reason
from app.models.audit import AuditFieldChange

EXCLUDED_TABLES = {"audit_field_changes", "audit_logs", "active_sessions", "alembic_version"}
# Ledgers that already trace who/why on every row: their inserts are not duplicated in the log.
INSERT_SKIPPED_TABLES = {"inventory_transactions", "bank_transactions", "product_stock_movements"}
IGNORED_FIELDS = {"updated_at", "last_heartbeat"}
MASKED_FIELDS = {"hashed_password", "smtp_password", "session_token"}
MASKED_VALUE = "***cambió***"
MAX_VALUE_LENGTH = 1000
LONG_JSON_VALUE = "(contenido extenso modificado)"
PENDING_KEY = "_audit_pending"

_registered = False


def to_text(value: Any) -> Optional[str]:
    if value is None:
        return None
    if isinstance(value, enum.Enum):
        value = value.value
    if isinstance(value, (datetime, date)):
        return value.isoformat()
    if isinstance(value, bool):
        return "true" if value else "false"
    if isinstance(value, (Decimal, float, int)):
        return str(value)
    if isinstance(value, (dict, list)):
        text = json.dumps(value, ensure_ascii=False, default=str, sort_keys=True)
        return text if len(text) <= MAX_VALUE_LENGTH else LONG_JSON_VALUE
    text = str(value)
    return text if len(text) <= MAX_VALUE_LENGTH else text[:MAX_VALUE_LENGTH] + "…"


def _table_name(obj: Any) -> Optional[str]:
    table = getattr(obj, "__table__", None)
    return table.name if table is not None else None


def _record_id(obj: Any) -> Optional[str]:
    values = inspect(obj).mapper.primary_key_from_instance(obj)
    if not values or all(v is None for v in values):
        return None
    return ",".join(str(v) for v in values)


def _stored_row(session: Session, obj: Any) -> Optional[dict]:
    """Current database row of a persistent object (used when the old value was not loaded in memory)."""
    mapper = inspect(obj).mapper
    pk = mapper.primary_key_from_instance(obj)
    condition = and_(*[column == value for column, value in zip(mapper.primary_key, pk)])
    row = session.connection().execute(select(mapper.local_table).where(condition)).mappings().first()
    return dict(row) if row else None


def _old_value(session: Session, obj: Any, attr, history, cache: dict) -> Any:
    if history.deleted:
        return history.deleted[0]
    if "row" not in cache:
        cache["row"] = _stored_row(session, obj) if inspect(obj).persistent else None
    row = cache["row"] or {}
    return row.get(attr.columns[0].name)


def _update_rows(session: Session, obj: Any, table: str) -> list[dict]:
    state = inspect(obj)
    rows, cache = [], {}
    for attr in state.mapper.column_attrs:
        key = attr.key
        if key in IGNORED_FIELDS:
            continue
        history = state.attrs[key].history
        if not history.has_changes():
            continue
        old = _old_value(session, obj, attr, history, cache)
        new = history.added[0] if history.added else None
        if old == new:
            continue
        if key in MASKED_FIELDS:
            old_text, new_text = (MASKED_VALUE if old is not None else None), MASKED_VALUE
        else:
            old_text, new_text = to_text(old), to_text(new)
        rows.append({"table_name": table, "record_id": _record_id(obj), "operation": "UPDATE",
                     "field_name": key, "old_value": old_text, "new_value": new_text})
    return rows


def _before_flush(session: Session, flush_context, instances) -> None:
    rows: list[dict] = []
    for obj in session.dirty:
        table = _table_name(obj)
        if table and table not in EXCLUDED_TABLES and session.is_modified(obj, include_collections=False):
            rows.extend(_update_rows(session, obj, table))
    for obj in session.deleted:
        table = _table_name(obj)
        if table and table not in EXCLUDED_TABLES:
            rows.append({"table_name": table, "record_id": _record_id(obj), "operation": "DELETE",
                         "field_name": None, "old_value": None, "new_value": None})
    new_objects = [o for o in session.new if _table_name(o) and _table_name(o) not in EXCLUDED_TABLES | INSERT_SKIPPED_TABLES]
    session.info[PENDING_KEY] = (rows, new_objects)


def _after_flush(session: Session, flush_context) -> None:
    rows, new_objects = session.info.pop(PENDING_KEY, ([], []))
    for obj in new_objects:
        rows.append({"table_name": _table_name(obj), "record_id": _record_id(obj), "operation": "INSERT",
                     "field_name": None, "old_value": None, "new_value": None})
    if not rows:
        return
    actor = current_actor()
    common = {"changed_at": datetime.utcnow(), "user_id": actor.user_id, "source": actor.source,
              "ip_address": actor.ip, "change_id": uuid.uuid4().hex, "reason": current_reason()}
    session.connection().execute(insert(AuditFieldChange.__table__), [{**common, **row} for row in rows])


def register_audit_listeners() -> None:
    global _registered
    if _registered:
        return
    event.listen(Session, "before_flush", _before_flush)
    event.listen(Session, "after_flush", _after_flush)
    _registered = True
