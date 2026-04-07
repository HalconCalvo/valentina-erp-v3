import os
from sqlalchemy import create_engine, text

url = os.getenv("DATABASE_URL")
if url:
    # Render usa 'postgres://' pero SQLAlchemy exige 'postgresql://'
    url = url.replace("postgres://", "postgresql://")
    engine = create_engine(url)
    with engine.connect() as conn:
        # Esto elimina todas las tablas y datos, dejando el lienzo en blanco
        conn.execute(text("DROP SCHEMA public CASCADE;"))
        conn.execute(text("CREATE SCHEMA public;"))
        conn.commit()
        print("¡Boom! Base de datos limpia desde cero. Lista para nacer de nuevo.")
else:
    print("No se encontró la base de datos.")