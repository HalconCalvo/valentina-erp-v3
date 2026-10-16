"""Installer payroll payouts (D37, H66): rows ready to pay leave through Banco (account) or Efectivo (petty cash);
several rows of one person can be paid with one movement for their total."""
from datetime import datetime
from typing import List, Optional

from fastapi import HTTPException
from sqlmodel import Session

from app.models.production import PayrollPayment, PayrollStatus
from app.models.users import User
from app.services import payout_service


def _rows_to_pay(session: Session, ids: List[int], person_id: Optional[int]) -> List[PayrollPayment]:
    rows = [session.get(PayrollPayment, i) for i in dict.fromkeys(ids)]
    if not rows or any(r is None for r in rows):
        raise HTTPException(status_code=404, detail="Registro de nómina no encontrado.")
    if any(r.status != PayrollStatus.READY_TO_PAY for r in rows):
        raise HTTPException(status_code=400, detail="Solo se pagan registros en Por pagar.")
    people = {r.user_id for r in rows}
    if len(people) > 1 or (person_id is not None and people != {person_id}):
        raise HTTPException(status_code=422, detail="Un pago conjunto es para una sola persona.")
    return rows


def pay_rows(session: Session, user: User, ids: List[int], method: Optional[str], account_id: Optional[int],
             person_id: Optional[int] = None) -> dict:
    """Pays the rows with ONE movement for their total (one row = its own amount)."""
    rows = _rows_to_pay(session, ids, person_id)
    worker = session.get(User, rows[0].user_id)
    total = round(sum(float(r.total_amount or 0.0) for r in rows), 2)
    folios = ", ".join(f"#{r.id}" for r in rows)
    payout = payout_service.pay_out(session, user, method=method, account_id=account_id, amount=total,
                                    concept=f"Destajo nómina {folios} · {worker.full_name if worker else ''}",
                                    category="Nómina instaladores", entity_type="PAYROLL_PAYMENT",
                                    entity_id=rows[0].id if len(rows) == 1 else None)
    now = datetime.utcnow()
    for row in rows:
        row.status, row.paid_at, row.paid_by_user_id = PayrollStatus.PAID, now, user.id
        row.payment_method, row.bank_account_id = payout.method, payout.bank_account_id
        row.bank_transaction_id, row.petty_cash_movement_id = payout.bank_transaction_id, payout.petty_cash_movement_id
        session.add(row)
    session.commit()
    return {"ok": True, "paid_ids": [r.id for r in rows], "total": total, "payment_method": payout.method,
            "bank_transaction_id": payout.bank_transaction_id, "petty_cash_movement_id": payout.petty_cash_movement_id}
