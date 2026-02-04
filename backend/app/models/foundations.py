from typing import Optional, List, TYPE_CHECKING
from sqlmodel import Field, SQLModel, Relationship
from datetime import datetime

# Evitamos import circular solo para tipado
if TYPE_CHECKING:
    from .material import Material

# --- MODELOS ---

class TaxRate(SQLModel, table=True):
    __tablename__ = "tax_rates"
    id: Optional[int] = Field(default=None, primary_key=True)
    name: str
    rate: float
    is_active: bool = Field(default=True)

class GlobalConfig(SQLModel, table=True):
    __tablename__ = "global_config"
    id: Optional[int] = Field(default=None, primary_key=True)
    
    # Identidad
    company_name: str
    company_rfc: Optional[str] = None
    company_address: Optional[str] = None
    company_phone: Optional[str] = None
    company_email: Optional[str] = None
    company_website: Optional[str] = None
    logo_path: Optional[str] = None 
    
    # Reglas de Negocio
    target_profit_margin: float
    cost_tolerance_percent: float
    quote_validity_days: int
    default_edgebanding_factor: float

    # Metas Financieras
    annual_sales_target: float = Field(default=0.0)
    last_year_sales: float = Field(default=0.0)
    
    # Relaciones
    default_tax_rate_id: Optional[int] = Field(default=None, foreign_key="tax_rates.id")
    updated_at: datetime = Field(default_factory=datetime.now)

class Provider(SQLModel, table=True):
    __tablename__ = "providers"
    id: Optional[int] = Field(default=None, primary_key=True)
    business_name: str = Field(index=True)
    legal_name: Optional[str] = None
    rfc_tax_id: Optional[str] = None
    contact_name: Optional[str] = None
    email: Optional[str] = None
    phone: Optional[str] = None
    credit_days: int
    is_active: bool = Field(default=True)
    materials: List["Material"] = Relationship(back_populates="provider")

class Client(SQLModel, table=True):
    __tablename__ = "clients_v2"
    id: Optional[int] = Field(default=None, primary_key=True)
    full_name: str = Field(index=True)
    rfc_tax_id: Optional[str] = None
    email: str
    phone: str
    fiscal_address: Optional[str] = None
    
    # --- CONTACTO PRINCIPAL ---
    contact_name: Optional[str] = None
    contact_phone: Optional[str] = None
    contact_dept: Optional[str] = None  # <--- NUEVO: Departamento

    # --- CONTACTO 2 ---
    contact2_name: Optional[str] = None
    contact2_phone: Optional[str] = None
    contact2_dept: Optional[str] = None

    # --- CONTACTO 3 ---
    contact3_name: Optional[str] = None
    contact3_phone: Optional[str] = None
    contact3_dept: Optional[str] = None

    # --- CONTACTO 4 ---
    contact4_name: Optional[str] = None
    contact4_phone: Optional[str] = None
    contact4_dept: Optional[str] = None

    notes: Optional[str] = None
    registration_date: datetime = Field(default_factory=datetime.now)
    is_active: bool = Field(default=True)