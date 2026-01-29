from datetime import datetime
from typing import Any
from fastapi import APIRouter
from sqlmodel import select

from app.core.deps import SessionDep
from app.models.inventory import PurchaseInvoice
from app.schemas.inventory_schema import AccountsPayableStats

router = APIRouter()

@router.get("/accounts-payable-summary", response_model=AccountsPayableStats)
def get_accounts_payable_summary(session: SessionDep) -> Any:
    """
    Reporte Financiero de Cuentas por Pagar (Pasivos).
    Calcula la deuda total y la desglosa por antigüedad de saldos (vencimiento).
    """
    
    # 1. Consultar facturas vivas (Pendientes o Parciales)
    # Ignoramos las pagadas ("PAID")
    statement = select(PurchaseInvoice).where(PurchaseInvoice.payment_status != "PAID")
    invoices = session.exec(statement).all()

    # 2. Inicializar contadores
    total_payable = 0.0
    overdue_amount = 0.0 # Vencido
    upcoming_amount = 0.0 # Por vencer (Corriente)
    
    breakdown = {
        "current": 0.0, # No ha vencido
        "1-30": 0.0,    # Vencido hace 1 a 30 días
        "31-60": 0.0,
        "61-90": 0.0,
        "+90": 0.0      # Problema crítico
    }

    now = datetime.now()

    # 3. Procesar lógica de antigüedad
    for inv in invoices:
        # Usamos el saldo pendiente, no el total original (por si hubo abonos parciales)
        balance = inv.outstanding_balance
        total_payable += balance

        # Calcular días de vencimiento
        # Si due_date es hoy o futuro, days_overdue será <= 0
        if inv.due_date:
            delta = now - inv.due_date
            days_overdue = delta.days
        else:
            # Si por error no hay fecha, asumimos que venció hoy
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