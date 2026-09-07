"""Purchase domain — database queries only (no business logic)."""
from datetime import datetime
from typing import Dict, List, Optional

from sqlalchemy import or_
from sqlmodel import Session, select, text

from app.models.foundations import Provider
from app.models.inventory import PurchaseOrder, PurchaseOrderItem, PurchaseRequisition
from app.models.material import Material
from app.models.finance import PurchaseInvoice, SupplierPayment, InvoiceStatus

AccountsPayable = SupplierPayment.AccountsPayable
OperationalExpense = AccountsPayable


def get_requisitions(db: Session, skip: int = 0, limit: int = 100) -> List[dict]:
    rows = db.execute(
        text("SELECT * FROM purchase_requisitions LIMIT :limit OFFSET :skip"),
        {"limit": limit, "skip": skip},
    ).mappings().all()
    return [dict(r) for r in rows]


def get_purchase_orders(
    db: Session,
    status: Optional[str] = None,
    search: Optional[str] = None,
    date_from: Optional[str] = None,
    date_to: Optional[str] = None,
    skip: int = 0,
    limit: int = 200,
) -> dict:
    statement = select(PurchaseOrder).order_by(PurchaseOrder.id.desc())

    if status:
        statement = statement.where(PurchaseOrder.status.ilike(f"%{status.strip()}%"))

    if search and search.strip():
        term = f"%{search.strip()}%"
        prov_ids = list(db.exec(select(Provider.id).where(Provider.business_name.ilike(term))).all())
        if prov_ids:
            statement = statement.where(
                or_(PurchaseOrder.folio.ilike(term), PurchaseOrder.provider_id.in_(prov_ids))
            )
        else:
            statement = statement.where(PurchaseOrder.folio.ilike(term))

    if date_from:
        try:
            df = datetime.fromisoformat(date_from)
            statement = statement.where(PurchaseOrder.created_at >= df)
        except ValueError:
            pass
    if date_to:
        try:
            dt = datetime.fromisoformat(date_to).replace(hour=23, minute=59, second=59)
            statement = statement.where(PurchaseOrder.created_at <= dt)
        except ValueError:
            pass

    orders = list(db.exec(statement.offset(skip).limit(limit)).all())
    if not orders:
        return {
            "orders": [],
            "prov_map": {},
            "items_by_po": {},
            "mat_map": {},
            "folios_by_po": {},
            "advance_paid_by_po": {},
        }

    provider_ids = {o.provider_id for o in orders if o.provider_id is not None}
    order_ids = [o.id for o in orders]

    providers = (
        list(db.exec(select(Provider).where(Provider.id.in_(provider_ids))).all())
        if provider_ids else []
    )
    prov_map = {p.id: p for p in providers}

    all_items = (
        list(db.exec(
            select(PurchaseOrderItem).where(PurchaseOrderItem.purchase_order_id.in_(order_ids))
        ).all())
        if order_ids else []
    )
    items_by_po: Dict[int, list] = {}
    for it in all_items:
        items_by_po.setdefault(it.purchase_order_id, []).append(it)

    material_ids = {it.material_id for it in all_items if it.material_id is not None}
    materials = (
        list(db.exec(select(Material).where(Material.id.in_(material_ids))).all())
        if material_ids else []
    )
    mat_map = {m.id: m for m in materials}

    folios_by_po: Dict[int, str] = {}
    if order_ids:
        folio_rows = db.exec(text("""
            SELECT purchase_order_id,
                   STRING_AGG(invoice_folio, ', ' ORDER BY invoice_folio) AS folios
            FROM accounts_payable
            WHERE purchase_order_id = ANY(:ids) AND invoice_folio IS NOT NULL
            GROUP BY purchase_order_id
        """).bindparams(ids=order_ids)).all()
        folios_by_po = {row[0]: row[1] for row in folio_rows}

    advance_paid_by_po: Dict[int, float] = {}
    if order_ids:
        ant_rows = db.exec(text("""
            SELECT po.id as po_id, COALESCE(SUM(sp.amount), 0) as total_paid
            FROM purchase_orders po
            JOIN purchase_invoices pi ON pi.invoice_number = 'ANT-' || po.folio
            JOIN supplier_payments sp ON sp.purchase_invoice_id = pi.id
            WHERE po.id = ANY(:ids)
              AND sp.status = 'PAID'
            GROUP BY po.id
        """).bindparams(ids=order_ids)).all()
        advance_paid_by_po = {row[0]: float(row[1]) for row in ant_rows}

    return {
        "orders": orders,
        "prov_map": prov_map,
        "items_by_po": items_by_po,
        "mat_map": mat_map,
        "folios_by_po": folios_by_po,
        "advance_paid_by_po": advance_paid_by_po,
    }


