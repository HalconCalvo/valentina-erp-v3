from sqlmodel import Session, select, create_engine
# CORRECCIÓN AQUÍ: ProductionRoute ahora viene de material, no de foundations
from app.models.foundations import TaxRate, GlobalConfig
from app.models.material import Material, ProductionRoute
# Ajusta la ruta si es necesario para tu entorno local
from app.core.config import settings

# Conexión directa a la BD SQLite
sqlite_url = "sqlite:///sgp_v3.db"
engine = create_engine(sqlite_url)

def create_initial_data():
    with Session(engine) as session:
        # 1. CREAR TASAS DE IMPUESTOS (TaxRates)
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
            # Buscamos el ID del tax recién creado
            tax_std = session.exec(select(TaxRate).where(TaxRate.rate == 0.16)).first()
            
            config = GlobalConfig(
                company_name="MI EMPRESA RTA",
                target_profit_margin=35.0,     # 35% Margen
                cost_tolerance_percent=3.0,    # 3% Tolerancia
                quote_validity_days=15,
                default_edgebanding_factor=1.10, # 10% desperdicio
                default_tax_rate_id=tax_std.id if tax_std else 1
            )
            session.add(config)
            session.commit()
            print("✅ Configuración Global inicial creada.")
        else:
            print("👌 La configuración ya existe.")

        print("🚀 ¡Semilla de datos terminada con éxito!")

if __name__ == "__main__":
    create_initial_data()