from sqlmodel import Session, select
from app.core.database import engine
from app.models.users import User, UserRole
from app.core.security import get_password_hash

def create_or_fix_admin():
    with Session(engine) as session:
        # 1. Buscamos si ya existe
        user = session.exec(select(User).where(User.email == "admin@rta.com")).first()
        
        # Generamos el hash con el nuevo sistema (compatible y nativo)
        secure_hash = get_password_hash("admin123")

        if user:
            print(f"--> Usuario encontrado: {user.email}")
            print("--> Actualizando contraseña y forzando Rol de ADMIN...")
            # Actualizamos los datos críticos
            user.hashed_password = secure_hash
            user.role = UserRole.ADMIN
            user.is_active = True
            session.add(user)
            print("✅ Usuario REPARADO exitosamente.")
        else:
            print("--> El usuario no existe. Creando nuevo...")
            user = User(
                email="admin@rta.com",
                full_name="Gabriel SuperAdmin",
                hashed_password=secure_hash,
                role=UserRole.ADMIN,
                is_active=True
            )
            session.add(user)
            print("✅ Usuario CREADO exitosamente.")

        session.commit()
        print("------------------------------------------")
        print("Usuario: admin@rta.com")
        print("Pass:    admin123")
        print("------------------------------------------")

if __name__ == "__main__":
    create_or_fix_admin()