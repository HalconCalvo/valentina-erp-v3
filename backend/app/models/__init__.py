# Modelos Base (NÚCLEO ESTABILIZADO)
# Importamos Material y su Enum desde su archivo independiente
from .material import Material, ProductionRoute
from .foundations import GlobalConfig, Provider, Client, TaxRate
from .users import User, UserCreate, UserUpdate, UserPublic

# Módulo de Diseño (INGENIERÍA)
# Ya activamos los modelos reales
from .design import ProductMaster, ProductVersion, VersionComponent, VersionStatus

# Módulo de Ventas (COTIZADOR / ÓRDENES)
# Activamos la arquitectura unificada (Sin Quotes, solo Orders)
from .sales import SalesOrder, SalesOrderItem, SalesOrderStatus

# Módulo de Inventario (OPERACIONES / ALMACÉN)
# Nuevos modelos para Recepción de Compra y Movimientos
from .inventory import InventoryReception, InventoryTransaction

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
    "InventoryTransaction"
]