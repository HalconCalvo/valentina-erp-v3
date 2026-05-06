from typing import Any, List, Optional
from datetime import date, datetime
from pydantic import BaseModel
from fastapi import APIRouter, HTTPException, status
from sqlmodel import select, func, text

# --- TUS DEPENDENCIAS EXACTAS ---
from app.core.deps import SessionDep, CurrentUser

from app.models.treasury import BankAccount, BankTransaction, TransactionType, WeeklyFixedCost
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
    """Listar todas las cuentas bancarias.
    Saldos visibles solo para DIRECTOR y GERENCIA; el resto recibe current_balance = 0.
    """
    statement = select(BankAccount).order_by(BankAccount.id.asc())
    accounts = session.exec(statement).all()

    role = (current_user.role or "").upper()
    if role not in {"DIRECTOR", "GERENCIA"}:
        # Enmascarar saldo para roles no autorizados
        masked = []
        for acc in accounts:
            masked.append(BankAccountResponse(
                id=acc.id,
                name=acc.name,
                account_number=acc.account_number,
                currency=acc.currency,
                initial_balance=0.0,
                current_balance=0.0,
                is_active=acc.is_active,
            ))
        return masked

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
        transaction_type=TransactionType.OUT,
        amount=transfer_in.amount,
        reference=transfer_in.reference,
        description=f"Transferencia hacia {to_account.name}"
    )

    # 2. Sumar a destino
    to_account.current_balance += transfer_in.amount
    in_tx = BankTransaction(
        account_id=to_account.id,
        transaction_type=TransactionType.IN,
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


# ------------------------------------------------------------------
# 5. COSTOS FIJOS SEMANALES (CIERRE JUEVES — KPI TABLERO)
# ------------------------------------------------------------------
class WeeklyFixedCostCreate(BaseModel):
    week_reference_date: date
    admin_payroll: float = 0.0
    design_sales_payroll: float = 0.0
    production_plant_payroll: float = 0.0
    notes: Optional[str] = None


class WeeklyFixedCostRead(BaseModel):
    id: int
    week_reference_date: date
    admin_payroll: float
    design_sales_payroll: float
    production_plant_payroll: float
    notes: Optional[str] = None
    created_by_user_id: int
    created_at: datetime

    class Config:
        from_attributes = True


def _role_upper(user: Any) -> str:
    r = getattr(user, "role", None)
    if r is None:
        return ""
    return str(getattr(r, "value", r)).upper()


_WEEKLY_FIXED_COST_ROLES = frozenset(
    {"GERENCIA", "DIRECTOR", "ADMIN", "ADMINISTRADOR", "FINANCE", "FINANZAS"}
)


@router.post("/weekly-fixed-costs", response_model=WeeklyFixedCostRead)
def create_weekly_fixed_cost(
    payload: WeeklyFixedCostCreate,
    session: SessionDep,
    current_user: CurrentUser,
) -> Any:
    if _role_upper(current_user) not in _WEEKLY_FIXED_COST_ROLES:
        raise HTTPException(status_code=403, detail="Sin permiso para registrar cierre semanal.")
    row = WeeklyFixedCost(
        week_reference_date=payload.week_reference_date,
        admin_payroll=payload.admin_payroll,
        design_sales_payroll=payload.design_sales_payroll,
        production_plant_payroll=payload.production_plant_payroll,
        notes=payload.notes,
        created_by_user_id=current_user.id,
    )
    session.add(row)
    session.commit()
    session.refresh(row)
    return row


@router.get("/weekly-fixed-costs/latest", response_model=Optional[WeeklyFixedCostRead])
def get_latest_weekly_fixed_cost(session: SessionDep, current_user: CurrentUser) -> Any:
    stmt = select(WeeklyFixedCost).order_by(WeeklyFixedCost.week_reference_date.desc())
    row = session.exec(stmt).first()
    return row


# ------------------------------------------------------------------
# COST KPI
# ------------------------------------------------------------------
@router.get("/cost-kpi")
def get_cost_kpi(
    session: SessionDep,
    current_user: CurrentUser,
    week_date: Optional[date] = None,
) -> Any:
    """
    KPI de costo real por pieza producida.

    Semana = Jueves a Miércoles.
    Si no se especifica week_date, usa la semana actual.
    """
    from datetime import timedelta

    today = week_date or date.today()
    days_since_thursday = (today.weekday() - 3) % 7
    week_start = today - timedelta(days=days_since_thursday)
    week_end = week_start + timedelta(days=6)

    # 1. Overhead normal — excluye MAQUILA
    overhead_rows = session.exec(text("""
        SELECT overhead_category, SUM(total_amount) as total
        FROM accounts_payable
        WHERE DATE(created_at) >= :start
          AND DATE(created_at) <= :end
          AND (overhead_category != 'MAQUILA' OR overhead_category IS NULL)
        GROUP BY overhead_category
    """).bindparams(
        start=week_start.isoformat(),
        end=week_end.isoformat()
    )).all()

    overhead_by_category: dict = {}
    overhead_total = 0.0
    for row in overhead_rows:
        cat = row[0] or 'SIN_CATEGORIA'
        amt = float(row[1] or 0)
        overhead_by_category[cat] = amt
        overhead_total += amt

    # MAQUILA — costo directo por instancia (NO se divide entre piezas)
    maquila_rows = session.exec(text("""
        SELECT ap.instance_id, SUM(ap.total_amount) as total,
               p.business_name as provider_name
        FROM accounts_payable ap
        LEFT JOIN providers p ON ap.provider_id = p.id
        WHERE DATE(ap.created_at) >= :start
          AND DATE(ap.created_at) <= :end
          AND ap.overhead_category = 'MAQUILA'
          AND ap.instance_id IS NOT NULL
        GROUP BY ap.instance_id, p.business_name
    """).bindparams(
        start=week_start.isoformat(),
        end=week_end.isoformat()
    )).all()

    maquila_total = 0.0
    maquila_by_instance = []
    for row in maquila_rows:
        amt = float(row[1] or 0)
        maquila_total += amt
        maquila_by_instance.append({
            "instance_id": row[0],
            "total": amt,
            "provider_name": row[2] or "Sin proveedor"
        })

    # 2. Nómina de producción — WeeklyFixedCost de la semana
    weekly = session.exec(
        select(WeeklyFixedCost)
        .where(WeeklyFixedCost.week_reference_date >= week_start)
        .where(WeeklyFixedCost.week_reference_date <= week_end)
        .order_by(WeeklyFixedCost.week_reference_date.desc())
    ).first()

    payroll_production = float(weekly.production_plant_payroll) if weekly else 0.0
    payroll_admin = float(weekly.admin_payroll) if weekly else 0.0
    payroll_design_sales = float(weekly.design_sales_payroll) if weekly else 0.0

    # 3. Piezas producidas — instancias que pasaron a READY en la semana
    from app.models.sales import SalesOrderItemInstance, InstanceStatus

    # Piezas MDF (tienen production_batch_id, no stone_batch_id)
    pieces_mdf = session.exec(
        select(func.count(SalesOrderItemInstance.id))
        .where(SalesOrderItemInstance.production_status == InstanceStatus.READY)
        .where(SalesOrderItemInstance.completed_at >= datetime.combine(week_start, datetime.min.time()))
        .where(SalesOrderItemInstance.completed_at <= datetime.combine(week_end, datetime.max.time()))
        .where(SalesOrderItemInstance.production_batch_id.isnot(None))
        .where(SalesOrderItemInstance.stone_batch_id.is_(None))
    ).one()
    pieces_mdf = int(pieces_mdf or 0)

    # Piezas Piedra (tienen stone_batch_id)
    pieces_stone = session.exec(
        select(func.count(SalesOrderItemInstance.id))
        .where(SalesOrderItemInstance.production_status == InstanceStatus.READY)
        .where(SalesOrderItemInstance.completed_at >= datetime.combine(week_start, datetime.min.time()))
        .where(SalesOrderItemInstance.completed_at <= datetime.combine(week_end, datetime.max.time()))
        .where(SalesOrderItemInstance.stone_batch_id.isnot(None))
    ).one()
    pieces_stone = int(pieces_stone or 0)

    pieces_produced = pieces_mdf + pieces_stone

    # 4. Costo por pieza
    total_cost = overhead_total + payroll_production + maquila_total
    cost_per_piece = round(total_cost / pieces_produced, 2) if pieces_produced > 0 else 0.0

    overhead_per_piece = round(overhead_total / pieces_produced, 2) if pieces_produced > 0 else 0.0
    payroll_per_piece = round(payroll_production / pieces_produced, 2) if pieces_produced > 0 else 0.0

    return {
        "week_start": week_start.isoformat(),
        "week_end": week_end.isoformat(),
        "pieces_produced": pieces_produced,
        "overhead_total": round(overhead_total, 2),
        "payroll_production": round(payroll_production, 2),
        "payroll_admin": round(payroll_admin, 2),
        "payroll_design_sales": round(payroll_design_sales, 2),
        "total_cost": round(total_cost, 2),
        "cost_per_piece": cost_per_piece,
        "overhead_per_piece": overhead_per_piece,
        "payroll_per_piece": payroll_per_piece,
        "overhead_by_category": overhead_by_category,
        "has_weekly_payroll": weekly is not None,
        "pieces_mdf": pieces_mdf,
        "pieces_stone": pieces_stone,
        "maquila_total": round(maquila_total, 2),
        "maquila_by_instance": maquila_by_instance,
    }