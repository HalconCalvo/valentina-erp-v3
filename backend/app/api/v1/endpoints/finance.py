from typing import Any, List
from datetime import datetime, timedelta, date
from fastapi import APIRouter, HTTPException
from sqlmodel import select, func

from app.core.deps import SessionDep, CurrentUser
from app.models.finance import (
    SupplierPayment, 
    PaymentStatus, 
    PurchaseInvoice, 
    InvoiceStatus, 
    PaymentMethod
)
from app.models.foundations import Provider
from app.schemas.finance_schema import (
    PaymentRequestCreate, 
    PaymentApprovalUpdate, 
    SupplierPaymentRead, 
    PendingInvoiceRead,
    AccountsPayableDashboardStats
)

router = APIRouter()

# ------------------------------------------------------------------
# 1. SOLICITAR UN PAGO (Gerencia)
# ------------------------------------------------------------------
@router.post("/payments/request", response_model=SupplierPaymentRead)
def request_supplier_payment(
    *,
    session: SessionDep,
    current_user: CurrentUser,
    payment_in: PaymentRequestCreate
) -> Any:
    """
    Crea una solicitud de pago. Verifica que no se exceda el saldo pendiente.
    """
    # 1. Buscar la factura
    invoice = session.get(PurchaseInvoice, payment_in.invoice_id)
    if not invoice:
        raise HTTPException(status_code=404, detail="Factura no encontrada")

    # 2. Validar Sobregiros (Suma de lo pagado + lo pendiente de aprobar)
    statement = select(func.sum(SupplierPayment.amount)).where(
        SupplierPayment.purchase_invoice_id == invoice.id,
        SupplierPayment.status.in_([PaymentStatus.PENDING, PaymentStatus.APPROVED, PaymentStatus.PAID])
    )
    already_committed = session.exec(statement).one() or 0.0
    
    # El saldo real disponible considerando solicitudes en vuelo
    available_to_request = invoice.total_amount - already_committed
    
    # Tolerancia de centavos por punto flotante
    if payment_in.amount > (available_to_request + 0.01):
        raise HTTPException(
            status_code=400, 
            detail=f"Monto inválido. Disponible real: ${available_to_request:,.2f}"
        )

    # 3. Crear el registro
    payment = SupplierPayment(
        purchase_invoice_id=payment_in.invoice_id,
        provider_id=invoice.provider_id,
        amount=payment_in.amount,
        payment_date=payment_in.payment_date,
        payment_method=payment_in.payment_method,
        reference=payment_in.reference,
        notes=payment_in.notes,
        status=PaymentStatus.PENDING,
        created_by_user_id=current_user.id
    )
    
    session.add(payment)
    session.commit()
    session.refresh(payment)
    return payment

# ------------------------------------------------------------------
# 1.1 [NUEVO] EDITAR SOLICITUD DE PAGO (Gerencia)
# ------------------------------------------------------------------
@router.put("/payments/request/{payment_id}", response_model=SupplierPaymentRead)
def update_payment_request(
    *,
    session: SessionDep,
    current_user: CurrentUser,
    payment_id: int,
    payment_in: PaymentRequestCreate
) -> Any:
    """
    Actualiza una solicitud de pago existente (Solo si sigue PENDING).
    """
    # 1. Buscar el pago
    payment = session.get(SupplierPayment, payment_id)
    if not payment:
        raise HTTPException(status_code=404, detail="Solicitud no encontrada")

    # 2. Validar estado (Solo se pueden editar las pendientes)
    if payment.status != PaymentStatus.PENDING:
        raise HTTPException(status_code=400, detail="No se puede editar una solicitud que ya fue procesada")

    # 3. Buscar la factura asociada
    invoice = session.get(PurchaseInvoice, payment.purchase_invoice_id)
    if not invoice:
        raise HTTPException(status_code=404, detail="Factura asociada no encontrada")

    # 4. Validar Sobregiros (Restando primero el monto que estamos modificando)
    statement = select(func.sum(SupplierPayment.amount)).where(
        SupplierPayment.purchase_invoice_id == invoice.id,
        SupplierPayment.status.in_([PaymentStatus.PENDING, PaymentStatus.APPROVED, PaymentStatus.PAID])
    )
    already_committed_total = session.exec(statement).one() or 0.0
    
    # Restamos el monto actual de este pago para liberar ese "cupo" antes de validar el nuevo monto
    committed_others = already_committed_total - payment.amount
    available_to_request = invoice.total_amount - committed_others

    if payment_in.amount > (available_to_request + 0.01):
        raise HTTPException(
            status_code=400, 
            detail=f"Monto inválido. Disponible real al modificar: ${available_to_request:,.2f}"
        )

    # 5. Actualizar campos
    payment.amount = payment_in.amount
    payment.payment_date = payment_in.payment_date
    payment.payment_method = payment_in.payment_method
    payment.reference = payment_in.reference
    payment.notes = payment_in.notes
    
    session.add(payment)
    session.commit()
    session.refresh(payment)
    return payment

