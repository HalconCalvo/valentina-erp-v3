import os
from sqlmodel import Session, select, create_engine, SQLModel
from app.models.foundations import TaxRate, GlobalConfig
from app.models.users import User
from app.core.security import get_password_hash

# ---> LA MEJORA PARA RENDER ESTÁ AQUÍ <---
# Busca la URL de producción. Si no la encuentra, usa el entorno local.
DATABASE_URL = os.getenv("DATABASE_URL", "sqlite:///local_dev.db")

engine = create_engine(DATABASE_URL)

def create_initial_data():
    # IMPORTANTE: Crear todas las tablas antes de insertar
    SQLModel.metadata.create_all(engine)
    
    with Session(engine) as session:
        # 1. CREAR TASAS DE IMPUESTOS
        print("🌱 Verificando Impuestos...")
        existing_tax = session.exec(select(TaxRate)).first()
        if not existing_tax:
            tax_16 = TaxRate(name="IVA Estándar", rate=0.16, is_active=True)
            tax_8 = TaxRate(name="IVA Frontera", rate=0.08, is_active=True)
            tax_0 = TaxRate(name="Tasa Cero", rate=0.00, is_active=True)
            session.add(tax_16)
            session.add(tax_8)
            session.add(tax_0)
            session.commit()
            print("✅ Impuestos creados (16%, 8%, 0%).")
        else:
            print("👌 Los impuestos ya existen.")

        # 2. CREAR CONFIGURACIÓN GLOBAL
        print("🌱 Verificando Configuración Global...")
        existing_config = session.exec(select(GlobalConfig)).first()
        if not existing_config:
            tax_std = session.exec(select(TaxRate).where(TaxRate.rate == 0.16)).first()
            config = GlobalConfig(
                company_name="MI EMPRESA RTA",
                target_profit_margin=35.0, # Margen objetivo ajustado a la realidad
                cost_tolerance_percent=3.0,
                quote_validity_days=15,
                default_edgebanding_factor=25.0,
                annual_sales_target=16000000.0, # 12 MDP anuales de meta
                last_year_sales=12500000.0,
                target_payroll_per_board=210.0, # Metas de eficiencia
                target_overhead_per_board=205.0,
                default_tax_rate_id=tax_std.id if tax_std else 1
            )
            session.add(config)
            session.commit()
            print("✅ Configuración Global inicial creada.")
        else:
            print("👌 La configuración ya existe.")

        # 3. CREAR USUARIO ADMINISTRADOR DE ARRANQUE
        print("🌱 Verificando Usuario Administrador...")
        admin = session.exec(select(User).where(User.email == "admin@example.com")).first()
        if not admin:
            new_admin = User(
                email="admin@example.com",
                full_name="Director SGP",
                is_active=True,
                role="DIRECTOR",
                commission_rate=0.0,
                hashed_password=get_password_hash("admin")
            )
            session.add(new_admin)
            session.commit()
            print("✅ Usuario Administrador creado (admin@example.com / admin)")
        else:
            print("👌 El administrador ya existe.")

        print("🚀 ¡Semilla de datos terminada con éxito!")

if __name__ == "__main__":
    create_initial_data()