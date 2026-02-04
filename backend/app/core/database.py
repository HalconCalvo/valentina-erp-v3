import os
from sqlmodel import SQLModel, create_engine, Session, select
from passlib.context import CryptContext

# --- IMPORTANTE: Registramos todos los modelos ---
from app.models import users, auth, foundations, inventory, sales, design, finance
from app.models.users import User 

# --- CONFIGURACIÓN DE CONEXIÓN ---
DATABASE_URL_ENV = os.getenv("DATABASE_URL")

if DATABASE_URL_ENV:
    # Nube (Cloud Run)
    SQLALCHEMY_DATABASE_URL = DATABASE_URL_ENV
    connect_args = {"check_same_thread": False} if "sqlite" in DATABASE_URL_ENV else {}
else:
    # Local (Mac)
    SQLALCHEMY_DATABASE_URL = "sqlite:///./local_dev.db"
    connect_args = {"check_same_thread": False}

# Crear el motor
engine = create_engine(
    SQLALCHEMY_DATABASE_URL,
    echo=False,
    connect_args=connect_args
)

# Configuración de hash (BCRYPT)
pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")

# 1. FUNCIÓN DE ARRANQUE
def create_db_and_tables():
    # Crea las tablas
    SQLModel.metadata.create_all(engine)
    
    # --- AUTO-CREACIÓN DE DIRECTOR ---
    with Session(engine) as session:
        user = session.exec(select(User).where(User.email == "admin@example.com")).first()
        
        if not user:
            print("--> ⚠️  Base de datos vacía. Calculando credenciales...")
            try:
                # AHORA SÍ: Dejamos que el sistema calcule el hash con sus propias reglas
                # Gracias al fix de requirements.txt, esto ya no fallará.
                secure_password = pwd_context.hash("admin")
                
                admin_user = User(
                    email="admin@example.com",
                    hashed_password=secure_password,
                    full_name="Director General",
                    is_active=True,
                    is_superuser=True,
                    role="DIRECTOR"  # <--- ROL CORRECTO
                )
                session.add(admin_user)
                session.commit()
                print("--> ✅ Usuario DIRECTOR creado exitosamente (Pass: admin).")
            except Exception as e:
                print(f"--> Error creando usuario: {e}")
                pass

# 2. FUNCIÓN DE SESIÓN
def get_session():
    with Session(engine) as session:
        yield session

# 3. ALIAS
get_db = get_session