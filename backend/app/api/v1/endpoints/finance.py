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
from app.models.treasury import BankAccount, BankTransaction, TransactionType

from app.schemas.finance_schema import (
    PaymentRequestCreate, 
    PaymentApprovalUpdate, 
    SupplierPaymentRead, 
    PendingInvoiceRead,
    AccountsPayableDashboardStats
)

router = APIRouter()

# ------------------------------------------------------------------
# 1. SOLICITAR UN PAGO (Administración)
# ------------------------------------------------------------------
@router.post("/payments/request", response_model=SupplierPaymentRead)
def request_supplier_payment(
    *,
    session: SessionDep,
    current_user: CurrentUser,
    payment_in: PaymentRequestCreate
) -> Any:
    """
    Paso 1: Crea una solicitud de pago. 
    Verifica que no se exceda el saldo pendiente.
    """
    invoice = session.get(PurchaseInvoice, payment_in.invoice_id)
    if not invoice:
        raise HTTPException(status_code=404, detail="Factura no encontrada")

    # Validar Sobregiros (Suma de lo pagado + lo pendiente de aprobar/ejecutar)
    statement = select(func.sum(SupplierPayment.amount)).where(
        SupplierPayment.purchase_invoice_id == invoice.id,
        SupplierPayment.status.in_([PaymentStatus.PENDING, PaymentStatus.APPROVED, PaymentStatus.PAID])
    )
    already_committed = session.exec(statement).one() or 0.0
    
    available_to_request = invoice.total_amount - already_committed
    
    if payment_in.amount > (available_to_request + 0.01):
        raise HTTPException(
            status_code=400, 
            detail=f"Monto inválido. Disponible real: ${available_to_request:,.2f}"
        )

    # Crear el registro con la cuenta sugerida
    payment = SupplierPayment(
        purchase_invoice_id=payment_in.invoice_id,
        provider_id=invoice.provider_id,
        amount=payment_in.amount,
        payment_date=payment_in.payment_date,
        payment_method=payment_in.payment_method,
        suggested_account_id=payment_in.suggested_account_id, # NUEVO
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
# 1.1 EDITAR SOLICITUD DE PAGO (Administración)
# ------------------------------------------------------------------
@router.put("/payments/request/{payment_id}", response_model=SupplierPaymentRead)
def update_payment_request(
    *,
    session: SessionDep,
    current_user: CurrentUser,
    payment_id: int,
    payment_in: PaymentRequestCreate
) -> Any:
    payment = session.get(SupplierPayment, payment_id)
    if not payment:
        raise HTTPException(status_code=404, detail="Solicitud no encontrada")

    if payment.status != PaymentStatus.PENDING:
        raise HTTPException(status_code=400, detail="No se puede editar una solicitud que ya fue autorizada o pagada")

    invoice = session.get(PurchaseInvoice, payment.purchase_invoice_id)
    
    # Validar Sobregiros liberando el cupo actual
    statement = select(func.sum(SupplierPayment.amount)).where(
        SupplierPayment.purchase_invoice_id == invoice.id,
        SupplierPayment.status.in_([PaymentStatus.PENDING, PaymentStatus.APPROVED, PaymentStatus.PAID])
    )
    already_committed_total = session.exec(statement).one() or 0.0
    committed_others = already_committed_total - payment.amount
    available_to_request = invoice.total_amount - committed_others

    if payment_in.amount > (available_to_request + 0.01):
        raise HTTPException(status_code=400, detail=f"Monto inválido. Disponible: ${available_to_request:,.2f}")

    payment.amount = payment_in.amount
    payment.payment_date = payment_in.payment_date
    payment.payment_method = payment_in.payment_method
    payment.suggested_account_id = payment_in.suggested_account_id # NUEVO
    payment.reference = payment_in.reference
    payment.notes = payment_in.notes
    
    session.add(payment)
    session.commit()
    session.refresh(payment)
    return payment

# ------------------------------------------------------------------
# 1.2 ELIMINAR SOLICITUD DE PAGO
# ------------------------------------------------------------------
@router.delete("/payments/request/{payment_id}")
def cancel_payment_request(
    *,
    session: SessionDep,
    current_user: CurrentUser,
    payment_id: int
) -> Any:
    payment = session.get(SupplierPayment, payment_id)
    if not payment:
        raise HTTPException(status_code=404, detail="Solicitud no encontrada")

    if payment.status not in [PaymentStatus.PENDING, PaymentStatus.REJECTED]:
        raise HTTPException(status_code=400, detail="No se puede eliminar una solicitud ya autorizada o pagada")

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
    current_user: CurrentUser, 
    payment_id: int,
    status_in: PaymentApprovalUpdate
) -> Any:
    """
    Paso 2: Dirección autoriza (APPROVED), rechaza (REJECTED), o revoca (PENDING).
    """
    payment = session.get(SupplierPayment, payment_id)
    if not payment:
        raise HTTPException(status_code=404, detail="Pago no encontrado")

    # ----- NUEVA LÓGICA DE SEGURIDAD PARA PERMITIR REVOCACIÓN -----
    if status_in.status == PaymentStatus.PENDING:
        # Solo puedes revocar si estaba en estado APPROVED
        if payment.status != PaymentStatus.APPROVED:
            raise HTTPException(status_code=400, detail="Solo se pueden revocar autorizaciones de pagos ya aprobados.")
        # Limpiamos los datos de autorización
        payment.approved_by_user_id = None
        payment.approved_account_id = None
    else:
        # Si vas a Aprobar o Rechazar, el pago debe estar en estado PENDING
        if payment.status != PaymentStatus.PENDING:
            raise HTTPException(status_code=400, detail="Este pago ya fue procesado.")

        if status_in.status == PaymentStatus.APPROVED and not status_in.approved_account_id:
            raise HTTPException(status_code=400, detail="Para autorizar un pago, debes asignar una cuenta bancaria origen.")

        payment.approved_by_user_id = current_user.id
        payment.approved_account_id = status_in.approved_account_id
    # --------------------------------------------------------------

    payment.status = status_in.status

    session.add(payment)
    session.commit()
    session.refresh(payment)
    return payment

