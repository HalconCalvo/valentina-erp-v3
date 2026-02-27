import sys
import os
from dotenv import load_dotenv
from logging.config import fileConfig
from sqlalchemy import engine_from_config, pool
from sqlmodel import SQLModel
from alembic import context

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.realpath(__file__))))
from app.models import foundations  # <--- Importa tus modelos corregidos

# Esto carga tu archivo .env cuando estás en tu Mac
load_dotenv() 

# 1. PRIMERO sacamos el objeto 'config' de Alembic
config = context.config

# 2. Leemos la URL de la variable de entorno (si existe)
db_url = os.environ.get("DATABASE_URL")

# 3. Si la variable de entorno existe, sobreescribimos el alembic.ini
if db_url:
    config.set_main_option("sqlalchemy.url", db_url)

# Configuramos los logs de Alembic
if config.config_file_name is not None:
    fileConfig(config.config_file_name)
    
target_metadata = SQLModel.metadata

def run_migrations_offline() -> None:
    url = config.get_main_option("sqlalchemy.url")
    context.configure(url=url, target_metadata=target_metadata, literal_binds=True, dialect_opts={"paramstyle": "named"})
    with context.begin_transaction():
        context.run_migrations()

def run_migrations_online() -> None:
    connectable = engine_from_config(config.get_section(config.config_ini_section, {}), prefix="sqlalchemy.", poolclass=pool.NullPool)
    with connectable.connect() as connection:
        context.configure(connection=connection, target_metadata=target_metadata,
        render_as_batch=True)
        with context.begin_transaction():
            context.run_migrations()

if context.is_offline_mode():
    run_migrations_offline()
else:
    run_migrations_online()
