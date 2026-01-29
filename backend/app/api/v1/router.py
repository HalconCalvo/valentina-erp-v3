from fastapi import APIRouter
from app.api.v1.endpoints import foundations, auth

api_router = APIRouter()

# 1. MÓDULO CIMIENTOS (Config, Materiales, Clientes, Prov)
api_router.include_router(foundations.router, prefix="/foundations", tags=["Foundations"])

# 2. MÓDULO SEGURIDAD (Usuarios y Roles)
api_router.include_router(auth.router, prefix="/auth", tags=["Auth"])

# (Próximamente: Design, Sales, Production)