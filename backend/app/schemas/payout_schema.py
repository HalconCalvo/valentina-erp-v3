"""D40: one part of a payment to a person (commission or crew payroll)."""
from typing import Optional

from pydantic import BaseModel


class PayoutPartCreate(BaseModel):
    """BANK (with account_id), CASH (petty cash) or DIRECTOR_CASH (Director only, no movement) and its amount."""
    payment_method: str
    account_id: Optional[int] = None
    amount: float
