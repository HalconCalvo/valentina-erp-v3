from datetime import datetime
from typing import List, Optional
from fastapi import APIRouter, Depends, HTTPException, UploadFile, File
from sqlmodel import Session, select

from app.core.deps import get_session, CurrentUser
from app.models.petty_cash import PettyCashFund, PettyCashMovement
from app.models.users import User
from app.schemas.petty_cash_schema import (
    PettyCashFundRead,
    PettyCashFundUpdate,
    PettyCashMovementCreate,
    PettyCashMovementRead,
)
from app.services.cloud_storage import upload_to_gcs

router = APIRouter()

ALLOWED_ROLES = {"DIRECTOR", "GERENCIA", "ADMIN"}
MANAGER_ROLES = {"DIRECTOR", "GERENCIA"}


def _check_role(current_user: User, allowed: set = ALLOWED_ROLES):
    role = current_user.role.value if hasattr(current_user.role, 'value') else str(current_user.role)
    if role.upper() not in allowed:
        raise HTTPException(status_code=403, detail="No tienes permisos para esta operación.")


def _get_or_create_fund(db: Session) -> PettyCashFund:
    fund = db.exec(select(PettyCashFund)).first()
    if not fund:
        fund = PettyCashFund(
            fund_amount=5000.0,
            minimum_balance=1000.0,
            current_balance=5000.0,
        )
        db.add(fund)
        db.commit()
        db.refresh(fund)
    return fund


def _movement_to_read(movement: PettyCashMovement, db: Session) -> PettyCashMovementRead:
    user = db.get(User, movement.created_by_id)
    return PettyCashMovementRead(
        **movement.model_dump(),
        created_by_name=user.full_name if user else None,
    )


# ─────────────────────────────────────────
# GET /petty-cash/fund
# ─────────────────────────────────────────
@router.get("/fund", response_model=PettyCashFundRead)
def get_fund(current_user: CurrentUser, db: Session = Depends(get_session)):
    _check_role(current_user)
    return _get_or_create_fund(db)


# ─────────────────────────────────────────
# PUT /petty-cash/fund
# ─────────────────────────────────────────
@router.put("/fund", response_model=PettyCashFundRead)
def update_fund(
    body: PettyCashFundUpdate,
    current_user: CurrentUser,
    db: Session = Depends(get_session),
):
    _check_role(current_user, MANAGER_ROLES)
    fund = _get_or_create_fund(db)
    if body.fund_amount is not None:
        fund.fund_amount = body.fund_amount
    if body.minimum_balance is not None:
        fund.minimum_balance = body.minimum_balance
    fund.updated_at = datetime.utcnow()
    fund.updated_by_id = current_user.id
    db.add(fund)
    db.commit()
    db.refresh(fund)
    return fund


# ─────────────────────────────────────────
# GET /petty-cash/movements
# ─────────────────────────────────────────
@router.get("/movements", response_model=List[PettyCashMovementRead])
def get_movements(
    current_user: CurrentUser,
    db: Session = Depends(get_session),
    skip: int = 0,
    limit: int = 50,
    movement_type: Optional[str] = None,
):
    _check_role(current_user)
    query = select(PettyCashMovement).order_by(PettyCashMovement.movement_date.desc())
    if movement_type:
        query = query.where(PettyCashMovement.movement_type == movement_type.upper())
    movements = db.exec(query.offset(skip).limit(limit)).all()
    return [_movement_to_read(m, db) for m in movements]


# ─────────────────────────────────────────
# POST /petty-cash/movements
# ─────────────────────────────────────────
@router.post("/movements", response_model=PettyCashMovementRead)
def create_movement(
    body: PettyCashMovementCreate,
    current_user: CurrentUser,
    db: Session = Depends(get_session),
):
    _check_role(current_user)
    fund = _get_or_create_fund(db)

    movement_type = body.movement_type.upper()

    if movement_type == "EGRESO":
        if fund.current_balance - body.amount < 0:
            raise HTTPException(status_code=400, detail="Saldo insuficiente en caja chica.")
        fund.current_balance -= body.amount

    elif movement_type == "REPOSICION":
        if fund.current_balance + body.amount > fund.fund_amount:
            raise HTTPException(status_code=400, detail="La reposición excede el fondo configurado.")
        fund.current_balance += body.amount

    else:
        raise HTTPException(status_code=400, detail="movement_type debe ser EGRESO o REPOSICION.")

    fund.updated_at = datetime.utcnow()
    fund.updated_by_id = current_user.id
    db.add(fund)

    movement = PettyCashMovement(
        movement_type=movement_type,
        amount=body.amount,
        concept=body.concept,
        category=body.category,
        notes=body.notes,
        movement_date=body.movement_date or datetime.utcnow(),
        created_by_id=current_user.id,
    )
    db.add(movement)
    db.commit()
    db.refresh(movement)
    return _movement_to_read(movement, db)


# ─────────────────────────────────────────
# POST /petty-cash/movements/{id}/receipt
# ─────────────────────────────────────────
@router.post("/movements/{movement_id}/receipt")
async def upload_receipt(
    movement_id: int,
    current_user: CurrentUser,
    file: UploadFile = File(...),
    db: Session = Depends(get_session),
):
    _check_role(current_user)
    movement = db.get(PettyCashMovement, movement_id)
    if not movement:
        raise HTTPException(status_code=404, detail="Movimiento no encontrado.")

    destination = f"petty-cash/receipts/{movement_id}/{file.filename}"
    public_url = upload_to_gcs(file.file, destination, content_type=file.content_type or "application/octet-stream")

    movement.receipt_url = public_url
    db.add(movement)
    db.commit()
    return {"receipt_url": public_url}


# ─────────────────────────────────────────
# DELETE /petty-cash/movements/{id}
# ─────────────────────────────────────────
@router.delete("/movements/{movement_id}")
def delete_movement(
    movement_id: int,
    current_user: CurrentUser,
    db: Session = Depends(get_session),
):
    _check_role(current_user, MANAGER_ROLES)
    movement = db.get(PettyCashMovement, movement_id)
    if not movement:
        raise HTTPException(status_code=404, detail="Movimiento no encontrado.")

    fund = _get_or_create_fund(db)

    # Revertir efecto en el saldo
    if movement.movement_type == "EGRESO":
        fund.current_balance += movement.amount
    elif movement.movement_type == "REPOSICION":
        fund.current_balance -= movement.amount

    fund.updated_at = datetime.utcnow()
    fund.updated_by_id = current_user.id
    db.add(fund)
    db.delete(movement)
    db.commit()
    return {"ok": True}
