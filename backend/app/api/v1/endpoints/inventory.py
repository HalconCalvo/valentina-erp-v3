from typing import Any, List
from datetime import datetime # <--- Asegúrate de importar datetime
import math
from fastapi import APIRouter, HTTPException
from sqlmodel import select

from app.core.deps import SessionDep
# --- IMPORTANTE: Agregamos PurchaseInvoice al import ---
from app.models.inventory import InventoryReception, InventoryTransaction, PurchaseInvoice 
from app.models.material import Material
from app.models.foundations import Provider 
from app.schemas.inventory_schema import ReceptionCreate, ReceptionRead, TransactionRead

router = APIRouter()

@router.post("/reception", response_model=ReceptionRead)
def create_inventory_reception(
    *,
    session: SessionDep,
    reception_in: ReceptionCreate
) -> Any:
    """
    Registra una Recepción de Compra (Factura).
    
    LÓGICA SGP V3:
    1. Crea entrada física de Almacén.
    2. Crea OBLIGACIÓN FINANCIERA (Cuentas por Pagar).
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
            
        # --- LÓGICA DE NORMALIZACIÓN (SGP V3) ---
        factor = material.conversion_factor if material.conversion_factor > 0 else 1.0
        quantity_in_usage_units = item.quantity * factor
        
        # Calcular Costo Unitario con REDONDEO HACIA ARRIBA
        if quantity_in_usage_units > 0:
            raw_cost = item.line_total_cost / quantity_in_usage_units
            new_unit_cost = math.ceil(raw_cost * 100) / 100
            
            if new_unit_cost == 0.0 and item.line_total_cost > 0:
                new_unit_cost = 0.01
        else:
            new_unit_cost = material.current_cost 

        # Actualizar Maestro de Materiales
        material.physical_stock += quantity_in_usage_units
        material.current_cost = new_unit_cost
        session.add(material)
        
        # Registrar Transacción
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

    # ---------------------------------------------------------
    # ### NUEVO: TRIGGER FINANCIERO (CUENTAS POR PAGAR) ###
    # Creamos el espejo de la deuda inmediatamente
    # ---------------------------------------------------------
    
    # Si no viene fecha de vencimiento, asumimos la fecha de factura (Contado)
    effective_due_date = reception_in.due_date if reception_in.due_date else reception_in.invoice_date
    
    new_invoice = PurchaseInvoice(
        reception_id=db_reception.id,
        provider_id=reception_in.provider_id,
        invoice_uuid=reception_in.invoice_number, # Mapeamos el folio como UUID fiscal
        total_amount=reception_in.total_amount,   # Usamos el total de la cabecera (lo que dice el PDF)
        outstanding_balance=reception_in.total_amount, # Nace debiéndose todo
        payment_status="PENDING",
        due_date=effective_due_date
    )
    session.add(new_invoice)
    # ---------------------------------------------------------

    session.commit()
    session.refresh(db_reception)
    return db_reception