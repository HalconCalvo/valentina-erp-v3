# Modelos Base (NÚCLEO ESTABILIZADO)
from .material import Material, ProductionRoute
from .foundations import GlobalConfig, Provider, Client, TaxRate
from .users import User, UserCreate, UserUpdate, UserPublic

# Módulo de Diseño (INGENIERÍA)
from .design import ProductMaster, ProductVersion, VersionComponent, VersionStatus

# Módulo de Ventas (COTIZADOR / ÓRDENES)
from .sales import SalesOrder, SalesOrderItem, SalesOrderStatus, SalesOrderItemInstance, CustomerPayment, PaymentMethod, InstanceStatus, SalesCommission, CommissionType

# Módulo de Inventario (OPERACIONES / ALMACÉN / COMPRAS)
from .inventory import InventoryReception, InventoryTransaction, InventoryReservation, PurchaseRequisition, PurchaseOrder, PurchaseOrderItem

# --- Módulo de Finanzas (NUEVO) ---
# ¡Esto es lo que faltaba para que Alembic cree las tablas!
from .finance import PurchaseInvoice, SupplierPayment, InvoiceStatus, PaymentStatus
from app.models.treasury import BankAccount, BankTransaction, WeeklyFixedCost

# --- Módulo de Producción e Instalaciones (V3.5) ---
from .production import (
    ProductionBatch,
    ProductionBatchStatus,
    InstallationAssignment,
    InstallationAssignmentStatus,
    PayrollPayment,
    PayrollPaymentType,
    PayrollStatus,
)

# --- Módulo de Caja Chica ---
from .petty_cash import PettyCashFund, PettyCashMovement

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
    "VersionStatus",
    "ProductionBatch",
    "ProductionBatchStatus",
    
    # Ventas
    "SalesOrder",
    "SalesOrderItem",
    "SalesOrderStatus",
    "SalesOrderItemInstance",
    "CustomerPayment",
    "PaymentMethod",
    "InstanceStatus",
    "SalesCommission",
    "CommissionType",

    # Inventario y Compras
    "InventoryReception",
    "InventoryTransaction",
    "InventoryReservation",
    "PurchaseRequisition",
    "PurchaseOrder",
    "PurchaseOrderItem",

    # Finanzas y Tesorería
    "PurchaseInvoice",
    "SupplierPayment",
    "InvoiceStatus",
    "PaymentStatus",
    "BankAccount",
    "BankTransaction",
    "WeeklyFixedCost",

    # Logística y Nómina
    "InstallationAssignment",
    "InstallationAssignmentStatus",
    "PayrollPayment",
    "PayrollPaymentType",
    "PayrollStatus",

    # Caja Chica
    "PettyCashFund",
    "PettyCashMovement",
]