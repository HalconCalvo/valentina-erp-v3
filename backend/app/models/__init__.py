# Modelos Base (NÚCLEO ESTABILIZADO)
from .material import Material, ProductionRoute
from .foundations import GlobalConfig, Provider, Client, TaxRate
from .users import User, UserCreate, UserUpdate, UserPublic

# Módulo de Diseño (INGENIERÍA)
from .design import ProductMaster, ProductVersion, VersionComponent, VersionStatus

# Módulo de Ventas (COTIZADOR / ÓRDENES)
from .sales import SalesOrder, SalesOrderItem, SalesOrderStatus

# Módulo de Inventario (OPERACIONES / ALMACÉN)
from .inventory import InventoryReception, InventoryTransaction

# --- Módulo de Finanzas (NUEVO) ---
# ¡Esto es lo que faltaba para que Alembic cree las tablas!
from .finance import PurchaseInvoice, SupplierPayment, InvoiceStatus, PaymentStatus

# Exportación explícita para Alembic/SQLModel
__all__ = [
    # Cimientos
    "Material", 
    "ProductionRoute",
    "GlobalConfig", 
    "Provider", 
    "Client", 
    "TaxRate",
    "User",
    
    # Ingeniería
    "ProductMaster",
    "ProductVersion",
    "VersionComponent",
    
    # Ventas
    "SalesOrder",
    "SalesOrderItem",

    # Inventario
    "InventoryReception",
    "InventoryTransaction",

    # Finanzas
    "PurchaseInvoice",
    "SupplierPayment",
    "InvoiceStatus",
    "PaymentStatus"
]