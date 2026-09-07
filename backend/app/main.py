import os
from contextlib import asynccontextmanager

import structlog
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from passlib.context import CryptContext
from slowapi import Limiter, _rate_limit_exceeded_handler
from slowapi.errors import RateLimitExceeded
from slowapi.util import get_remote_address
from sqlmodel import Session, select

from app.api.v1.api import api_router
from app.core.config import settings

if settings.SENTRY_DSN:
    import sentry_sdk
    from sentry_sdk.integrations.fastapi import FastApiIntegration
    from sentry_sdk.integrations.sqlalchemy import SqlalchemyIntegration

    sentry_sdk.init(
        dsn=settings.SENTRY_DSN,
        environment="development" if settings.DEBUG else "production",
        traces_sample_rate=0.2,
        integrations=[
            FastApiIntegration(),
            SqlalchemyIntegration(),
        ],
    )

from app.core.database import create_db_and_tables, engine
from app.core.logging import configure_logging
from app.core.middleware import add_request_logging_middleware
from app.models.foundations import GlobalConfig, TaxRate
from app.models.users import User

configure_logging()
logger = structlog.get_logger(__name__)

if settings.GOOGLE_APPLICATION_CREDENTIALS and os.path.exists(settings.GOOGLE_APPLICATION_CREDENTIALS):
    os.environ["GOOGLE_APPLICATION_CREDENTIALS"] = settings.GOOGLE_APPLICATION_CREDENTIALS
    logger.info("google_cloud_credentials_loaded")
else:
    logger.warning("google_cloud_credentials_missing", mode="offline")

pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")


@asynccontextmanager
async def lifespan(app: FastAPI):
    logger.info("database_initialization_started")
    try:
        create_db_and_tables()

        with Session(engine) as session:
            logger.info("configuration_seed_check_started")

            if not session.exec(select(TaxRate)).first():
                session.add(TaxRate(name="IVA Estándar", rate=0.16, is_active=True))
                session.add(TaxRate(name="IVA Frontera", rate=0.08, is_active=True))
                session.add(TaxRate(name="Tasa Cero", rate=0.00, is_active=True))
                session.commit()
                logger.info("tax_rates_seeded")

            if not session.exec(select(GlobalConfig)).first():
                tax_std = session.exec(select(TaxRate).where(TaxRate.rate == 0.16)).first()
                session.add(GlobalConfig(
                    company_name="MI EMPRESA RTA",
                    target_profit_margin=0.45,
                    cost_tolerance_percent=0.03,
                    quote_validity_days=15,
                    default_edgebanding_factor=25,
                    default_tax_rate_id=tax_std.id if tax_std else 1,
                ))
                session.commit()
                logger.info("global_config_seeded")

            if not session.exec(select(User).where(User.email == "admin@example.com")).first():
                session.add(User(
                    email="admin@example.com",
                    full_name="Director SGP",
                    hashed_password=pwd_context.hash("admin"),
                    role="DIRECTOR",
                    is_active=True,
                    is_superuser=True,
                    commission_rate=0.0,
                ))
                session.commit()
                logger.info("admin_user_seeded", email="admin@example.com")

        logger.info("system_ready")
    except Exception as exc:
        logger.error("database_initialization_failed", error=str(exc))
    yield
    logger.info("system_shutdown")


app = FastAPI(
    title=settings.PROJECT_NAME,
    version="3.5.0",
    lifespan=lifespan,
    redirect_slashes=False,
)

limiter = Limiter(key_func=get_remote_address)
app.state.limiter = limiter
app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)

app_dir = os.path.dirname(__file__)
backend_root = os.path.dirname(app_dir)
static_dir = os.path.join(backend_root, "static")
if not os.path.exists(static_dir):
    os.makedirs(static_dir)
app.mount("/static", StaticFiles(directory=static_dir), name="static")

origins = [
    "http://localhost:5173",
    "http://127.0.0.1:5173",
    "http://localhost:3000",
    "http://127.0.0.1:8000",
    "https://valentina-frontend.onrender.com",
]

if settings.BACKEND_CORS_ORIGINS:
    extra_origins = [str(origin).rstrip("/") for origin in settings.BACKEND_CORS_ORIGINS]
    origins.extend(extra_origins)

app.add_middleware(
    CORSMiddleware,
    allow_origins=origins,
    allow_credentials=True,
    allow_methods=["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allow_headers=["Authorization", "Content-Type", "Accept", "Origin"],
)

add_request_logging_middleware(app)

app.include_router(api_router, prefix=settings.API_V1_STR)


@app.get("/")
def read_root():
    return {"System": "SGP V3.5 API", "Status": "Online"}
