import os
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from contextlib import asynccontextmanager

# --- IMPORTS NECESARIOS PARA EL FIX ---
from sqlmodel import Session, select
from passlib.context import CryptContext
from app.models.users import User
from app.core.database import create_db_and_tables, engine 

from app.api.v1.api import api_router
from app.core.config import settings

# --- PUENTE GOOGLE CLOUD ---
if settings.GOOGLE_APPLICATION_CREDENTIALS and os.path.exists(settings.GOOGLE_APPLICATION_CREDENTIALS):
    os.environ["GOOGLE_APPLICATION_CREDENTIALS"] = settings.GOOGLE_APPLICATION_CREDENTIALS
    print(f"--> Google Cloud: Credenciales cargadas.")
else:
    print("--> Google Cloud: No se detectaron credenciales locales (Modo Offline).")

@asynccontextmanager
async def lifespan(app: FastAPI):
    # --- INICIO MODO DETECTIVE ---
    try:
        db_url = settings.DATABASE_URL.replace("sqlite:///", "")
        if db_url.startswith("."):
            real_path = os.path.abspath(db_url)
        else:
            real_path = db_url
        print(f"\n🚨🚨🚨 UBICACIÓN REAL DE LA BASE DE DATOS: {real_path} 🚨🚨🚨\n")
    except Exception as e:
        print(f"No se pudo determinar la ruta de la BD: {e}")
    # --- FIN MODO DETECTIVE ---

    print("--> Inicializando Base de Datos...")
    try:
        create_db_and_tables()
        print("--> Sistema listo.")
    except Exception as e:
        print(f"Error crítico en BD: {e}")
    yield
    print("--> Apagando sistema...")

app = FastAPI(
    title=settings.PROJECT_NAME,
    version="3.0.0",
    lifespan=lifespan
)

# --- STATIC FILES ---
app_dir = os.path.dirname(__file__)
backend_root = os.path.dirname(app_dir)
static_dir = os.path.join(backend_root, "static")
if not os.path.exists(static_dir):
    os.makedirs(static_dir)
app.mount("/static", StaticFiles(directory=static_dir), name="static")

# --- CORS DINÁMICO ---
if settings.BACKEND_CORS_ORIGINS:
    origins = [str(origin).rstrip("/") for origin in settings.BACKEND_CORS_ORIGINS]
    
    app.add_middleware(
        CORSMiddleware,
        allow_origins=origins,
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )

# ---------------------------------------------------------
# 🚨 PUERTA TRASERA V2: ASCENSO A DIRECTOR
# ---------------------------------------------------------
@app.get("/fix-admin")
def create_admin_manually():
    """
    Este endpoint busca al usuario admin. 
    Si existe, LE CAMBIA EL ROL A 'DIRECTOR'.
    Si no existe, lo crea como 'DIRECTOR'.
    """
    PRE_CALCULATED_HASH = "$2b$12$EixZaYVK1fsbw1ZfbX3OXePaWxwKc.60MLEfcOdQQ2UEHFpphXeJC"
    
    try:
        with Session(engine) as session:
            # 1. Buscar usuario
            user = session.exec(select(User).where(User.email == "admin@example.com")).first()
            
            if user:
                # --- AQUÍ ESTÁ EL CAMBIO: ACTUALIZAR ROL ---
                print("--> Usuario encontrado. Actualizando a DIRECTOR...")
                user.role = "DIRECTOR"  # <--- Forzamos el rol
                user.is_superuser = True
                session.add(user)
                session.commit()
                session.refresh(user)
                return {
                    "status": "updated", 
                    "msg": "✅ ROL ACTUALIZADO: El usuario admin ahora es DIRECTOR.",
                    "role": user.role
                }
            
            # 2. Crear si no existe (con ROL DIRECTOR)
            print("--> Creando nuevo Director...")
            admin_user = User(
                email="admin@example.com",
                hashed_password=PRE_CALCULATED_HASH,
                full_name="Director General",
                is_active=True,
                is_superuser=True,
                role="DIRECTOR" # <--- Forzamos el rol al crear
            )
            session.add(admin_user)
            session.commit()
            return {
                "status": "created", 
                "msg": "✅ ÉXITO: Usuario Director creado manualmente.",
                "credentials": {"email": "admin@example.com", "pass": "admin"}
            }
    except Exception as e:
        return {"status": "error", "msg": f"Falló la actualización: {str(e)}"}
# ---------------------------------------------------------
app.include_router(api_router, prefix=settings.API_V1_STR)

@app.get("/")
def read_root():
    return {"System": "SGP V3 API", "Status": "Online"}