# ------------------------------------------------------------------
# 3. EJECUTAR PAGO (Tesorería / Administración) 
# ------------------------------------------------------------------
@router.post("/payments/{payment_id}/execute", response_model=SupplierPaymentRead)
def execute_supplier_payment(
    *,
    session: SessionDep,
    current_user: CurrentUser,
    payment_id: int
) -> Any:
    """
    Paso 3: Toma un pago AUTORIZADO, resta el dinero del Banco, 
    registra la transacción en Tesorería y baja el saldo de la Factura.
    """
    payment = session.get(SupplierPayment, payment_id)
    if not payment:
        raise HTTPException(status_code=404, detail="Pago no encontrado")

    if payment.status != PaymentStatus.APPROVED:
        raise HTTPException(status_code=400, detail="Solo se pueden ejecutar pagos previamente AUTORIZADOS.")
        
    invoice = session.get(PurchaseInvoice, payment.purchase_invoice_id)
    provider = session.get(Provider, payment.provider_id)
    account = session.get(BankAccount, payment.approved_account_id)
    
    if not account:
        raise HTTPException(status_code=400, detail="La cuenta bancaria autorizada no existe.")

    # A) CREAR MOVIMIENTO EN TESORERÍA (Libro Mayor)
    bank_tx = BankTransaction(
        account_id=account.id,
        transaction_type=TransactionType.OUT, # Egreso
        amount=payment.amount,
        reference=payment.reference or f"Pago FAC-{invoice.invoice_number}",
        description=f"Pago a Proveedor: {provider.business_name if provider else 'N/A'}",
        related_entity_type="PURCHASE_INVOICE",
        related_entity_id=invoice.id
    )
    session.add(bank_tx)
    
    # B) RESTAR SALDO DE LA CUENTA BANCARIA
    account.current_balance -= payment.amount
    session.add(account)

    # C) RESTAR SALDO DE LA FACTURA
    invoice.outstanding_balance -= payment.amount
    if invoice.outstanding_balance < 0.01:
        invoice.outstanding_balance = 0.0
        invoice.status = InvoiceStatus.PAID
    else:
        invoice.status = InvoiceStatus.PARTIAL
    session.add(invoice)

    # D) MARCAR EL EVENTO COMO PAGADO Y VINCULAR TESORERÍA
    # Hacemos flush para obtener el ID real de la transacción bancaria
    session.flush() 
    payment.status = PaymentStatus.PAID
    payment.treasury_transaction_id = bank_tx.id
    session.add(payment)

    # Comprometer todos los cambios de forma atómica
    session.commit()
    session.refresh(payment)
    return payment

