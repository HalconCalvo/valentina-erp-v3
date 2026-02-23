from typing import Any, List
from datetime import datetime, date
import math
from fastapi import APIRouter, HTTPException
from sqlmodel import select

from app.core.deps import SessionDep
from app.models.inventory import InventoryReception, InventoryTransaction 
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

    # 4. TRIGGER FINANCIERO 
    if reception_in.due_date:
        final_due_date = reception_in.due_date
    else:
        final_due_date = reception_in.invoice_date

    new_invoice = PurchaseInvoice(
        provider_id=reception_in.provider_id,
        invoice_number=reception_in.invoice_number, 
        issue_date=reception_in.invoice_date,       
        due_date=final_due_date,
        total_amount=reception_in.total_amount,
        outstanding_balance=reception_in.total_amount,
        status=InvoiceStatus.PENDING 
    )
    session.add(new_invoice)

    session.commit()
    session.refresh(db_reception)
    return db_reception

# ------------------------------------------------------------------
# ENDPOINT: Resumen Financiero 
# ------------------------------------------------------------------
@router.get("/financial-summary", response_model=AccountsPayableStats)
def get_financial_summary(session: SessionDep) -> Any:
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
    breakdown = {"1-30": 0.0, "31-60": 0.0, "+90": 0.0}

    for inv in invoices:
        debt = inv.outstanding_balance
        if debt <= 0: continue

        total_payable += debt
        total_docs += 1

        due_date_normalized = inv.due_date 
        if isinstance(inv.due_date, datetime):
             due_date_normalized = inv.due_date.date()

        days_diff = (today - due_date_normalized).days

        if days_diff > 0:
            overdue_amount += debt
            if days_diff <= 30: breakdown["1-30"] += debt
            elif days_diff <= 90: breakdown["31-60"] += debt 
            else: breakdown["+90"] += debt
        else:
            upcoming_amount += debt

    return AccountsPayableStats(
        total_payable=total_payable,
        total_documents=total_docs,
        overdue_amount=overdue_amount,
        upcoming_amount=upcoming_amount,
        breakdown_by_age=breakdown
    )

# ------------------------------------------------------------------
# HISTORIAL Y CONSULTA DE RECEPCIONES (VERSIÓN SEGURA A PRUEBA DE BALAS)
# ------------------------------------------------------------------
@router.get("/receptions", response_model=List[Any])
def get_receptions(session: SessionDep) -> Any:
    """
    Obtiene la lista histórica de todas las recepciones de forma segura.
    Incluye el estatus de pago cruzando datos con Finanzas.
    """
    statement = select(InventoryReception).order_by(InventoryReception.id.desc())
    receptions = session.exec(statement).all()
    
    results = []
    for rec in receptions:
        prov = session.get(Provider, rec.provider_id) if rec.provider_id else None
        
        # --- NUEVO: Puente con Finanzas para saber si ya se pagó ---
        inv_stmt = select(PurchaseInvoice).where(
            PurchaseInvoice.invoice_number == rec.invoice_number,
            PurchaseInvoice.provider_id == rec.provider_id
        )
        invoice = session.exec(inv_stmt).first()
        payment_status = invoice.status if invoice else "PENDING"
        # -------------------------------------------------------------

        fecha_creacion = getattr(rec, 'created_at', None)
        if not fecha_creacion:
            fecha_creacion = rec.invoice_date
            
        results.append({
            "id": rec.id,
            "provider_name": prov.business_name if prov else "Desconocido",
            "invoice_number": rec.invoice_number,
            "invoice_date": rec.invoice_date,
            "total_amount": rec.total_amount,
            "status": getattr(rec, 'status', 'COMPLETED'),
            "payment_status": payment_status, # <--- Enviamos el estatus de pago al Frontend
            "created_at": fecha_creacion
        })
        
    return results

