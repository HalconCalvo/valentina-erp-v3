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

# ---> 🔪 INYECCIÓN: Importamos la Orden de Compra de tu Módulo de Inventario <---
from app.models.inventory import PurchaseOrder

from app.schemas.finance_schema import (
    PaymentRequestCreate, 
    PaymentApprovalUpdate, 
    SupplierPaymentRead, 
    PendingInvoiceRead,
    AccountsPayableDashboardStats
)

router = APIRouter()

# ==================================================================
# ---> 🛠️ MOTOR DE SINCRONIZACIÓN AUTOMÁTICA UNIFICADO <---
# ==================================================================
def _sync_pos_to_invoices(session: SessionDep):
    from datetime import datetime, date # Forzamos la importación aquí por seguridad
    today_date = datetime.now().date() # Fecha exacta e inmutable
    
    # 1. Órdenes de Compra (Pre-pagos)
    statement = select(PurchaseOrder).where(
        PurchaseOrder.status == "AUTORIZADA",
        PurchaseOrder.payment_status == "PENDING"
    )
    pos = session.exec(statement).all()
    for po in pos:
        if po.total_estimated_amount <= 0: continue
        oc_folio = f"OC-{po.folio}"
        existing = session.exec(select(PurchaseInvoice).where(PurchaseInvoice.invoice_number == oc_folio)).first()
        if not existing:
            # INYECCIÓN FISCAL: Agregamos el 16% de IVA al subtotal de la Orden de Compra
            total_con_iva = po.total_estimated_amount * 1.16
            
            inv = PurchaseInvoice(
                provider_id=po.provider_id,
                invoice_number=oc_folio,
                issue_date=today_date, # <--- DATO BLINDADO
                due_date=today_date,
                total_amount=total_con_iva, # <--- GUARDA CON IVA
                outstanding_balance=total_con_iva, # <--- DEUDA CON IVA
                status=getattr(InvoiceStatus, "PENDING", "PENDING")
            )
            session.add(inv)
            po.payment_status = "REQUESTED"
            session.add(po)

    # 2. Cuentas por Pagar de Almacén -> Pasan a la Bandeja Universal
    query_ap = text("SELECT id, provider_id, invoice_folio, total_amount, due_date FROM accounts_payable WHERE status = 'PENDIENTE'")
    aps = session.exec(query_ap).all()
    for ap_id, prov_id, folio, amt, due in aps:
        if amt is None or amt <= 0: continue
        
        safe_folio = folio if folio else f"AP-{ap_id}"
        existing = session.exec(select(PurchaseInvoice).where(PurchaseInvoice.invoice_number == safe_folio)).first()
        
        if not existing:
            due_date_parsed = today_date
            if isinstance(due, str):
                try: due_date_parsed = datetime.strptime(due[:10], '%Y-%m-%d').date()
                except: pass
            elif due:
                due_date_parsed = due if hasattr(due, 'year') else today_date

            # INYECCIÓN FISCAL: Asumimos que lo recibido de almacén viene en subtotal
            total_ap_con_iva = amt * 1.16

            inv = PurchaseInvoice(
                provider_id=prov_id,
                invoice_number=safe_folio,
                issue_date=today_date, # <--- DATO BLINDADO
                due_date=due_date_parsed,
                total_amount=total_ap_con_iva, # <--- GUARDA CON IVA
                outstanding_balance=total_ap_con_iva, # <--- DEUDA CON IVA
                status=getattr(InvoiceStatus, "PENDING", "PENDING")
            )
            session.add(inv)

    session.commit()
    
