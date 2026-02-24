from sqlalchemy import create_engine, text

# 1. Pega aquí tu URL de Render (la que empieza con postgres:// o postgresql://)
# IMPORTANTE: Asegúrate de ponerla entre comillas
DATABASE_URL = "postgresql://valentina_db_prod_user:ApTPkD67HEwhXJ6tdqWNkYCt0rkMQkPs@dpg-d6et6idm5p6s73edv780-a.ohio-postgres.render.com/valentina_db_prod"

# 2. Conectamos el motor en modo "AutoCommit" (obligatorio para modificar Enums)
engine = create_engine(DATABASE_URL, isolation_level="AUTOCOMMIT")

# 3. Inyectamos las nuevas palabras a la fuerza con un soplete SQL
try:
    with engine.connect() as conn:
        print("🔧 Conectando a la autopista de Render...")
        
        # Agregamos APPROVED
        conn.execute(text("ALTER TYPE paymentstatus ADD VALUE IF NOT EXISTS 'APPROVED';"))
        print("✅ Palabra 'APPROVED' inyectada.")
        
        # Agregamos REJECTED de una vez para prevenir futuros choques
        conn.execute(text("ALTER TYPE paymentstatus ADD VALUE IF NOT EXISTS 'REJECTED';"))
        print("✅ Palabra 'REJECTED' inyectada.")
        
        print("🏎️ ¡Reparación exitosa! El motor ya conoce las nuevas palabras.")
except Exception as e:
    print(f"❌ Ocurrió un error: {e}")