@router.get("/receptions/{reception_id}", response_model=Any)
def get_reception_detail(reception_id: int, session: SessionDep) -> Any:
    """
    Obtiene el detalle completo de una recepción, cruzando los datos 
    de forma segura y manual.
    """
    rec = session.get(InventoryReception, reception_id)
    if not rec:
        raise HTTPException(status_code=404, detail="Recepción no encontrada")
        
    prov = session.get(Provider, rec.provider_id) if rec.provider_id else None
    
    statement = select(InventoryTransaction).where(InventoryTransaction.reception_id == reception_id)
    transactions = session.exec(statement).all()
    
    items = []
    for tx in transactions:
        mat = session.get(Material, tx.material_id)
        if mat:
            factor = mat.conversion_factor if mat.conversion_factor > 0 else 1
            purchase_qty = tx.quantity / factor

            items.append({
                "sku": mat.sku,
                "name": mat.name,
                "category": mat.category,
                "purchase_unit": mat.purchase_unit,
                "usage_unit": mat.usage_unit,
                "conversion_factor": factor,
                "purchase_quantity": purchase_qty,
                "usage_quantity": tx.quantity,
                "unit_cost": tx.unit_cost,
                "subtotal": tx.subtotal
            })
            
    fecha_creacion = getattr(rec, 'created_at', None)
    if not fecha_creacion:
        fecha_creacion = rec.invoice_date
            
    return {
        "id": rec.id,
        "provider_name": prov.business_name if prov else "Desconocido",
        "invoice_number": rec.invoice_number,
        "invoice_date": rec.invoice_date,
        "total_amount": rec.total_amount,
        "notes": getattr(rec, 'notes', ''),
        "created_at": fecha_creacion,
        "items": items
    }

# ------------------------------------------------------------------
# CANCELACIÓN DE RECEPCIÓN (REVERSIÓN DE INVENTARIO Y LIBERACIÓN DE FOLIO)
# ------------------------------------------------------------------
@router.delete("/receptions/{reception_id}", response_model=Any)
def cancel_reception(reception_id: int, session: SessionDep) -> Any:
    """
    Cancela una recepción, revierte el stock, restaura el último costo conocido,
    cancela la cuenta por pagar y LIBERA EL FOLIO para volver a capturarse.
    """
    # 1. Buscar la Recepción
    rec = session.get(InventoryReception, reception_id)
    if not rec:
        raise HTTPException(status_code=404, detail="Recepción no encontrada")
    
    # Si ya está cancelada, no hacer nada
    if getattr(rec, 'status', '') == "CANCELLED":
        raise HTTPException(status_code=400, detail="Esta recepción ya fue cancelada anteriormente.")

    # 2. Verificar la Factura en Finanzas (No podemos cancelar si ya se pagó)
    statement = select(PurchaseInvoice).where(
        PurchaseInvoice.invoice_number == rec.invoice_number,
        PurchaseInvoice.provider_id == rec.provider_id
    )
    invoice = session.exec(statement).first()
    
    if invoice and invoice.status == InvoiceStatus.PAID:
        raise HTTPException(
            status_code=400, 
            detail="No se puede cancelar: La factura ya fue pagada o tiene abonos en Tesorería. Contacte a Dirección."
        )

    # 3. Revertir el Inventario y los Costos
    statement = select(InventoryTransaction).where(InventoryTransaction.reception_id == reception_id)
    transactions = session.exec(statement).all()

    for tx in transactions:
        mat = session.get(Material, tx.material_id)
        if mat:
            # A) Restar el stock que había entrado
            mat.physical_stock -= tx.quantity
            if mat.physical_stock < 0:
                mat.physical_stock = 0.0 # Blindaje por si hicieron movimientos manuales
            
            # B) Eliminar esta transacción específica
            session.delete(tx)
            session.flush() 
            
            # C) Buscar el ÚLTIMO costo de este material
            last_tx_stmt = select(InventoryTransaction).where(
                InventoryTransaction.material_id == mat.id,
                InventoryTransaction.transaction_type == "PURCHASE_ENTRY"
            ).order_by(InventoryTransaction.id.desc())
            
            last_tx = session.exec(last_tx_stmt).first()
            
            # Restaurar el costo
            if last_tx:
                mat.current_cost = last_tx.unit_cost
            else:
                mat.current_cost = 0.0 
            
            session.add(mat)

    # 4. Cancelar los Documentos y LIBERAR EL FOLIO (Efecto Mariposa)
    original_invoice_number = rec.invoice_number
    liberated_folio = f"{original_invoice_number}-CANC-{rec.id}"
    
    rec.status = "CANCELLED"
    rec.invoice_number = liberated_folio
    session.add(rec)

    if invoice:
        invoice.status = InvoiceStatus.CANCELLED
        invoice.outstanding_balance = 0.0
        invoice.invoice_number = liberated_folio
        session.add(invoice)

    # 5. Guardar todo
    session.commit()
    
    return {"message": f"Recepción cancelada y folio {original_invoice_number} liberado con éxito"}