# ------------------------------------------------------------------
# 1.2 [NUEVO] ELIMINAR SOLICITUD DE PAGO (Gerencia)
# ------------------------------------------------------------------
@router.delete("/payments/request/{payment_id}")
def cancel_payment_request(
    *,
    session: SessionDep,
    current_user: CurrentUser,
    payment_id: int
) -> Any:
    """
    Elimina una solicitud de pago (Solo si sigue PENDING).
    """
    payment = session.get(SupplierPayment, payment_id)
    if not payment:
        raise HTTPException(status_code=404, detail="Solicitud no encontrada")

    if payment.status != PaymentStatus.PENDING:
        raise HTTPException(status_code=400, detail="No se puede eliminar una solicitud ya procesada")

    session.delete(payment)
    session.commit()
    return {"message": "Solicitud eliminada correctamente"}

# ------------------------------------------------------------------
# 2. APROBAR O RECHAZAR PAGO (Dirección)
# ------------------------------------------------------------------
@router.put("/payments/{payment_id}/status", response_model=SupplierPaymentRead)
def update_payment_status(
    *,
    session: SessionDep,
    current_user: CurrentUser, # Solo Dirección debería poder hacer esto
    payment_id: int,
    status_in: PaymentApprovalUpdate
) -> Any:
    payment = session.get(SupplierPayment, payment_id)
    if not payment:
        raise HTTPException(status_code=404, detail="Pago no encontrado")

    if payment.status != PaymentStatus.PENDING:
        raise HTTPException(status_code=400, detail="Este pago ya fue procesado (Aprobado o Rechazado).")

    payment.status = status_in.status
    payment.approved_by_user_id = current_user.id
    
    # Si se aprueba, afectamos el saldo de la factura
    if status_in.status == PaymentStatus.APPROVED:
        invoice = session.get(PurchaseInvoice, payment.purchase_invoice_id)
        if invoice:
            invoice.outstanding_balance -= payment.amount
            
            # Ajuste de precisión
            if invoice.outstanding_balance < 0.01:
                invoice.outstanding_balance = 0.0
            
            # Actualizar estatus de factura
            if invoice.outstanding_balance == 0:
                invoice.status = InvoiceStatus.PAID
            else:
                invoice.status = InvoiceStatus.PARTIAL
            
            session.add(invoice)

    session.add(payment)
    session.commit()
    session.refresh(payment)
    return payment

