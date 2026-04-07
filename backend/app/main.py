import os
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from contextlib import asynccontextmanager

# --- IMPORTS NECESARIOS PARA EL FIX ---
from sqlmodel import Session, select
from passlib.context import CryptContext
from app.models.users import User
# IMPORTAMOS TUS MODELOS DE FUNDACIONES
from app.models.foundations import TaxRate, GlobalConfig 
from app.core.database import create_db_and_tables, engine 

from app.api.v1.api import api_router
from app.core.config import settings

# --- PUENTE GOOGLE CLOUD ---
if settings.GOOGLE_APPLICATION_CREDENTIALS and os.path.exists(settings.GOOGLE_APPLICATION_CREDENTIALS):
    os.environ["GOOGLE_APPLICATION_CREDENTIALS"] = settings.GOOGLE_APPLICATION_CREDENTIALS
    print(f"--> Google Cloud: Credenciales cargadas.")
else:
    print("--> Google Cloud: No se detectaron credenciales locales (Modo Offline).")

pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")

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
        # 1. Esto crea las tablas y quizás al usuario fantasma
        create_db_and_tables()
        
        # 2. NUESTRA SEMILLA MAESTRA BLINDADA
        with Session(engine) as session:
            print("--> 🌱 Verificando Semilla de Configuración...")
            
            # --- A. IMPUESTOS ---
            if not session.exec(select(TaxRate)).first():
                session.add(TaxRate(name="IVA Estándar", rate=0.16, is_active=True))
                session.add(TaxRate(name="IVA Frontera", rate=0.08, is_active=True))
                session.add(TaxRate(name="Tasa Cero", rate=0.00, is_active=True))
                session.commit()
                print("--> ✅ Impuestos creados (16%, 8%, 0%).")

            # --- B. CONFIGURACIÓN GLOBAL ---
            if not session.exec(select(GlobalConfig)).first():
                tax_std = session.exec(select(TaxRate).where(TaxRate.rate == 0.16)).first()
                session.add(GlobalConfig(
                    company_name="MI EMPRESA RTA",
                    target_profit_margin=0.45,
                    cost_tolerance_percent=0.03,
                    quote_validity_days=15,
                    default_edgebanding_factor=25,
                    default_tax_rate_id=tax_std.id if tax_std else 1
                ))
                session.commit()
                print("--> ✅ Configuración Global inicial creada.")
            
            # --- C. DIRECTOR SUPREMO (Por si la otra función falló) ---
            if not session.exec(select(User).where(User.email == "admin@example.com")).first():
                session.add(User(
                    email="admin@example.com",
                    full_name="Director SGP",
                    hashed_password=pwd_context.hash("admin"),
                    role="DIRECTOR",
                    is_active=True,
                    is_superuser=True,
                    commission_rate=0.0
                ))
                session.commit()
                print("--> ✅ Usuario Administrador verificado (admin@example.com).")

        print("--> Sistema listo.")
    except Exception as e:
        print(f"Error crítico en BD: {e}")
    yield
    print("--> Apagando sistema...")

app = FastAPI(
    title=settings.PROJECT_NAME,
    version="3.5.0", # <--- ¡Bienvenido a la V3.5!
    lifespan=lifespan
)

# --- STATIC FILES ---
app_dir = os.path.dirname(__file__)
backend_root = os.path.dirname(app_dir)
static_dir = os.path.join(backend_root, "static")
if not os.path.exists(static_dir):
    os.makedirs(static_dir)
app.mount("/static", StaticFiles(directory=static_dir), name="static")

# --- CORS DINÁMICO (BLINDADO V3.5) ---
origins = [
    "http://localhost:5173",    # Frontend Vite (V3.5)
    "http://127.0.0.1:5173",
    "http://localhost:3000",    # Por si acaso usas React antiguo
    "http://127.0.0.1:8000",    # El propio backend
]

# Si existen orígenes en settings, los sumamos
if settings.BACKEND_CORS_ORIGINS:
    extra_origins = [str(origin).rstrip("/") for origin in settings.BACKEND_CORS_ORIGINS]
    origins.extend(extra_origins)

app.add_middleware(
    CORSMiddleware,
    allow_origins=origins,  # <-- Ahora 'origins' es una lista sólida
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ---------------------------------------------------------
# 🚨 PUERTA TRASERA V2: ASCENSO A DIRECTOR
# ---------------------------------------------------------
@app.get("/fix-admin")
def create_admin_manually():
    PRE_CALCULATED_HASH = "$2b$12$EixZaYVK1fsbw1ZfbX3OXePaWxwKc.60MLEfcOdQQ2UEHFpphXeJC"
    try:
        with Session(engine) as session:
            user = session.exec(select(User).where(User.email == "admin@example.com")).first()
            if user:
                user.role = "DIRECTOR" 
                user.is_superuser = True
                session.add(user)
                session.commit()
                return {"status": "updated", "msg": "✅ ROL ACTUALIZADO a DIRECTOR."}
            
            admin_user = User(
                email="admin@example.com",
                hashed_password=PRE_CALCULATED_HASH,
                full_name="Director General",
                is_active=True,
                is_superuser=True,
                role="DIRECTOR" 
            )
            session.add(admin_user)
            session.commit()
            return {"status": "created", "msg": "✅ ÉXITO: Usuario creado."}
    except Exception as e:
        return {"status": "error", "msg": f"Fallo: {str(e)}"}

app.include_router(api_router, prefix=settings.API_V1_STR)

@app.get("/")
def read_root():
    return {"System": "SGP V3.5 API", "Status": "Online"}