# ------------------------------------------------------------------
# 1. SOLICITAR UN PAGO (CON VÍA VIP FAST-TRACK PARA GERENCIA)
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
        SupplierPayment.status.in_([PaymentStatus.PENDING, PaymentStatus.APPROVED, PaymentStatus.PAID])
    )
    already_committed = session.exec(statement).one() or 0.0
    available_to_request = invoice.total_amount - already_committed
    
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
    session.flush() # Guardamos para obtener el ID de pago

    # ---> 🚀 FAST-TRACK: VÍA VIP PARA GERENCIA Y DIRECCIÓN <---
    if current_user.role.upper() in ["DIRECTOR", "GERENCIA"]:
        account = session.get(BankAccount, payment_in.suggested_account_id)
        if not account:
            raise HTTPException(status_code=400, detail="Cuenta bancaria no válida para el pago directo.")
            
        # A) Auto-Aprobar
        payment.approved_by_user_id = current_user.id
        payment.approved_account_id = account.id
        payment.status = PaymentStatus.APPROVED
        
        # B) Auto-Ejecutar (Movimiento de Tesorería)
        bank_tx = BankTransaction(
            account_id=account.id,
            transaction_type=TransactionType.OUT,
            amount=payment.amount,
            reference=payment.reference or f"Pago Directo FAC-{invoice.invoice_number}",
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
        
        # C) El Efecto Boomerang a Compras/Almacén
        inv_str = invoice.invoice_number
        if inv_str:
            if inv_str.startswith("OC-"):
                oc_folio = inv_str.replace("OC-", "")
                po = session.exec(select(PurchaseOrder).where(PurchaseOrder.folio == oc_folio)).first()
                if po and invoice.outstanding_balance <= 0.01:
                    po.payment_status = "PAID"
                    session.add(po)
            else:
                if invoice.outstanding_balance <= 0.01:
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
# 2. APROBAR O RECHAZAR PAGO (Gerencia / Dirección - Nivel Checker)
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
        if payment.status != PaymentStatus.APPROVED:
            raise HTTPException(status_code=400, detail="Solo se revocan autorizaciones de pagos ya aprobados.")
        payment.approved_by_user_id = None
        payment.approved_account_id = None
    else:
        if payment.status != PaymentStatus.PENDING:
            raise HTTPException(status_code=400, detail="Este pago ya fue procesado.")

        if status_in.status == PaymentStatus.APPROVED and not status_in.approved_account_id:
            raise HTTPException(status_code=400, detail="Asigna una cuenta bancaria.")

        payment.approved_by_user_id = current_user.id
        payment.approved_account_id = status_in.approved_account_id

    payment.status = status_in.status

    session.add(payment)
    session.commit()
    session.refresh(payment)
    return payment

# ------------------------------------------------------------------
# 3. EJECUTAR PAGO (Ruta normal para cuando Admin lo pidió antes)
# ------------------------------------------------------------------
@router.post("/payments/{payment_id}/execute", response_model=SupplierPaymentRead)
def execute_supplier_payment(
    *,
    session: SessionDep,
    current_user: CurrentUser,
    payment_id: int
) -> Any:
    if current_user.role.upper() not in ["DIRECTOR", "GERENCIA"]:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Acceso denegado.")

    payment = session.get(SupplierPayment, payment_id)
    if not payment: raise HTTPException(status_code=404, detail="Pago no encontrado")
    if payment.status != PaymentStatus.APPROVED: raise HTTPException(status_code=400, detail="Solo se ejecutan pagos AUTORIZADOS.")
        
    invoice = session.get(PurchaseInvoice, payment.purchase_invoice_id)
    account = session.get(BankAccount, payment.approved_account_id)
    
    bank_tx = BankTransaction(
        account_id=account.id,
        transaction_type=TransactionType.OUT,
        amount=payment.amount,
        reference=payment.reference or f"Pago FAC-{invoice.invoice_number}",
        description=f"Pago Autorizado a Proveedor",
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

    # ---> EFECTO BOOMERANG NORMAL <---
    inv_str = invoice.invoice_number
    if inv_str:
        if inv_str.startswith("OC-"):
            oc_folio = inv_str.replace("OC-", "")
            po = session.exec(select(PurchaseOrder).where(PurchaseOrder.folio == oc_folio)).first()
            if po and invoice.outstanding_balance <= 0.01:
                po.payment_status = "PAID"
                session.add(po)
        else:
            if invoice.outstanding_balance <= 0.01:
                session.exec(text("UPDATE accounts_payable SET status = 'PAGADO' WHERE invoice_folio = :folio").bindparams(folio=inv_str))

    session.commit()
    session.refresh(payment)
    return payment

# ------------------------------------------------------------------
# 4. KPI / DASHBOARD (LA VERDAD DE LA CAJA V3.5 - UNIFICADA)
# ------------------------------------------------------------------
@router.get("/payable-stats", response_model=AccountsPayableDashboardStats)
def get_payable_dashboard_stats(session: SessionDep) -> Any:
    # Mantenemos sincronizador encendido
    _sync_pos_to_invoices(session)

    today = date.today()
    weekday = today.weekday()
    # Lógica del viernes (4 = Viernes)
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
    
    # --- FUENTE ÚNICA DE VERDAD: PURCHASE_INVOICE ---
    # Al estar todo unificado por el Sincronizador, ya no leemos Accounts Payable.
    statement = select(PurchaseInvoice).where(
        PurchaseInvoice.status != InvoiceStatus.PAID, 
        PurchaseInvoice.status != InvoiceStatus.CANCELLED
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
        select(func.count(SupplierPayment.id)).where(SupplierPayment.status == PaymentStatus.PENDING)
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
# 6. LISTADO DE FACTURAS PENDIENTES (SÚPER SIMPLIFICADO Y BLINDADO)
# ------------------------------------------------------------------
@router.get("/invoices/pending", response_model=List[PendingInvoiceRead])
def get_pending_invoices(session: SessionDep) -> Any:
    _sync_pos_to_invoices(session)

    # AL ESTAR TODO UNIFICADO, SOLO LEEMOS DE UNA TABLA. CERO CHOQUES DE ID.
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
        
        items_list = []
        final_po_folio = None
        
        if inv.invoice_number:
            inv_str = str(inv.invoice_number).strip()
            
            # Buscamos de dónde salió para traer sus artículos
            po_folio = inv_str.upper().replace("OC-", "").replace("COT-", "").strip()
            po = session.exec(select(PurchaseOrder).where(PurchaseOrder.folio == po_folio)).first()
            
            # Si no era OC directa, probamos si vino de Almacén (Accounts Payable)
            if not po:
                ap = session.exec(text("SELECT purchase_order_id FROM accounts_payable WHERE invoice_folio = :folio").bindparams(folio=inv_str)).first()
                if ap and ap[0]:
                    po = session.get(PurchaseOrder, ap[0])

            # Si encontramos el origen, sacamos los artículos
            if po:
                final_po_folio = po.folio
                query_items = text("""
                    SELECT custom_description, quantity_ordered, expected_unit_cost 
                    FROM purchase_order_items 
                    WHERE purchase_order_id = :po_id
                """)
                db_items = session.exec(query_items.bindparams(po_id=po.id)).all()
                items_list = [{"description": item[0], "qty": item[1], "price": item[2]} for item in db_items]

        results.append(PendingInvoiceRead(
            id=inv.id, 
            provider_name=prov.business_name if prov else "Prov.", 
            invoice_number=inv.invoice_number, 
            due_date=inv.due_date, 
            total_amount=inv.total_amount, 
            outstanding_balance=inv.outstanding_balance,
            items=items_list,
            po_folio=final_po_folio
        ))
    
    results.sort(key=lambda x: str(x.due_date))
    return results