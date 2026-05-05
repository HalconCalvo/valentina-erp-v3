from typing import Any, List
from datetime import datetime, timedelta, date
from fastapi import APIRouter, HTTPException, status
from sqlmodel import select, func, text

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
from app.models.inventory import PurchaseOrder

from app.schemas.finance_schema import (
    PaymentRequestCreate, 
    PaymentApprovalUpdate, 
    SupplierPaymentRead, 
    PendingInvoiceRead,
    AccountsPayableDashboardStats
)

router = APIRouter()

def clean_invoice_folio(folio: str) -> str:
    if not folio: return "S/N"
    safe_folio = str(folio).strip()
    if safe_folio.startswith("OC-OC-"):
        return safe_folio.replace("OC-OC-", "OC-")
    return safe_folio

# ==================================================================
# ---> 🛠️ MOTOR DE SINCRONIZACIÓN AUTOMÁTICA Y AUTOSANACIÓN <---
# ==================================================================
def _sync_pos_to_invoices(session: SessionDep):
    from datetime import datetime, date
    today_date = datetime.now().date()
    
    # -------------------------------------------------------------------------
    # 1. AUTOSANACIÓN: Exorcismo de facturas de órdenes que fueron canceladas
    # -------------------------------------------------------------------------
    statement_check = select(PurchaseInvoice).where(
        PurchaseInvoice.status != getattr(InvoiceStatus, "PAID", "PAID"),
        PurchaseInvoice.status != getattr(InvoiceStatus, "CANCELLED", "CANCELLED")
    )
    for inv in session.exec(statement_check).all():
        if not inv.invoice_number: continue
        inv_str = clean_invoice_folio(inv.invoice_number)
        
        # Le preguntamos a Compras si la Orden sigue viva
        po = session.exec(select(PurchaseOrder).where(PurchaseOrder.folio == inv_str)).first()
        
        # Si la orden fue Cancelada, Rechazada o se le revocó la firma...
        if po and po.status in ["CANCELADA", "RECHAZADA", "DRAFT"]:
            # A) Anulamos la Factura
            inv.status = getattr(InvoiceStatus, "CANCELLED", "CANCELLED")
            inv.outstanding_balance = 0
            session.add(inv)
            
            # B) Anulamos cualquier solicitud de pago colgada
            pending_payments = session.exec(select(SupplierPayment).where(
                SupplierPayment.purchase_invoice_id == inv.id,
                SupplierPayment.status == getattr(PaymentStatus, "PENDING", "PENDING")
            )).all()
            for pp in pending_payments:
                pp.status = getattr(PaymentStatus, "REJECTED", "REJECTED")
                pp.notes = "Cancelado automáticamente por anulación de la Orden de Compra."
                session.add(pp)
                
            # C) Limpiamos la tabla de cuentas por pagar cruda por seguridad
            session.exec(text("UPDATE accounts_payable SET status = 'CANCELADO' WHERE invoice_folio = :folio").bindparams(folio=inv_str))

    # -------------------------------------------------------------------------
    # 2. CREACIÓN REAL: Registrar facturas SOLO cuando Almacén recibe el material
    # -------------------------------------------------------------------------
    # (Hemos eliminado el bloque ansioso que cobraba órdenes "AUTORIZADAS")
    
    query_ap = text("SELECT id, provider_id, invoice_folio, total_amount, due_date FROM accounts_payable WHERE status = 'PENDIENTE'")
    aps = session.exec(query_ap).all()
    for ap_id, prov_id, folio, amt, due in aps:
        if amt is None or amt <= 0: continue
        
        safe_folio = folio if folio else f"AP-{ap_id}"
        existing = session.exec(select(PurchaseInvoice).where(PurchaseInvoice.invoice_number == safe_folio)).first()
        
        # Solo crea la factura si Almacén ya validó el ticket en el andén
        if not existing:
            due_date_parsed = today_date
            if isinstance(due, str):
                try: due_date_parsed = datetime.strptime(due[:10], '%Y-%m-%d').date()
                except: pass
            elif due:
                due_date_parsed = due if hasattr(due, 'year') else today_date

            total_ap_con_iva = amt * 1.16

            inv = PurchaseInvoice(
                provider_id=prov_id,
                invoice_number=safe_folio,
                issue_date=today_date,
                due_date=due_date_parsed,
                total_amount=total_ap_con_iva,
                outstanding_balance=total_ap_con_iva,
                status=getattr(InvoiceStatus, "PENDING", "PENDING")
            )
            session.add(inv)

    session.commit()
    
