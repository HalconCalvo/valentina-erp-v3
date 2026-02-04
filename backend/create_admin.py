from sqlmodel import Session, select
from app.core.database import engine
from app.models.users import User, UserRole
from app.core.security import get_password_hash

def create_super_admin():
    with Session(engine) as session:
        # Verificar si ya existe
        existing_user = session.exec(select(User).where(User.email == "admin@rta.com")).first()
        if existing_user:
            print("El usuario admin@rta.com ya existe.")
            return

        print("--> Creando Super Admin...")
        
        admin_user = User(
            email="admin@rta.com",
            full_name="Gabriel SuperAdmin",
            hashed_password=get_password_hash("admin123"), # Contraseña temporal
            role=UserRole.DIRECTOR,
            is_active=True
        )
        
        session.add(admin_user)
        session.commit()
        print("✅ ¡Usuario Creado Exitosamente!")
        print("Usuario: admin@rta.com")
        print("Pass: admin123")

if __name__ == "__main__":
    create_super_admin()