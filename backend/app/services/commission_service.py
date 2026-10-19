"""D44: global commission settings in GlobalConfig (one beneficiary and one percent, only DIRECTOR changes them)."""
from fastapi import HTTPException
from sqlmodel import Session

from app.core.permissions import require_roles
from app.models.foundations import GlobalConfig
from app.models.users import User

GLOBAL_FIELDS = ("global_commission_user_id", "global_commission_percent")


def check_global_commission_change(session: Session, user, current: GlobalConfig, data: dict) -> None:
    """Only DIRECTOR changes the beneficiary or the percent; the user must be active and the percent 0–100."""
    changed = [f for f in GLOBAL_FIELDS if f in data and data[f] != getattr(current, f)]
    if not changed:
        return
    require_roles(user, {"DIRECTOR"}, "Solo Dirección cambia la comisión global.")
    percent = float(data.get("global_commission_percent", current.global_commission_percent) or 0)
    if percent < 0 or percent > 100:
        raise HTTPException(status_code=400, detail="El porcentaje de la comisión global va de 0 a 100.")
    beneficiary_id = data.get("global_commission_user_id", current.global_commission_user_id)
    if beneficiary_id:
        beneficiary = session.get(User, beneficiary_id)
        if not beneficiary or not beneficiary.is_active:
            raise HTTPException(status_code=400, detail="El beneficiario de la comisión global debe ser un usuario activo.")