# ------------------------------------------------------------------
# 1. SOLICITAR UN PAGO
# ------------------------------------------------------------------
@router.post("/payments/request", response_model=SupplierPaymentRead)
def request_supplier_payment(
    *,
    session: SessionDep,
    current_user: CurrentUser,
    payment_in: PaymentRequestCreate
) -> Any:
    invoice = session.get(PurchaseInvoice, payment_in.invoice_id)
    if not invoice:
        raise HTTPException(status_code=404, detail="Factura no encontrada")

    statement = select(func.sum(SupplierPayment.amount)).where(
        SupplierPayment.purchase_invoice_id == invoice.id,
        SupplierPayment.status.in_([PaymentStatus.PENDING, PaymentStatus.APPROVED])
    )
    limbo_committed = float(session.exec(statement).one() or 0.0)
    available_to_request = float(invoice.outstanding_balance) - limbo_committed
    
    if payment_in.amount > (available_to_request + 0.01):
        raise HTTPException(status_code=400, detail=f"Monto inválido. Disponible real: ${available_to_request:,.2f}")

    payment = SupplierPayment(
        purchase_invoice_id=payment_in.invoice_id,
        provider_id=invoice.provider_id,
        amount=payment_in.amount,
        payment_date=payment_in.payment_date,
        payment_method=payment_in.payment_method,
        suggested_account_id=payment_in.suggested_account_id, 
        reference=payment_in.reference,
        notes=payment_in.notes,
        status=PaymentStatus.PENDING,
        created_by_user_id=current_user.id
    )
    session.add(payment)
    session.flush() 

    if current_user.role.upper() in ["DIRECTOR", "GERENCIA"]:
        account = session.get(BankAccount, payment_in.suggested_account_id)
        if not account:
            raise HTTPException(status_code=400, detail="Cuenta bancaria no válida para el pago directo.")
            
        payment.approved_by_user_id = current_user.id
        payment.approved_account_id = account.id
        
        bank_tx = BankTransaction(
            account_id=account.id,
            transaction_type=TransactionType.OUT,
            amount=payment.amount,
            reference=payment.reference or f"Pago Directo FAC-{clean_invoice_folio(invoice.invoice_number)}",
            description=f"Pago Fast-Track a Proveedor",
            related_entity_type="PURCHASE_INVOICE",
            related_entity_id=invoice.id
        )
        session.add(bank_tx)
        
        account.current_balance -= payment.amount
        invoice.outstanding_balance -= payment.amount
        
        if invoice.outstanding_balance < 0.01:
            invoice.outstanding_balance = 0.0
            invoice.status = InvoiceStatus.PAID
        else:
            invoice.status = InvoiceStatus.PARTIAL
            
        session.flush()
        payment.status = PaymentStatus.PAID
        payment.treasury_transaction_id = bank_tx.id
        
        inv_str = clean_invoice_folio(invoice.invoice_number)
        if inv_str:
            po = session.exec(select(PurchaseOrder).where(PurchaseOrder.folio == inv_str)).first()
            if po and invoice.outstanding_balance <= 0.01:
                po.payment_status = "PAID"
                session.add(po)
            elif invoice.outstanding_balance <= 0.01:
                session.exec(text("UPDATE accounts_payable SET status = 'PAGADO' WHERE invoice_folio = :folio").bindparams(folio=inv_str))

    session.commit()
    session.refresh(payment)
    return payment

