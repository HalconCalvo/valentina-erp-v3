from pydantic import BaseModel


class UserDeactivateUpdate(BaseModel):
    reason: str
