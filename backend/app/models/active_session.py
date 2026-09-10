from datetime import datetime
from typing import Optional

from sqlmodel import Field, SQLModel


class ActiveSession(SQLModel, table=True):
    __tablename__ = "active_sessions"

    id: Optional[int] = Field(default=None, primary_key=True)
    user_id: int = Field(foreign_key="users.id", unique=True, index=True)
    session_token: str = Field(index=True)
    ip_address: Optional[str] = Field(default=None)
    user_agent: Optional[str] = Field(default=None)
    created_at: datetime = Field(default_factory=datetime.utcnow)
    last_heartbeat: datetime = Field(default_factory=datetime.utcnow)