def get_pending_requisitions(db: Session) -> List[PurchaseRequisition]:
    return list(
        db.exec(
            select(PurchaseRequisition).where(
                PurchaseRequisition.status.in_(["PENDIENTE", "EN_COMPRA"])
            )
        ).all()
    )


def get_pending_tasks_counts(db: Session) -> dict:
    reqs_pendientes = db.execute(
        text(
            "SELECT COUNT(id) FROM purchase_requisitions "
            "WHERE UPPER(status) IN ('PENDIENTE', 'EN_COMPRA')"
        )
    ).scalar() or 0
    orders_to_authorize = db.execute(
        text("SELECT COUNT(id) FROM purchase_orders WHERE UPPER(status) = 'DRAFT'")
    ).scalar() or 0
    orders_to_dispatch = db.execute(
        text("SELECT COUNT(id) FROM purchase_orders WHERE UPPER(status) = 'AUTORIZADA'")
    ).scalar() or 0
    return {
        "pending_requisitions": reqs_pendientes,
        "orders_to_authorize": orders_to_authorize,
        "orders_to_dispatch": orders_to_dispatch,
        "total_alerts": reqs_pendientes + orders_to_authorize + orders_to_dispatch,
    }


def get_purchase_order_by_id(db: Session, po_id: int) -> Optional[PurchaseOrder]:
    return db.get(PurchaseOrder, po_id)


def get_po_items(db: Session, po_id: int) -> List[PurchaseOrderItem]:
    return list(
        db.exec(select(PurchaseOrderItem).where(PurchaseOrderItem.purchase_order_id == po_id)).all()
    )


def get_po_item_by_id(db: Session, item_id: int) -> Optional[PurchaseOrderItem]:
    return db.get(PurchaseOrderItem, item_id)


def get_requisition_by_id(db: Session, req_id: int) -> Optional[PurchaseRequisition]:
    return db.get(PurchaseRequisition, req_id)


def get_advance_invoice_by_folio(db: Session, folio: str) -> Optional[PurchaseInvoice]:
    return db.exec(
        select(PurchaseInvoice).where(PurchaseInvoice.invoice_number == f"ANT-{folio}")
    ).first()


def get_accounts_payable_by_po(db: Session, po_id: int) -> Optional[AccountsPayable]:
    return db.exec(
        select(AccountsPayable).where(AccountsPayable.purchase_order_id == po_id)
    ).first()


def get_material_by_id(db: Session, material_id: int) -> Optional[Material]:
    return db.get(Material, material_id)


def get_provider_by_id(db: Session, provider_id: int) -> Optional[Provider]:
    return db.get(Provider, provider_id)


def check_folio_duplicate(db: Session, provider_id: int, folio: str) -> List[dict]:
    rows = db.exec(text("""
        SELECT id, total_amount, status, created_at, purchase_order_id
        FROM accounts_payable
        WHERE provider_id = :prov AND invoice_folio = :folio AND status != 'CANCELADO'
        ORDER BY id DESC
    """).bindparams(prov=provider_id, folio=folio)).all()
    return [
        {
            "id": r[0],
            "total_amount": r[1],
            "status": r[2],
            "created_at": r[3],
            "purchase_order_id": r[4],
        }
        for r in rows
    ]


def get_purchase_invoice_by_id(db: Session, invoice_id: int) -> Optional[PurchaseInvoice]:
    return db.get(PurchaseInvoice, invoice_id)


