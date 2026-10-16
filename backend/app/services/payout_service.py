"""D37: money paid to people (seller commissions, installer payroll) leaves through BANK (an account, with its bank
movement) or CASH (a petty cash expense), never unspecified, so Bancos and Caja reconcile. H66: one movement may pay
several rows of the same person."""
from dataclasses import dataclass
from datetime import datetime
from typing import Optional

from fastapi import HTTPException
from sqlmodel import Session, select

from app.models.petty_cash import PettyCashFund, PettyCashMovement
from app.models.treasury import BankAccount, BankTransaction, TransactionType
from app.models.users import User

BANK = "BANK"
CASH = "CASH"
METHODS = (BANK, CASH)


@dataclass
class Payout:
    method: str
    bank_account_id: Optional[int] = None
    bank_transaction_id: Optional[int] = None
    petty_cash_movement_id: Optional[int] = None


def check_method(method: Optional[str], account_id: Optional[int]) -> str:
    value = (method or "").strip().upper()
    if value not in METHODS:
        raise HTTPException(status_code=422, detail="Elige el medio de pago: Banco (cuenta) o Efectivo (caja chica).")
    if value == BANK and not account_id:
        raise HTTPException(status_code=422, detail="Elige la cuenta bancaria de salida.")
    return value


def _bank_out(session: Session, account_id: int, amount: float, reference: str, description: str,
              entity_type: str, entity_id: Optional[int]) -> Payout:
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
    return Payout(BANK, bank_account_id=account.id, bank_transaction_id=tx.id)


def _cash_out(session: Session, user: User, amount: float, concept: str, category: str) -> Payout:
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
    return Payout(CASH, petty_cash_movement_id=movement.id)


def pay_out(session: Session, user: User, *, method: str, account_id: Optional[int], amount: float, concept: str,
            category: str, entity_type: str, entity_id: Optional[int] = None) -> Payout:
    """One outgoing movement for `amount`; nothing is committed here (the caller commits with its own records)."""
    amount = round(float(amount), 2)
    if amount <= 0:
        raise HTTPException(status_code=422, detail="No hay monto que pagar.")
    if check_method(method, account_id) == BANK:
        return _bank_out(session, account_id, amount, concept, category, entity_type, entity_id)
    return _cash_out(session, user, amount, concept, category)
