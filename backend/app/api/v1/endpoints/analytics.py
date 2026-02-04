from datetime import date
from typing import Any, Dict
from fastapi import APIRouter, Depends
from sqlmodel import SQLModel, select

from app.core.database import get_session
# --- CORRECCIÓN 1: Importar desde FINANCE ---
from app.models.finance import PurchaseInvoice, InvoiceStatus

# Definimos el Schema de respuesta localmente (o podrías importarlo de schemas)
class AccountsPayableStats(SQLModel):
    total_payable: float
    overdue_amount: float
    upcoming_amount: float
    breakdown_by_age: Dict[str, float]

router = APIRouter()

@router.get("/accounts-payable-summary", response_model=AccountsPayableStats)
def get_accounts_payable_summary(session: Any = Depends(get_session)) -> Any:
    """
    Reporte Financiero de Cuentas por Pagar (Pasivos).
    Calcula la deuda total y la desglosa por antigüedad de saldos (vencimiento).
    """
    # 1. Consultar facturas vivas (No Pagadas y No Canceladas)
    # --- CORRECCIÓN 2: Usar el Enum InvoiceStatus y el campo 'status' ---
    statement = select(PurchaseInvoice).where(
        PurchaseInvoice.status != InvoiceStatus.PAID,
        PurchaseInvoice.status != InvoiceStatus.CANCELLED
    )
    invoices = session.exec(statement).all()

    # 2. Inicializar contadores
    total_payable = 0.0
    overdue_amount = 0.0 
    upcoming_amount = 0.0 
    
    breakdown = {
        "current": 0.0, 
        "1-30": 0.0,    
        "31-60": 0.0,
        "61-90": 0.0,
        "+90": 0.0      
    }

    # --- CORRECCIÓN 3: Usar date.today() para ser compatible con el modelo ---
    today = date.today()

    # 3. Procesar lógica de antigüedad
    for inv in invoices:
        # Usamos el campo directo, ya sabemos que existe
        balance = inv.outstanding_balance
        
        # Si el saldo es 0 o negativo (error de datos), lo ignoramos
        if balance <= 0:
            continue

        total_payable += balance

        # Calcular días de vencimiento
        # El modelo garantiza due_date, pero por seguridad validamos
        if inv.due_date:
            # Ambos son 'date', la resta es segura
            delta = today - inv.due_date
            days_overdue = delta.days
        else:
            days_overdue = 0

        if days_overdue <= 0:
            # CUENTA CORRIENTE (Aún no vence)
            upcoming_amount += balance
            breakdown["current"] += balance
        else:
            # CARTERA VENCIDA
            overdue_amount += balance
            
            if days_overdue <= 30:
                breakdown["1-30"] += balance
            elif days_overdue <= 60:
                breakdown["31-60"] += balance
            elif days_overdue <= 90:
                breakdown["61-90"] += balance
            else:
                breakdown["+90"] += balance

    # 4. Retornar DTO lleno
    return AccountsPayableStats(
        total_payable=total_payable,
        overdue_amount=overdue_amount,
        upcoming_amount=upcoming_amount,
        breakdown_by_age=breakdown
    )