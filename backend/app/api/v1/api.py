from fastapi import APIRouter
# Importamos los módulos. AGREGAMOS 'login' al final de la lista.
from app.api.v1.endpoints import foundations, auth, users, design, sales, inventory, login

api_router = APIRouter()

# ==========================================
# RUTAS DE ACCESO Y USUARIOS
# ==========================================

# 0. Login (NUEVO) -> Resulta en: /api/v1/login/access-token
# Esta es la ruta crítica que faltaba para entrar al sistema.
api_router.include_router(login.router, prefix="/login", tags=["login"])

# 1. Auth Genérico -> /api/v1/auth
api_router.include_router(auth.router, prefix="/auth", tags=["auth"])

# 2. Usuarios -> /api/v1/auth/users
api_router.include_router(users.router, prefix="/auth/users", tags=["users"])

# ==========================================
# RUTAS DE NEGOCIO (ERP)
# ==========================================
# 3. Foundations (Cimientos: Clientes, Prov, Materiales, Config)
api_router.include_router(foundations.router, prefix="/foundations", tags=["foundations"])

# 4. Ingeniería (Diseño: Maestros, Versiones, Recetas)
api_router.include_router(design.router, prefix="/design", tags=["design"])

# 5. Ventas (Cotizador: Órdenes, Snapshots)
api_router.include_router(sales.router, prefix="/sales", tags=["sales"])

# 6. Inventario (Almacén: Recepciones, Movimientos, Valuación)
api_router.include_router(inventory.router, prefix="/inventory", tags=["inventory"])