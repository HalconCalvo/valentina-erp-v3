from fastapi import APIRouter
# 1. IMPORTAMOS ANALYTICS, EL NUEVO MÓDULO 'USERS' Y 'PRODUCTION' (V3.5)
from app.api.v1.endpoints import foundations, auth, users, design, sales, inventory, login, treasury, analytics, production, purchases, logistics
from app.api.v1.endpoints import finance
from app.api.v1.endpoints import planning
from app.api.v1.endpoints import petty_cash

api_router = APIRouter()

# --- ACCESO ---
api_router.include_router(login.router, prefix="/login", tags=["login"])
api_router.include_router(auth.router, prefix="/auth", tags=["auth"])

# --- PUENTE DE USUARIOS (El Eslabón Solucionado) ---
# Esto habilita la ruta: /api/v1/users/
api_router.include_router(users.router, prefix="/users", tags=["users"])

# --- NEGOCIO (Mantenemos la estructura original) ---
api_router.include_router(foundations.router, prefix="/foundations", tags=["foundations"])
api_router.include_router(design.router, prefix="/design", tags=["design"])
api_router.include_router(sales.router, prefix="/sales", tags=["sales"])
api_router.include_router(inventory.router, prefix="/inventory", tags=["inventory"])

# --- PRODUCCIÓN V3.5 (El Candado RTM y Lotes) ---
api_router.include_router(production.router, prefix="/production", tags=["production"])
api_router.include_router(purchases.router, prefix="/purchases", tags=["purchases"])
api_router.include_router(logistics.router, prefix="/logistics", tags=["logistics"])

# 2. ANALYTICS & FINANZAS
api_router.include_router(analytics.router, prefix="/analytics", tags=["analytics"])
api_router.include_router(finance.router, prefix="/finance", tags=["finance"])
api_router.include_router(treasury.router, prefix="/treasury", tags=["Treasury"])

# --- PLANEACIÓN ESTRATÉGICA: MATRIZ DE 4 CARRILES ---
api_router.include_router(planning.router, prefix="/planning", tags=["planning"])

# --- CAJA CHICA ---
api_router.include_router(petty_cash.router, prefix="/petty-cash", tags=["Petty Cash"])