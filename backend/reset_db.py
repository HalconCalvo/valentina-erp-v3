import sys
import os

# Agregamos el directorio actual al path
sys.path.append(os.path.dirname(os.path.abspath(__file__)))

from sqlmodel import Session, SQLModel
from app.core.database import engine
from app.core.security import get_password_hash

# --- 1. IMPORTAR TUS MÓDULOS DE MODELOS ---
# Es necesario importar los archivos donde defines las clases (Tablas)
# para que SQLModel las reconozca al hacer create_all().
try:
    from app.models import foundations, sales, design, finance, inventory
    # Si User está en foundations (según tu arquitectura):
    from app.models.foundations import User
except ImportError:
    # Fallback por si la estructura de carpetas es ligeramente distinta
    print("⚠️  Nota: Intentando importar User desde app.models...")
    from app.models import User

def reset_database():
    print("WARNING: ⚠️  ESTO BORRARÁ TODOS LOS DATOS. ⚠️")
    print("--> Conectando a la Base de Datos...")
    
    # 2. BORRAR TODO
    print("--> 💣 Eliminando tablas existentes...")
    try:
        SQLModel.metadata.drop_all(engine)
    except Exception as e:
        print(f"Nota: Error al borrar (puede que no existieran): {e}")

    # 3. CREAR TABLAS
    print("--> 🏗️  Creando tablas nuevas...")
    # Al haber importado los módulos arriba, metadata ya conoce las tablas
    SQLModel.metadata.create_all(engine)

    # 4. CREAR SUPER USUARIO (DIRECTOR)
    print("--> 👑 Creando Usuario Director...")
    
    director = User(
        email="gabriel.frias@koloka.com.mx",       
        full_name="Ing. Gabriel Frías",
        hashed_password=get_password_hash("Gf260504"), # Password
        role="DIRECTOR",
        is_active=True
    )

    with Session(engine) as session:
        session.add(director)
        session.commit()
        session.refresh(director)
        
    print("\n✅ ¡LISTO! SISTEMA REINICIADO DE FÁBRICA.")
    print(f"Usuario: {director.email}")
    print("Password: Gf260504")
    print("\nAhora puedes subir los cambios a Google Cloud.")

if __name__ == "__main__":
    reset_database()