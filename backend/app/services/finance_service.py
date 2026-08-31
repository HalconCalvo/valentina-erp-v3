"""
Finance service for Valentina ERP v3.

Responsibility: all finance-domain business logic currently scattered in
app/api/v1/endpoints/finance.py.  This service will be populated gradually
as endpoints are refactored — existing endpoint code must NOT be moved
until explicitly instructed by the architect (Claude).

Operations that will migrate here (Phase 2):
  - create_purchase_invoice  — validate provider, register invoice, update AP
  - cancel_invoice           — zero outstanding balance, record actor + timestamp
  - register_payment         — apply payment to invoice, update balances
  - calculate_invoice_total  — subtotal + tax_rate → total_amount (business logic)
  - request_payment_approval — create SupplierPayment with PENDING status
  - approve_payment          — PENDING → APPROVED, assign source account
  - execute_payment          — APPROVED → PAID, debit treasury account
  - create_credit_note       — validate NC does not exceed outstanding, apply discount

Rules (CLAUDE.md):
  - No HTTP imports (Request / Response / HTTPException) in this file
  - Max 50 lines per function; extract private helpers with _ prefix
  - Atomic transactions: try / session.commit() / except session.rollback()
  - Only DIRECTOR, MANAGER and ADMIN may touch financial operations
  - Log every financial operation via core.logger
"""
