import os
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from contextlib import asynccontextmanager

from app.core.database import create_db_and_tables
from app.api.v1.api import api_router 

@asynccontextmanager
async def lifespan(app: FastAPI):
    print("--> Inicializando Base de Datos...")
    create_db_and_tables()
    yield
    print("--> Apagando sistema...")

app = FastAPI(
    title="SGP V3 API",
    version="3.0.0",
    description="Sistema de Gestión de Producción RTA - Backend",
    lifespan=lifespan
)

# --- CORRECCIÓN DE RUTAS ESTÁTICAS ---
# Obtenemos la ruta absoluta de 'backend/app'
app_dir = os.path.dirname(__file__)
# Subimos un nivel para llegar a 'backend/'
backend_root = os.path.dirname(app_dir)
# Apuntamos a 'backend/static'
static_dir = os.path.join(backend_root, "static")

# Aseguramos que la carpeta exista
if not os.path.exists(static_dir):
    os.makedirs(static_dir)

# Montamos la ruta
app.mount("/static", StaticFiles(directory=static_dir), name="static")

# --- CONFIGURACIÓN DE CORS ---
origins = [
    "http://localhost:5173",
    "http://127.0.0.1:5173",
    "http://localhost:3000",
]

app.add_middleware(
    CORSMiddleware,
    allow_origins=origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(api_router, prefix="/api/v1")

@app.get("/")
def read_root():
    return {"System": "SGP V3 API", "Status": "Online", "Version": "3.0"}