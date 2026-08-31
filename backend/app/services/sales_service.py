"""
Sales service for Valentina ERP v3.

Responsibility: all sales-domain business logic currently scattered in
app/api/v1/endpoints/sales.py.  This service will be populated gradually
as endpoints are refactored — existing endpoint code must NOT be moved
until explicitly instructed by the architect (Claude).

Operations that will migrate here (Phase 2):
  - create_order       — validate client, build SalesOrder, persist
  - authorize_order    — role check, status transition SENT → ACCEPTED
  - cancel_order       — cascade-cancel instances, record actor + timestamp
  - register_payment   — create CustomerPayment, update CXC balance
  - calculate_totals   — subtotal, commission, tax, advance amounts

Rules (CLAUDE.md):
  - No HTTP imports (Request / Response / HTTPException) in this file
  - Max 50 lines per function; extract private helpers with _ prefix
  - Atomic transactions: try / session.commit() / except session.rollback()
  - Log every financial operation via core.logger
"""