# ------------------------------------------------------------------
# 4. KPI / DASHBOARD (Lógica del Viernes de Corte)
# ------------------------------------------------------------------
@router.get("/payable-stats", response_model=AccountsPayableDashboardStats)
def get_payable_dashboard_stats(session: SessionDep) -> Any:
    today = date.today()
    weekday = today.weekday()
    days_until_friday = 4 - weekday
    if days_until_friday < 0: days_until_friday += 7
    cutoff_date = today + timedelta(days=days_until_friday)
    next_period_limit = cutoff_date + timedelta(days=15)

    statement = select(PurchaseInvoice).where(
        PurchaseInvoice.status != InvoiceStatus.PAID,
        PurchaseInvoice.status != InvoiceStatus.CANCELLED
    )
    invoices = session.exec(statement).all()
    
    var_overdue_amount = 0.0; var_overdue_count = 0      
    var_next_period_amount = 0.0; var_next_period_count = 0  
    var_future_amount = 0.0; var_future_count = 0       
    
    for inv in invoices:
        saldo = inv.outstanding_balance
        if saldo <= 0: continue 
        due = inv.due_date 
        
        if due <= cutoff_date:
            var_overdue_amount += saldo
            var_overdue_count += 1     
        elif due <= next_period_limit:
            var_next_period_amount += saldo
            var_next_period_count += 1 
        else:
            var_future_amount += saldo
            var_future_count += 1      
            
    pending_approvals = session.exec(
        select(func.count(SupplierPayment.id)).where(SupplierPayment.status == PaymentStatus.PENDING)
    ).one()

    return AccountsPayableDashboardStats(
        overdue_amount=var_overdue_amount, overdue_count=var_overdue_count,
        next_period_amount=var_next_period_amount, next_period_count=var_next_period_count,
        future_amount=var_future_amount, future_count=var_future_count,
        total_pending_approval=pending_approvals
    )

# ------------------------------------------------------------------
# 5. LISTADO DE SOLICITUDES PENDIENTES
# ------------------------------------------------------------------
@router.get("/payments/pending-approvals", response_model=List[SupplierPaymentRead])
def get_pending_approvals(session: SessionDep) -> Any:
    statement = select(SupplierPayment).where(SupplierPayment.status == PaymentStatus.PENDING)
    payments = session.exec(statement).all()
    
    results = []
    for p in payments:
        prov = session.get(Provider, p.provider_id)
        inv = session.get(PurchaseInvoice, p.purchase_invoice_id)
        
        results.append(SupplierPaymentRead(
            id=p.id,
            purchase_invoice_id=p.purchase_invoice_id,
            provider_id=p.provider_id,
            provider_name=prov.business_name if prov else "Desconocido",
            invoice_folio=inv.invoice_number if inv else "S/N", 
            amount=p.amount,
            payment_date=p.payment_date,
            payment_method=p.payment_method,
            suggested_account_id=p.suggested_account_id,
            approved_account_id=p.approved_account_id,
            treasury_transaction_id=p.treasury_transaction_id,
            reference=p.reference,
            notes=p.notes,
            status=p.status,
            created_at=p.created_at
        ))
    return results

# ------------------------------------------------------------------
# 5.1 LISTADO DE PAGOS AUTORIZADOS (Listos para ejecutar)
# ------------------------------------------------------------------
@router.get("/payments/approved", response_model=List[SupplierPaymentRead])
def get_approved_payments(session: SessionDep) -> Any:
    """
    Obtiene los pagos que ya fueron autorizados por Dirección 
    y están esperando que Administración los ejecute.
    """
    statement = select(SupplierPayment).where(SupplierPayment.status == PaymentStatus.APPROVED)
    payments = session.exec(statement).all()
    
    results = []
    for p in payments:
        prov = session.get(Provider, p.provider_id)
        inv = session.get(PurchaseInvoice, p.purchase_invoice_id)
        
        results.append(SupplierPaymentRead(
            id=p.id,
            purchase_invoice_id=p.purchase_invoice_id,
            provider_id=p.provider_id,
            provider_name=prov.business_name if prov else "Desconocido",
            invoice_folio=inv.invoice_number if inv else "S/N", 
            amount=p.amount,
            payment_date=p.payment_date,
            payment_method=p.payment_method,
            suggested_account_id=p.suggested_account_id, 
            approved_account_id=p.approved_account_id,   
            treasury_transaction_id=p.treasury_transaction_id, 
            reference=p.reference,
            notes=p.notes,
            status=p.status,
            created_at=p.created_at
        ))
    return results

# ------------------------------------------------------------------
# 6. LISTADO DE FACTURAS PENDIENTES (Mesa de Control)
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
    results.sort(key=lambda x: str(x.due_date))
    return results