# ------------------------------------------------------------------
# 1.1 EDITAR SOLICITUD DE PAGO
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
        raise HTTPException(status_code=400, detail="No se puede editar una solicitud ya autorizada")

    invoice = session.get(PurchaseInvoice, payment.purchase_invoice_id)
    
    statement = select(func.sum(SupplierPayment.amount)).where(
        SupplierPayment.purchase_invoice_id == invoice.id,
        SupplierPayment.status.in_([PaymentStatus.PENDING, PaymentStatus.APPROVED]),
        SupplierPayment.id != payment_id
    )
    limbo_others = float(session.exec(statement).one() or 0.0)
    available_to_request = float(invoice.outstanding_balance) - limbo_others

    if payment_in.amount > (available_to_request + 0.01):
        raise HTTPException(status_code=400, detail=f"Monto inválido. Disponible: ${available_to_request:,.2f}")

    payment.amount = payment_in.amount
    payment.payment_date = payment_in.payment_date
    payment.payment_method = payment_in.payment_method
    payment.suggested_account_id = payment_in.suggested_account_id 
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
        raise HTTPException(status_code=400, detail="No se puede eliminar una solicitud ya autorizada")

    session.delete(payment)
    session.commit()
    return {"message": "Solicitud eliminada correctamente"}

# ------------------------------------------------------------------
# 2. APROBAR Y EJECUTAR PAGO 
# ------------------------------------------------------------------
@router.put("/payments/{payment_id}/status", response_model=SupplierPaymentRead)
def update_payment_status(
    *,
    session: SessionDep,
    current_user: CurrentUser, 
    payment_id: int,
    status_in: PaymentApprovalUpdate
) -> Any:
    if current_user.role.upper() not in ["DIRECTOR", "GERENCIA"]:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN, 
            detail="Acceso denegado. Solo Dirección o Gerencia autorizan."
        )

    payment = session.get(SupplierPayment, payment_id)
    if not payment:
        raise HTTPException(status_code=404, detail="Pago no encontrado")

    if status_in.status == PaymentStatus.PENDING:
        if payment.status not in [PaymentStatus.APPROVED, PaymentStatus.PAID]:
            raise HTTPException(status_code=400, detail="Solo se revocan autorizaciones de pagos ya procesados.")
        raise HTTPException(status_code=400, detail="El pago ya fue ejecutado en el banco. No se puede revocar de forma simple.")
    
    else:
        if payment.status != PaymentStatus.PENDING:
            raise HTTPException(status_code=400, detail="Este pago ya fue procesado anteriormente.")

        if status_in.status == PaymentStatus.APPROVED:
            # SOLO autorizar: guardar cuenta y responsable. SIN mover dinero todavía.
            # Tesorería ejecuta el pago real desde la pantalla "Ejecutar Pagos".
            if not status_in.approved_account_id:
                raise HTTPException(status_code=400, detail="Asigna una cuenta bancaria para autorizar.")

            payment.approved_by_user_id = current_user.id
            payment.approved_account_id = status_in.approved_account_id
            payment.status = PaymentStatus.APPROVED  # Persiste como APPROVED, no PAID

        elif status_in.status == PaymentStatus.REJECTED:
            payment.status = PaymentStatus.REJECTED
            payment.approved_by_user_id = current_user.id

    session.add(payment)
    session.commit()
    session.refresh(payment)
    return payment

