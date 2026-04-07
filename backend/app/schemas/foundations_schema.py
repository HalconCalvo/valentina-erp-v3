from typing import Optional
from datetime import datetime
from sqlmodel import SQLModel

# YA NO IMPORTAMOS ENUMS, AHORA ES TEXTO LIBRE

# --- CONFIGURACIÓN ---
class GlobalConfigBase(SQLModel):
    target_profit_margin: float
    cost_tolerance_percent: float
    quote_validity_days: int
    default_edgebanding_factor: float # NUEVO CAMPO

class GlobalConfigUpdate(GlobalConfigBase):
    pass

class GlobalConfigRead(GlobalConfigBase):
    id: int
    updated_at: datetime

# --- PROVEEDORES ---
class ProviderCreate(SQLModel):
    business_name: str
    legal_name: Optional[str] = None
    rfc_tax_id: Optional[str] = None
    email: Optional[str] = None
    phone: Optional[str] = None
    phone2: Optional[str] = None             # <--- NUEVO
    contact_name: Optional[str] = None
    contact_email: Optional[str] = None      # <--- NUEVO
    contact_cellphone: Optional[str] = None  # <--- NUEVO
    credit_days: int = 0

class ProviderRead(ProviderCreate):
    id: int
    is_active: bool

# --- CLIENTES ---
class ClientCreate(SQLModel):
    full_name: str
    rfc_tax_id: Optional[str] = None
    email: str
    phone: str
    fiscal_address: Optional[str] = None
    
    # Contacto 1
    contact_name: Optional[str] = None
    contact_phone: Optional[str] = None
    contact_dept: Optional[str] = None
    contact_email: Optional[str] = None
    
    # Contacto 2
    contact2_name: Optional[str] = None
    contact2_phone: Optional[str] = None
    contact2_dept: Optional[str] = None
    contact2_email: Optional[str] = None
    
    # Contacto 3
    contact3_name: Optional[str] = None
    contact3_phone: Optional[str] = None
    contact3_dept: Optional[str] = None
    contact3_email: Optional[str] = None
    
    # Contacto 4
    contact4_name: Optional[str] = None
    contact4_phone: Optional[str] = None
    contact4_dept: Optional[str] = None
    contact4_email: Optional[str] = None
    
    notes: Optional[str] = None

class ClientRead(ClientCreate):
    id: int
    registration_date: datetime
    is_active: bool

# --- MATERIALES (FLEXIBLE) ---
class MaterialBase(SQLModel):
    sku: str
    name: str
    
    # Ahora son Strings libres
    category: str 
    production_route: str 
    
    purchase_unit: str
    usage_unit: str             
    conversion_factor: float = 1.0
    current_cost: float = 0.0 
    
    # Referencia al SKU del tapacanto (o nulo si no lleva)
    associated_element_sku: Optional[str] = None 
    
    provider_id: Optional[int] = None

class MaterialCreate(MaterialBase):
    pass

class MaterialRead(MaterialBase):
    id: int
    # NUEVOS CAMPOS: Solo visibles al leer, no editables directamente en la ficha
    physical_stock: float
    committed_stock: float