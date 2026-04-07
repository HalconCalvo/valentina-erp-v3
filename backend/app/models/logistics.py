from typing import Optional, List
from datetime import date, datetime
from sqlmodel import SQLModel, Field
from sqlalchemy import Column, JSON

# ==========================================
# LOGÍSTICA E INSTALACIONES (V3.5)
# ==========================================

class InstallationAssignment(SQLModel, table=True):
    __tablename__ = "installation_assignments"
    
    id: Optional[int] = Field(default=None, primary_key=True)
    
    # La instancia (bultos) que se va a instalar
    instance_id: int = Field(foreign_key="sales_order_item_instances.id")
    
    # El día que salieron a ruta
    assignment_date: date = Field(default_factory=date.today)
    
    # La Cuadrilla Dinámica
    leader_user_id: int = Field(foreign_key="users.id")
    helper_user_id: Optional[int] = Field(default=None, foreign_key="users.id")
    
    # Estatus del viaje: EN_TRANSITO, INSTALADO_SIN_FIRMA, FINALIZADO_CON_FIRMA
    status: str = Field(default="EN_TRANSITO")
    
    # Cierre Documental y Fotográfico
    client_signature_url: Optional[str] = None
    
    # Usamos SQLAlchemy JSON para guardar el arreglo de fotos (URLs)
    evidence_photos_urls: List[str] = Field(default_factory=list, sa_column=Column(JSON))
    
    created_at: datetime = Field(default_factory=datetime.utcnow)