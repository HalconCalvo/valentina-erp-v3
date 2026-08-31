"""
Structured audit logger for Valentina ERP v3.

Responsibility: record who did what, when, to which entity and for how much.
Required for all financial operations, status changes and errors.
Never use print() — always use this module.

Audit events captured:
  - Financial operations  : create/edit/cancel invoices, payments, bank movements
  - Status transitions    : SalesOrder, PurchaseOrder, invoice status changes
  - Errors                : operation failures with context for debugging

Output format: structured JSON lines, ready for ingestion by any log aggregator.
"""
import json
import logging
import sys
from datetime import datetime, timezone

logging.basicConfig(stream=sys.stdout, level=logging.INFO, format="%(message)s")
_logger = logging.getLogger("valentina.audit")


def _emit(event: dict) -> None:
    """Serialize event dict to a single JSON line and write to stdout."""
    event["timestamp"] = datetime.now(timezone.utc).isoformat()
    _logger.info(json.dumps(event, ensure_ascii=False, default=str))


def log_financial_operation(
    user_id: int,
    operation: str,
    entity_id: int,
    amount: float,
    extra: dict | None = None,
) -> None:
    """Record a financial mutation (invoice, payment, bank movement, expense).

    Args:
        user_id:   ID of the authenticated user performing the action.
        operation: Verb describing the action, e.g. "create_invoice", "execute_payment".
        entity_id: Primary key of the affected entity.
        amount:    Monetary amount involved (MXN).
        extra:     Optional dict with additional domain context.
    """
    _emit({
        "event": "financial_operation",
        "user_id": user_id,
        "operation": operation,
        "entity_id": entity_id,
        "amount": amount,
        **(extra or {}),
    })


def log_status_change(
    user_id: int,
    entity: str,
    entity_id: int,
    from_status: str,
    to_status: str,
    extra: dict | None = None,
) -> None:
    """Record a status transition on any tracked entity.

    Args:
        user_id:     ID of the authenticated user performing the transition.
        entity:      Domain entity name, e.g. "SalesOrder", "PurchaseOrder".
        entity_id:   Primary key of the affected record.
        from_status: Previous status value.
        to_status:   New status value.
        extra:       Optional dict with additional domain context.
    """
    _emit({
        "event": "status_change",
        "user_id": user_id,
        "entity": entity,
        "entity_id": entity_id,
        "from_status": from_status,
        "to_status": to_status,
        **(extra or {}),
    })


def log_error(
    operation: str,
    error: Exception | str,
    context: dict | None = None,
) -> None:
    """Record an operation failure without exposing stack traces to the user.

    Args:
        operation: The operation that failed, e.g. "execute_payment".
        error:     The exception or error message string.
        context:   Optional dict with entity IDs or payload snapshot for debugging.
    """
    _emit({
        "event": "error",
        "operation": operation,
        "error": str(error),
        "context": context or {},
    })
