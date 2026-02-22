from typing import Any, List
from fastapi import APIRouter, HTTPException, status
from sqlmodel import select

# --- TUS DEPENDENCIAS EXACTAS ---
from app.core.deps import SessionDep, CurrentUser

from app.models.treasury import BankAccount, BankTransaction, TransactionType
from app.schemas.treasury_schema import (
    BankAccountCreate, BankAccountResponse, 
    BankTransactionCreate, BankTransactionResponse,
    TransferCreate
)

router = APIRouter()

# ------------------------------------------------------------------
# 1. CUENTAS BANCARIAS
# ------------------------------------------------------------------
@router.post("/accounts", response_model=BankAccountResponse)
def create_bank_account(
    *,
    session: SessionDep,
    current_user: CurrentUser,
    account_in: BankAccountCreate
) -> Any:
    """Crear una nueva cuenta bancaria."""
    account = BankAccount(**account_in.model_dump())
    account.current_balance = account_in.initial_balance
    
    session.add(account)
    session.commit()
    session.refresh(account)
    return account

@router.get("/accounts", response_model=List[BankAccountResponse])
def get_bank_accounts(session: SessionDep, current_user: CurrentUser) -> Any:
    """Listar todas las cuentas bancarias."""
    statement = select(BankAccount)
    accounts = session.exec(statement).all()
    return accounts

# ------------------------------------------------------------------
# 2. TRANSACCIONES MANUALES (INGRESOS/EGRESOS)
# ------------------------------------------------------------------
@router.post("/transactions", response_model=BankTransactionResponse)
def create_transaction(
    *,
    session: SessionDep,
    current_user: CurrentUser,
    transaction_in: BankTransactionCreate
) -> Any:
    """Crear un movimiento manual (Ingreso o Egreso)."""
    account = session.get(BankAccount, transaction_in.account_id)
    if not account:
        raise HTTPException(status_code=404, detail="Cuenta bancaria no encontrada")
        
    db_transaction = BankTransaction(**transaction_in.model_dump())
    
    # Lógica financiera
    if transaction_in.transaction_type == TransactionType.IN:
        account.current_balance += transaction_in.amount
    elif transaction_in.transaction_type == TransactionType.OUT:
        if account.current_balance < transaction_in.amount:
            raise HTTPException(status_code=400, detail="Saldo insuficiente en la cuenta")
        account.current_balance -= transaction_in.amount
        
    session.add(db_transaction)
    session.add(account)
    session.commit()
    session.refresh(db_transaction)
    return db_transaction
    
# ------------------------------------------------------------------
# 3. TRANSFERENCIAS ENTRE CUENTAS
# ------------------------------------------------------------------
@router.post("/transfer")
def transfer_funds(
    *,
    session: SessionDep,
    current_user: CurrentUser,
    transfer_in: TransferCreate
) -> Any:
    """Mover dinero de una cuenta a otra."""
    if transfer_in.from_account_id == transfer_in.to_account_id:
        raise HTTPException(status_code=400, detail="No puedes transferir a la misma cuenta")
        
    from_account = session.get(BankAccount, transfer_in.from_account_id)
    to_account = session.get(BankAccount, transfer_in.to_account_id)
    
    if not from_account or not to_account:
        raise HTTPException(status_code=404, detail="Una de las cuentas no existe")
        
    if from_account.current_balance < transfer_in.amount:
        raise HTTPException(status_code=400, detail="Saldo insuficiente en la cuenta origen")
        
    # 1. Restar de origen
    from_account.current_balance -= transfer_in.amount
    out_tx = BankTransaction(
        account_id=from_account.id,
        transaction_type=TransactionType.TRANSFER,
        amount=transfer_in.amount,
        reference=transfer_in.reference,
        description=f"Transferencia hacia {to_account.name}"
    )
    
    # 2. Sumar a destino
    to_account.current_balance += transfer_in.amount
    in_tx = BankTransaction(
        account_id=to_account.id,
        transaction_type=TransactionType.TRANSFER,
        amount=transfer_in.amount,
        reference=transfer_in.reference,
        description=f"Transferencia desde {from_account.name}"
    )
    
    session.add(from_account)
    session.add(to_account)
    session.add(out_tx)
    session.add(in_tx)
    session.commit()
    
    return {"message": "Transferencia exitosa", "amount": transfer_in.amount}

# ------------------------------------------------------------------
# 4. HISTORIAL DE UNA CUENTA (NUEVO)
# ------------------------------------------------------------------
@router.get("/accounts/{account_id}/transactions", response_model=List[BankTransactionResponse])
def get_account_transactions(
    account_id: int,
    session: SessionDep,
    current_user: CurrentUser
) -> Any:
    """Obtener el historial de movimientos de una cuenta específica."""
    # Verificamos que la cuenta exista
    account = session.get(BankAccount, account_id)
    if not account:
        raise HTTPException(status_code=404, detail="Cuenta bancaria no encontrada")
        
    # Traemos todos sus movimientos, ordenados del más nuevo al más viejo (por ID)
    statement = select(BankTransaction).where(BankTransaction.account_id == account_id).order_by(BankTransaction.id.desc())
    transactions = session.exec(statement).all()
    
    return transactions