# ------------------------------------------------------------------
# 3. KPI / DASHBOARD (Lógica del Viernes de Corte)
# ------------------------------------------------------------------
@router.get("/payable-stats", response_model=AccountsPayableDashboardStats)
def get_payable_dashboard_stats(session: SessionDep) -> Any:
    today = date.today()
    
    # Algoritmo del Viernes
    weekday = today.weekday()
    days_until_friday = 4 - weekday
    if days_until_friday < 0: days_until_friday += 7
    cutoff_date = today + timedelta(days=days_until_friday)
    next_period_limit = cutoff_date + timedelta(days=15)

    # Obtener facturas vivas
    statement = select(PurchaseInvoice).where(
        PurchaseInvoice.status != InvoiceStatus.PAID,
        PurchaseInvoice.status != InvoiceStatus.CANCELLED
    )
    invoices = session.exec(statement).all()
    
    # --- INICIALIZAR VARIABLES (Montos y Contadores) ---
    var_overdue_amount = 0.0
    var_overdue_count = 0      # <--- Nuevo
    
    var_next_period_amount = 0.0
    var_next_period_count = 0  # <--- Nuevo
    
    var_future_amount = 0.0
    var_future_count = 0       # <--- Nuevo
    
    for inv in invoices:
        saldo = inv.outstanding_balance
        if saldo <= 0: continue 
        
        due = inv.due_date 
        
        if due <= cutoff_date:
            var_overdue_amount += saldo
            var_overdue_count += 1     # Contar
        elif due <= next_period_limit:
            var_next_period_amount += saldo
            var_next_period_count += 1 # Contar
        else:
            var_future_amount += saldo
            var_future_count += 1      # Contar
            
    # Solicitudes pendientes de firma
    pending_approvals = session.exec(
        select(func.count(SupplierPayment.id)).where(SupplierPayment.status == PaymentStatus.PENDING)
    ).one()

    return AccountsPayableDashboardStats(
        overdue_amount=var_overdue_amount,
        overdue_count=var_overdue_count,           # Retornar
        
        next_period_amount=var_next_period_amount,
        next_period_count=var_next_period_count,   # Retornar
        
        future_amount=var_future_amount,
        future_count=var_future_count,             # Retornar
        
        total_pending_approval=pending_approvals
    )

# ------------------------------------------------------------------
# 4. LISTADO DE SOLICITUDES PENDIENTES (Para el Admin)
# ------------------------------------------------------------------
@router.get("/payments/pending-approvals", response_model=List[SupplierPaymentRead])
def get_pending_approvals(session: SessionDep) -> Any:
    statement = select(SupplierPayment).where(SupplierPayment.status == PaymentStatus.PENDING)
    payments = session.exec(statement).all()
    
    results = []
    for p in payments:
        prov = session.get(Provider, p.provider_id)
        # Obtenemos factura para mostrar folio
        inv = session.get(PurchaseInvoice, p.purchase_invoice_id)
        
        p_read = SupplierPaymentRead(
            id=p.id,
            purchase_invoice_id=p.purchase_invoice_id,
            provider_id=p.provider_id,
            provider_name=prov.business_name if prov else "Desconocido",
            invoice_folio=inv.invoice_number if inv else "S/N", 
            amount=p.amount,
            payment_date=p.payment_date,
            payment_method=p.payment_method,
            reference=p.reference,
            notes=p.notes,
            status=p.status,
            created_at=p.created_at
        )
        results.append(p_read)
        
    return results

# ------------------------------------------------------------------
# 5. LISTADO DE FACTURAS PENDIENTES (Mesa de Control)
# ------------------------------------------------------------------
@router.get("/invoices/pending", response_model=List[PendingInvoiceRead])
def get_pending_invoices(session: SessionDep) -> Any:
    statement = select(PurchaseInvoice).where(
        PurchaseInvoice.status != InvoiceStatus.PAID,
        PurchaseInvoice.status != InvoiceStatus.CANCELLED
    )
    invoices = session.exec(statement).all()
    
    results = []
    for inv in invoices:
        if inv.outstanding_balance <= 0:
            continue
            
        prov = session.get(Provider, inv.provider_id)
        
        results.append(PendingInvoiceRead(
            id=inv.id,
            provider_name=prov.business_name if prov else "Proveedor Desconocido",
            invoice_number=inv.invoice_number, 
            due_date=inv.due_date,
            total_amount=inv.total_amount,
            outstanding_balance=inv.outstanding_balance
        ))
        
    # Ordenar por fecha de vencimiento
    results.sort(key=lambda x: str(x.due_date))
    
    return results