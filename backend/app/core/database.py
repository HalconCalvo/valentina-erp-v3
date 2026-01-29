import os
from sqlmodel import SQLModel, create_engine, Session

# 1. IMPORTACIÓN DE MODELOS
# Importamos explícitamente los archivos donde están las tablas.
# Esto es OBLIGATORIO para que SQLModel sepa qué tablas crear.
from app.models import material, foundations

# 2. CONFIGURACIÓN DE LA BASE DE DATOS (Auto-contenida)
# Calculamos la ruta absoluta para que no importa desde dónde ejecutes el terminal,
# siempre encuentre la DB en "backend/sgp_v3.db"
BASE_DIR = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
SQLITE_FILE_NAME = "sgp_v3.db"
DATABASE_URL = f"sqlite:///{os.path.join(BASE_DIR, SQLITE_FILE_NAME)}"

# Ajuste para evitar errores de hilos en SQLite
connect_args = {"check_same_thread": False}

# 3. CREACIÓN DEL MOTOR
engine = create_engine(DATABASE_URL, echo=True, connect_args=connect_args)

def create_db_and_tables():
    """
    Crea las tablas definidas en los modelos importados arriba.
    """
    print(f"--> Conectando a BD en: {DATABASE_URL}")
    SQLModel.metadata.create_all(engine)
    print("--> Tablas verificadas/creadas con éxito.")

def get_session():
    """Dependency para inyectar sesión en los endpoints"""
    with Session(engine) as session:
        yield session