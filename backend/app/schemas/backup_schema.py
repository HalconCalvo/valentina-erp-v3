from pydantic import BaseModel


class BackupRunRead(BaseModel):
    status: str
    filename: str | None = None
    size_mb: float | None = None
    duration_seconds: float | None = None
    detail: str | None = None
