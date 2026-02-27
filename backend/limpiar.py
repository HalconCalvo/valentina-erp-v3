from sqlalchemy import create_engine, text

# Conectamos como el Jefe
url = "postgresql+psycopg2://postgres:Admin_Valentina_2026@127.0.0.1:5433/valentina_prod"
engine = create_engine(url)

with engine.begin() as conn:
    # Le damos poder de superusuario temporalmente al empleado
    conn.execute(text('ALTER USER sgp_service WITH SUPERUSER;'))
    print("¡Poderes absolutos concedidos a sgp_service!")from sqlalchemy import create_engine, text

url = "postgresql+psycopg2://sgp_service:Sgp_2026_Secure@127.0.0.1:5433/valentina_prod"
engine = create_engine(url)

with engine.begin() as conn:
    conn.execute(text("DROP TABLE IF EXISTS alembic_version;"))
    print("¡Tabla de historial eliminada con exito!")