def get_pending_advance_invoice(db: Session, po_folio: str) -> Optional[PurchaseInvoice]:
    return db.exec(
        select(PurchaseInvoice).where(
            PurchaseInvoice.invoice_number == f"ANT-{po_folio}",
            PurchaseInvoice.status == InvoiceStatus.PENDING,
        )
    ).first()


def find_provider_by_name_ilike(db: Session, name: str) -> Optional[Provider]:
    return db.exec(select(Provider).where(Provider.business_name.ilike(name))).first()


def get_operational_expense_by_id(db: Session, expense_id: int) -> Optional[dict]:
    row = db.exec(text("""
        SELECT ap.id, ap.invoice_folio, ap.total_amount, ap.due_date,
               ap.status, ap.created_at, ap.overhead_category,
               ap.instance_id, ap.notes, p.business_name AS provider_name
        FROM accounts_payable ap
        LEFT JOIN providers p ON ap.provider_id = p.id
        WHERE ap.id = :expense_id AND ap.purchase_order_id IS NULL
    """).bindparams(expense_id=expense_id)).first()
    return dict(row._mapping) if row else None


def get_operational_expenses(db: Session, filters: dict) -> List[dict]:
    skip = int(filters.get("skip", 0))
    limit = int(filters.get("limit", 100))
    rows = db.exec(text("""
        SELECT ap.id, ap.invoice_folio, ap.total_amount, ap.due_date,
               ap.status, ap.created_at, ap.overhead_category,
               ap.instance_id, p.business_name as provider_name
        FROM accounts_payable ap
        LEFT JOIN providers p ON ap.provider_id = p.id
        WHERE ap.purchase_order_id IS NULL
        ORDER BY ap.created_at DESC
        LIMIT :limit OFFSET :skip
    """).bindparams(limit=limit, skip=skip)).all()
    return [dict(r._mapping) for r in rows]


def get_operational_expense_core(db: Session, expense_id: int) -> Optional[dict]:
    row = db.exec(text("""
        SELECT id, status, invoice_folio, total_amount, due_date, overhead_category, notes
        FROM accounts_payable
        WHERE id = :expense_id AND purchase_order_id IS NULL
    """).bindparams(expense_id=expense_id)).first()
    return dict(row._mapping) if row else None


def get_operational_expense_payments_sum(db: Session, expense_id: int) -> float:
    row = db.exec(text("""
        SELECT COALESCE(SUM(amount), 0)
        FROM supplier_payments
        WHERE accounts_payable_id = :expense_id
    """).bindparams(expense_id=expense_id)).first()
    return float(row[0] if row else 0)


def insert_operational_expense(
    db: Session,
    *,
    provider_id: Optional[int],
    folio: str,
    total: float,
    due_date,
    overhead_category: str,
    instance_id: Optional[int],
    now: datetime,
) -> None:
    db.exec(text("""
        INSERT INTO accounts_payable (
            provider_id, purchase_order_id, invoice_folio,
            total_amount, due_date, status, created_at,
            overhead_category, instance_id
        ) VALUES (
            :prov_id, NULL, :folio, :total, :due, 'PENDIENTE', :now,
            :category, :instance_id
        )
    """).bindparams(
        prov_id=provider_id,
        folio=folio,
        total=total,
        due=due_date,
        now=now,
        category=overhead_category,
        instance_id=instance_id,
    ))


def update_operational_expense_fields(db: Session, expense_id: int, updates: dict) -> None:
    allowed_fields = ("invoice_folio", "total_amount", "due_date", "overhead_category", "notes")
    set_clauses = []
    params: dict = {"expense_id": expense_id}
    for field in allowed_fields:
        if field in updates:
            set_clauses.append(f"{field} = :{field}")
            params[field] = updates[field]
    if not set_clauses:
        return
    db.exec(text(
        f"UPDATE accounts_payable SET {', '.join(set_clauses)} "
        "WHERE id = :expense_id AND purchase_order_id IS NULL"
    ).bindparams(**params))


def cancel_operational_expense_row(db: Session, expense_id: int, notes: str) -> None:
    db.exec(text("""
        UPDATE accounts_payable
        SET status = 'CANCELADO', notes = :notes
        WHERE id = :expense_id AND purchase_order_id IS NULL
    """).bindparams(notes=notes, expense_id=expense_id))
