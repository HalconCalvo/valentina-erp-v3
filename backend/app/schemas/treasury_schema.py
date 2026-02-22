from pydantic import BaseModel, Field
from typing import Optional, List
from datetime import datetime
from app.models.treasury import TransactionType

# --- ESQUEMAS PARA CUENTAS BANCARIAS ---

class BankAccountBase(BaseModel):
    name: str = Field(..., description="Nombre descriptivo de la cuenta, ej: Banorte MXN")
    account_number: str = Field(..., description="Número de cuenta bancaria")
    currency: str = Field(default="MXN")
    initial_balance: float = Field(default=0.0)

class BankAccountCreate(BankAccountBase):
    pass

class BankAccountUpdate(BaseModel):
    name: Optional[str] = None
    account_number: Optional[str] = None
    is_active: Optional[bool] = None

class BankAccountResponse(BankAccountBase):
    id: int
    current_balance: float
    is_active: bool

    class Config:
        from_attributes = True

# --- ESQUEMAS PARA TRANSACCIONES (MOVIMIENTOS) ---

class BankTransactionBase(BaseModel):
    transaction_type: TransactionType
    amount: float = Field(..., gt=0, description="El monto debe ser mayor a 0")
    reference: Optional[str] = None
    description: Optional[str] = None
    related_entity_type: Optional[str] = None
    related_entity_id: Optional[int] = None

class BankTransactionCreate(BankTransactionBase):
    account_id: int

class BankTransactionResponse(BankTransactionBase):
    id: int
    account_id: int
    transaction_date: datetime

    class Config:
        from_attributes = True

# --- ESQUEMA PARA TRANSFERENCIAS INTERNAS ---

class TransferCreate(BaseModel):
    from_account_id: int
    to_account_id: int
    amount: float = Field(..., gt=0)
    reference: Optional[str] = "Transferencia entre cuentas"
    description: Optional[str] = None