@router.post("/payments/{payment_id}/execute", response_model=SupplierPaymentRead)
def execute_supplier_payment(*, session: SessionDep, current_user: CurrentUser, payment_id: int) -> Any:
    """
    TESORERÍA: Ejecuta el pago bancario de un SupplierPayment previamente APROBADO.
    Mueve dinero de la cuenta autorizada → cierra la factura → estado PAID.
    """
    payment = session.get(SupplierPayment, payment_id)
    if not payment:
        raise HTTPException(status_code=404, detail="Pago no encontrado.")
    if payment.status != PaymentStatus.APPROVED:
        raise HTTPException(
            status_code=400,
            detail=f"Solo se ejecutan pagos en estado APPROVED. Estado actual: {payment.status}"
        )
    if not payment.approved_account_id:
        raise HTTPException(status_code=400, detail="El pago no tiene cuenta bancaria asignada.")

    account = session.get(BankAccount, payment.approved_account_id)
    if not account:
        raise HTTPException(status_code=404, detail="Cuenta bancaria no encontrada.")
    if account.current_balance < payment.amount:
        raise HTTPException(
            status_code=400,
            detail=f"Fondos insuficientes. Disponible: {account.current_balance:.2f}, requerido: {payment.amount:.2f}"
        )

    invoice = session.get(PurchaseInvoice, payment.purchase_invoice_id)
    if not invoice:
        raise HTTPException(status_code=404, detail="Factura de proveedor no encontrada.")

    # Crear movimiento bancario de salida
    bank_tx = BankTransaction(
        account_id=account.id,
        transaction_type=TransactionType.OUT,
        amount=payment.amount,
        reference=payment.reference or f"Pago FAC-{clean_invoice_folio(invoice.invoice_number)}",
        description="Pago Ejecutado a Proveedor",
        related_entity_type="PURCHASE_INVOICE",
        related_entity_id=invoice.id,
    )
    session.add(bank_tx)

    # Descuento en cuenta y actualización de saldo de factura
    account.current_balance -= payment.amount
    invoice.outstanding_balance -= payment.amount
    if invoice.outstanding_balance < 0.01:
        invoice.outstanding_balance = 0.0
        invoice.status = InvoiceStatus.PAID
    else:
        invoice.status = InvoiceStatus.PARTIAL

    session.flush()
    payment.status = PaymentStatus.PAID
    payment.treasury_transaction_id = bank_tx.id

    # Sincronizar estado de OC
    inv_str = clean_invoice_folio(invoice.invoice_number)
    po = session.exec(select(PurchaseOrder).where(PurchaseOrder.folio == inv_str)).first()
    if po and invoice.outstanding_balance <= 0.01:
        po.payment_status = "PAID"
        session.add(po)
    elif invoice.outstanding_balance <= 0.01:
        session.exec(text("UPDATE accounts_payable SET status = 'PAGADO' WHERE invoice_folio = :folio").bindparams(folio=inv_str))

    session.add(payment)
    session.add(account)
    session.add(invoice)
    session.commit()
    session.refresh(payment)
    return payment

# ------------------------------------------------------------------
# 4. KPI / DASHBOARD
# ------------------------------------------------------------------
@router.get("/payable-stats", response_model=AccountsPayableDashboardStats)
def get_payable_dashboard_stats(session: SessionDep) -> Any:
    _sync_pos_to_invoices(session)

    today = date.today()
    weekday = today.weekday()
    days_until_friday = 4 - weekday
    if days_until_friday < 0: 
        days_until_friday += 7
        
    cutoff_date = today + timedelta(days=days_until_friday)
    next_period_limit = cutoff_date + timedelta(days=15)

    var_overdue_amount = 0.0
    var_overdue_count = 0      
    var_next_period_amount = 0.0
    var_next_period_count = 0  
    var_future_amount = 0.0
    var_future_count = 0       
    
    statement = select(PurchaseInvoice).where(
        PurchaseInvoice.status != getattr(InvoiceStatus, "PAID", "PAID"), 
        PurchaseInvoice.status != getattr(InvoiceStatus, "CANCELLED", "CANCELLED")
    )
    invoices = session.exec(statement).all()
    
    for inv in invoices:
        if inv.outstanding_balance <= 0:
            continue
        
        amt = float(inv.outstanding_balance)
        due = inv.due_date if inv.due_date else today
        
        if due <= cutoff_date:
            var_overdue_amount += amt
            var_overdue_count += 1     
        elif due <= next_period_limit:
            var_next_period_amount += amt
            var_next_period_count += 1 
        else:
            var_future_amount += amt
            var_future_count += 1      

    pending_approvals = session.exec(
        select(func.count(SupplierPayment.id)).where(SupplierPayment.status == getattr(PaymentStatus, "PENDING", "PENDING"))
    ).one()

    return AccountsPayableDashboardStats(
        overdue_amount=var_overdue_amount, 
        overdue_count=var_overdue_count,
        next_period_amount=var_next_period_amount, 
        next_period_count=var_next_period_count,
        future_amount=var_future_amount,
        future_count=var_future_count,
        total_pending_approval=pending_approvals
    )

