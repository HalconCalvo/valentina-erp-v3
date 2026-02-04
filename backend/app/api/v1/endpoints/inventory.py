from typing import Any, List
from datetime import datetime, date
import math
from fastapi import APIRouter, HTTPException
from sqlmodel import select

from app.core.deps import SessionDep
# --- CORRECCIÓN 1: Importaciones separadas ---
# InventoryReception se queda en inventory
from app.models.inventory import InventoryReception, InventoryTransaction 
# PurchaseInvoice viene de finance
from app.models.finance import PurchaseInvoice, InvoiceStatus 

from app.models.material import Material
from app.models.foundations import Provider 
from app.schemas.inventory_schema import ReceptionCreate, ReceptionRead, AccountsPayableStats

router = APIRouter()

@router.post("/reception", response_model=ReceptionRead)
def create_inventory_reception(
    *,
    session: SessionDep,
    reception_in: ReceptionCreate
) -> Any:
    """
    Registra una Recepción de Compra (Factura) y detona la deuda financiera.
    """
    
    # 1. Validar Proveedor
    provider = session.get(Provider, reception_in.provider_id)
    if not provider:
        raise HTTPException(status_code=404, detail="Proveedor no encontrado")

    # 2. Crear Cabecera Física (Reception)
    db_reception = InventoryReception(
        provider_id=reception_in.provider_id,
        invoice_number=reception_in.invoice_number,
        invoice_date=reception_in.invoice_date,
        total_amount=reception_in.total_amount,
        notes=reception_in.notes,
        status="COMPLETED"
    )
    session.add(db_reception)
    session.commit()
    session.refresh(db_reception)

    # 3. Procesar Items (Movimiento de Stock)
    calculated_total = 0.0
    
    for item in reception_in.items:
        material = session.get(Material, item.material_id)
        if not material:
            continue 

        if item.quantity <= 0:
            raise HTTPException(status_code=400, detail=f"Cantidad inválida para material ID {item.material_id}")
            
        # Normalización
        factor = material.conversion_factor if material.conversion_factor > 0 else 1.0
        quantity_in_usage_units = item.quantity * factor
        
        # Costo Unitario
        if quantity_in_usage_units > 0:
            raw_cost = item.line_total_cost / quantity_in_usage_units
            new_unit_cost = math.ceil(raw_cost * 100) / 100
            
            if new_unit_cost == 0.0 and item.line_total_cost > 0:
                new_unit_cost = 0.01
        else:
            new_unit_cost = material.current_cost 

        # Actualizar Maestro
        material.physical_stock += quantity_in_usage_units
        material.current_cost = new_unit_cost
        session.add(material)
        
        # Transacción
        db_transaction = InventoryTransaction(
            reception_id=db_reception.id,
            material_id=material.id,
            quantity=quantity_in_usage_units,
            unit_cost=new_unit_cost,
            subtotal=item.line_total_cost,
            transaction_type="PURCHASE_ENTRY"
        )
        session.add(db_transaction)
        
        calculated_total += item.line_total_cost

    # 4. TRIGGER FINANCIERO (Corregido para coincidir con finance.py)
    # Calculamos fecha de vencimiento basada en días crédito del proveedor si no viene explícita
    if reception_in.due_date:
        final_due_date = reception_in.due_date
    else:
        # Lógica simple: fecha factura + días crédito (si existiera helper, aquí usamos la fecha factura por defecto)
        final_due_date = reception_in.invoice_date

    new_invoice = PurchaseInvoice(
        # reception_id=db_reception.id, # NOTA: Se eliminó porque el modelo Finance aprobado no tenía este campo.
        provider_id=reception_in.provider_id,
        invoice_number=reception_in.invoice_number, # Corrección: nombre del campo
        issue_date=reception_in.invoice_date,       # Corrección: campo obligatorio
        due_date=final_due_date,
        total_amount=reception_in.total_amount,
        outstanding_balance=reception_in.total_amount,
        status=InvoiceStatus.PENDING # Corrección: Uso de Enum
    )
    session.add(new_invoice)

    session.commit()
    session.refresh(db_reception)
    return db_reception

# ------------------------------------------------------------------
# ENDPOINT: Resumen Financiero (Legacy en este archivo)
# Nota: Ahora existe /api/v1/finance/payable-stats que es más completo
# ------------------------------------------------------------------
@router.get("/financial-summary", response_model=AccountsPayableStats)
def get_financial_summary(session: SessionDep) -> Any:
    """
    Calcula el estado de Cuentas por Pagar.
    """
    # Corrección: Usar InvoiceStatus y el campo 'status' correcto
    statement = select(PurchaseInvoice).where(
        PurchaseInvoice.status != InvoiceStatus.PAID,
        PurchaseInvoice.status != InvoiceStatus.CANCELLED
    )
    invoices = session.exec(statement).all()

    today = date.today()
    
    total_payable = 0.0
    total_docs = 0
    overdue_amount = 0.0
    upcoming_amount = 0.0
    
    breakdown = {
        "1-30": 0.0,
        "31-60": 0.0,
        "+90": 0.0
    }

    for inv in invoices:
        debt = inv.outstanding_balance
        if debt <= 0:
            continue

        total_payable += debt
        total_docs += 1

        # --- CORRECCIÓN DE FECHA ---
        # Aseguramos que sea 'date' y no 'datetime'
        due_date_normalized = inv.due_date # En el modelo finance es 'date', así que debería estar bien.
        if isinstance(inv.due_date, datetime):
             due_date_normalized = inv.due_date.date()

        # Ahora sí podemos restar sin error
        days_diff = (today - due_date_normalized).days

        if days_diff > 0:
            # Vencida
            overdue_amount += debt
            if days_diff <= 30:
                breakdown["1-30"] += debt
            elif days_diff <= 90:
                breakdown["31-60"] += debt 
            else:
                breakdown["+90"] += debt
        else:
            # Por vencer
            upcoming_amount += debt

    return AccountsPayableStats(
        total_payable=total_payable,
        total_documents=total_docs,
        overdue_amount=overdue_amount,
        upcoming_amount=upcoming_amount,
        breakdown_by_age=breakdown
    )