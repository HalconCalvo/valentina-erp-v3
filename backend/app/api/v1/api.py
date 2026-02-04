from fastapi import APIRouter
# 1. IMPORTAMOS ANALYTICS Y EL NUEVO MÓDULO 'USERS'
from app.api.v1.endpoints import foundations, auth, users, design, sales, inventory, login, analytics
from app.api.v1.endpoints import finance

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

# 2. ANALYTICS & FINANZAS
api_router.include_router(analytics.router, prefix="/analytics", tags=["analytics"])
api_router.include_router(finance.router, prefix="/finance", tags=["finance"])