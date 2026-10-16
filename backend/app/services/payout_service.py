"""D37: money paid to people (seller commissions, installer payroll) leaves through BANK (an account, with its bank
movement) or CASH (a petty cash expense), never unspecified, so Bancos and Caja reconcile. H66: one payment may cover
several rows of the same person. D40: DIRECTOR_CASH (the Director's own cash, Director only) records the payment
without any movement, and one payment may be split among the three (each method at most once); the parts must add up
exactly to the total."""
from dataclasses import dataclass, field
from datetime import datetime
from typing import List, Optional, Sequence

from fastapi import HTTPException
from sqlmodel import Session, select

from app.models.petty_cash import PettyCashFund, PettyCashMovement
from app.models.treasury import BankAccount, BankTransaction, TransactionType
from app.models.users import User, UserRole
from app.schemas.payout_schema import PayoutPartCreate

BANK = "BANK"
CASH = "CASH"
DIRECTOR_CASH = "DIRECTOR_CASH"
# D39: commissions already paid before Valentina (marked by migration), never chosen on screen
OUTSIDE = "OUTSIDE"
SPLIT = "SPLIT"
METHODS = (BANK, CASH, DIRECTOR_CASH)
LABELS = {BANK: "Banco", CASH: "Efectivo caja chica", DIRECTOR_CASH: "Efectivo Dirección",
          OUTSIDE: "Pagada fuera de Valentina", SPLIT: "Dividido"}


@dataclass
class Payout:
    method: str
    bank_account_id: Optional[int] = None
    bank_transaction_id: Optional[int] = None
    petty_cash_movement_id: Optional[int] = None
    detail: str = ""
    parts: List[str] = field(default_factory=list)


@dataclass
class Movement:
    """Where the money of the payment is going to leave from (fixed before anything is written)."""
    method: str
    amount: float
    account_id: Optional[int] = None


def _money(amount: float) -> str:
    return f"${amount:,.2f}"


def check_method(method: Optional[str], account_id: Optional[int]) -> str:
    value = (method or "").strip().upper()
    if value not in METHODS:
        raise HTTPException(status_code=422,
                            detail="Elige el medio de pago: Banco (cuenta), Efectivo (caja chica) o Efectivo Dirección.")
    if value == BANK and not account_id:
        raise HTTPException(status_code=422, detail="Elige la cuenta bancaria de salida.")
    return value


def plan_parts(user: User, parts: Sequence[PayoutPartCreate], total: float) -> List[Movement]:
    """Validates the split: known methods, each once, positive amounts adding up exactly to the total."""
    plan = [Movement(check_method(p.payment_method, p.account_id), round(float(p.amount or 0.0), 2), p.account_id)
            for p in parts]
    if not plan or any(m.amount <= 0 for m in plan):
        raise HTTPException(status_code=422, detail="Cada medio de pago lleva un monto mayor a cero.")
    if len({m.method for m in plan}) != len(plan):
        raise HTTPException(status_code=422, detail="Cada medio de pago va una sola vez.")
    if abs(round(sum(m.amount for m in plan), 2) - round(total, 2)) > 0.005:
        raise HTTPException(status_code=422,
                            detail=f"Los medios suman {_money(sum(m.amount for m in plan))}; el total es {_money(total)}.")
    if any(m.method == DIRECTOR_CASH for m in plan) and user.role != UserRole.DIRECTOR:
        raise HTTPException(status_code=403, detail="Solo Dirección paga con Efectivo Dirección.")
    return plan


def _bank_out(session: Session, account_id: int, amount: float, reference: str, description: str,
              entity_type: str, entity_id: Optional[int]) -> tuple[BankTransaction, BankAccount]:
    account = session.get(BankAccount, account_id)
    if not account:
        raise HTTPException(status_code=404, detail="Cuenta bancaria no encontrada.")
    if account.current_balance < amount:
        raise HTTPException(status_code=400, detail=f"Saldo insuficiente en {account.name}.")
    tx = BankTransaction(account_id=account.id, transaction_type=TransactionType.OUT, amount=amount,
                         reference=reference, description=description, related_entity_type=entity_type,
                         related_entity_id=entity_id)
    account.current_balance -= amount
    session.add_all([tx, account])
    session.flush()
    return tx, account


def _cash_out(session: Session, user: User, amount: float, concept: str, category: str) -> PettyCashMovement:
    fund = session.exec(select(PettyCashFund)).first()
    if not fund:
        raise HTTPException(status_code=409, detail="No hay fondo de caja chica configurado.")
    if fund.current_balance - amount < 0:
        raise HTTPException(status_code=400, detail="Saldo insuficiente en caja chica.")
    fund.current_balance -= amount
    fund.updated_at, fund.updated_by_id = datetime.utcnow(), user.id
    movement = PettyCashMovement(movement_type="EGRESO", amount=amount, concept=concept, category=category,
                                 created_by_id=user.id)
    session.add_all([fund, movement])
    session.flush()
    return movement


def pay_out(session: Session, user: User, *, parts: Sequence[PayoutPartCreate], amount: float, concept: str,
            category: str, entity_type: str, entity_id: Optional[int] = None) -> Payout:
    """One movement per part (Banco, Caja chica; Efectivo Dirección has none) for `amount`; nothing is committed here
    (the caller commits with its own records, so a failing part leaves nothing written)."""
    amount = round(float(amount), 2)
    if amount <= 0:
        raise HTTPException(status_code=422, detail="No hay monto que pagar.")
    plan = plan_parts(user, parts, amount)
    payout = Payout(plan[0].method if len(plan) == 1 else SPLIT)
    for m in plan:
        label = LABELS[m.method]
        if m.method == BANK:
            tx, account = _bank_out(session, m.account_id, m.amount, concept, category, entity_type, entity_id)
            payout.bank_account_id, payout.bank_transaction_id = account.id, tx.id
            label = f"Banco · {account.name}"
        elif m.method == CASH:
            payout.petty_cash_movement_id = _cash_out(session, user, m.amount, concept, category).id
        payout.parts.append(f"{label} {_money(m.amount)}")
    payout.detail = " + ".join(payout.parts)
    return payout


def single_part(method: Optional[str], account_id: Optional[int], amount: float) -> List[PayoutPartCreate]:
    """The old one-method request (payment_method + account) as a single part for the whole amount."""
    return [PayoutPartCreate(payment_method=method or "", account_id=account_id, amount=round(float(amount), 2))]