# ------------------------------------------------------------------
# 5. LISTADOS
# ------------------------------------------------------------------
@router.get("/payments/pending-approvals", response_model=List[SupplierPaymentRead])
def get_pending_approvals(session: SessionDep) -> Any:
    statement = select(SupplierPayment).where(SupplierPayment.status == getattr(PaymentStatus, "PENDING", "PENDING"))
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
            invoice_folio=clean_invoice_folio(inv.invoice_number) if inv else "S/N",
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

@router.get("/payments/approved", response_model=List[SupplierPaymentRead])
def get_approved_payments(session: SessionDep) -> Any:
    statement = select(SupplierPayment).where(SupplierPayment.status == getattr(PaymentStatus, "APPROVED", "APPROVED"))
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
            invoice_folio=clean_invoice_folio(inv.invoice_number) if inv else "S/N",
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

@router.get("/invoices/pending", response_model=List[PendingInvoiceRead])
def get_pending_invoices(session: SessionDep) -> Any:
    _sync_pos_to_invoices(session)

    statement = select(PurchaseInvoice).where(
        PurchaseInvoice.status != getattr(InvoiceStatus, "PAID", "PAID"), 
        PurchaseInvoice.status != getattr(InvoiceStatus, "CANCELLED", "CANCELLED")
    )
    invoices = session.exec(statement).all()
    
    results = []
    for inv in invoices:
        if inv.outstanding_balance <= 0: 
            continue
        prov = session.get(Provider, inv.provider_id)
        
        items_list = []
        final_po_folio = None
        
        if inv.invoice_number:
            inv_str = clean_invoice_folio(inv.invoice_number)
            
            po = session.exec(select(PurchaseOrder).where(PurchaseOrder.folio == inv_str)).first()
            
            if not po:
                ap = session.exec(text("SELECT purchase_order_id FROM accounts_payable WHERE invoice_folio = :folio").bindparams(folio=inv_str)).first()
                if ap and ap[0]:
                    po = session.get(PurchaseOrder, ap[0])

            if po:
                final_po_folio = po.folio
                query_items = text("""
                    SELECT 
                        poi.custom_description, 
                        poi.quantity_ordered, 
                        poi.expected_unit_cost,
                        m.sku
                    FROM purchase_order_items poi
                    LEFT JOIN materials m ON poi.material_id = m.id
                    WHERE poi.purchase_order_id = :po_id
                """)
                db_items = session.exec(query_items.bindparams(po_id=po.id)).all()
                items_list = [
                    {
                        "description": item[0] or "Material S/N", 
                        "qty": item[1] or 0, 
                        "price": item[2] or 0,
                        "sku": item[3] or "S/SKU"
                    } 
                    for item in db_items
                ]

        # Buscar authorized_by desde accounts_payable -> purchase_orders
        authorized_by = None
        ap_row = session.exec(
            text("SELECT purchase_order_id FROM accounts_payable WHERE invoice_folio = :folio")
            .bindparams(folio=clean_invoice_folio(inv.invoice_number))
        ).first()
        if ap_row and ap_row[0]:
            po_for_auth = session.get(PurchaseOrder, ap_row[0])
            if po_for_auth:
                authorized_by = getattr(po_for_auth, 'authorized_by', None)

        results.append(PendingInvoiceRead(
            id=inv.id,
            provider_name=prov.business_name if prov else "Prov.",
            invoice_number=clean_invoice_folio(inv.invoice_number),
            due_date=inv.due_date,
            total_amount=inv.total_amount,
            outstanding_balance=inv.outstanding_balance,
            items=items_list,
            po_folio=final_po_folio,
            authorized_by=authorized_by
        ))
    
    results.sort(key=lambda x: str(x.due_date))
    return results