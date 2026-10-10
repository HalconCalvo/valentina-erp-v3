"""Sanitation tool 4 (docs/SANEAMIENTO.md §5.3): bulk update of the material catalog from an Excel file."""
from typing import List, Optional

from pydantic import BaseModel


class MaterialFieldChangeRead(BaseModel):
    field: str
    label: str
    old: Optional[str] = None
    new: Optional[str] = None


class MaterialChangeRowRead(BaseModel):
    row: int
    sku: str
    name: str
    changes: List[MaterialFieldChangeRead] = []


class MaterialImportIssueRead(BaseModel):
    row: int
    sku: Optional[str] = None
    message: str


class MaterialImportPreviewRead(BaseModel):
    rows: List[MaterialChangeRowRead] = []
    errors: List[MaterialImportIssueRead] = []
    unchanged: int = 0


class MaterialImportResultRead(BaseModel):
    updated: int
