from typing import Optional, List
from sqlmodel import Field, SQLModel, Relationship
from datetime import datetime
import enum

class TransactionType(str, enum.Enum):
    IN = "IN"             # Ingreso
    OUT = "OUT"           # Egreso
    TRANSFER = "TRANSFER" # Transferencia interna

class BankAccount(SQLModel, table=True):
    __tablename__ = "bank_accounts"

    id: Optional[int] = Field(default=None, primary_key=True)
    name: str = Field(index=True)
    account_number: str
    currency: str = Field(default="MXN")
    initial_balance: float = Field(default=0.0)
    current_balance: float = Field(default=0.0)
    is_active: bool = Field(default=True)

    # Relación con transacciones
    transactions: List["BankTransaction"] = Relationship(
        back_populates="account",
        sa_relationship_kwargs={"cascade": "all, delete-orphan"}
    )

class BankTransaction(SQLModel, table=True):
    __tablename__ = "bank_transactions"

    id: Optional[int] = Field(default=None, primary_key=True)
    account_id: int = Field(foreign_key="bank_accounts.id")
    transaction_type: TransactionType
    amount: float
    reference: Optional[str] = None
    description: Optional[str] = None
    transaction_date: datetime = Field(default_factory=datetime.now)
    
    # Rastreabilidad cruzada
    related_entity_type: Optional[str] = None
    related_entity_id: Optional[int] = None

    account: Optional[BankAccount] = Relationship(back_populates="transactions")