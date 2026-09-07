"""Shared pytest fixtures for backend integration tests."""
import os

os.environ.setdefault("DATABASE_URL", "sqlite:///:memory:")
os.environ.setdefault("DEBUG", "true")

import pytest
from fastapi.testclient import TestClient
from sqlalchemy.pool import StaticPool
from sqlmodel import Session, SQLModel, create_engine, select
import app.models  # noqa: F401 — register all SQLModel tables
from app.core import deps
from app.core.database import get_session as database_get_session
from app.core.security import create_access_token, get_password_hash
from app.main import app
from app.models.foundations import Client, TaxRate
from app.models.users import User, UserRole

TEST_DIRECTOR_EMAIL = "director@test.local"
TEST_DIRECTOR_PASSWORD = "DirectorPass123!"
TEST_SALES_EMAIL = "sales@test.local"
TEST_SALES_PASSWORD = "SalesPass123!"


def _seed_base_data(session: Session) -> None:
    session.add(TaxRate(name="IVA Test", rate=0.16, is_active=True))
    session.add(
        Client(
            full_name="Cliente Test",
            email="cliente@test.local",
            phone="5551234567",
        )
    )
    session.add(
        User(
            email=TEST_DIRECTOR_EMAIL,
            full_name="Director Test",
            hashed_password=get_password_hash(TEST_DIRECTOR_PASSWORD),
            role=UserRole.DIRECTOR,
            is_active=True,
            is_superuser=True,
        )
    )
    session.add(
        User(
            email=TEST_SALES_EMAIL,
            full_name="Sales Test",
            hashed_password=get_password_hash(TEST_SALES_PASSWORD),
            role=UserRole.SALES,
            is_active=True,
        )
    )
    session.commit()


@pytest.fixture
def engine_fixture():
    engine = create_engine(
        "sqlite://",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )
    SQLModel.metadata.create_all(engine)

    import app.core.database as database_module

    database_module.engine = engine
    deps.engine = engine

    yield engine

    SQLModel.metadata.drop_all(engine)
    engine.dispose()


@pytest.fixture
def session_fixture(engine_fixture):
    with Session(engine_fixture) as session:
        _seed_base_data(session)
        yield session
    SQLModel.metadata.drop_all(engine_fixture)
    SQLModel.metadata.create_all(engine_fixture)


@pytest.fixture
def client_fixture(session_fixture):
    def override_get_session():
        yield session_fixture

    app.dependency_overrides[database_get_session] = override_get_session
    app.dependency_overrides[deps.get_session] = override_get_session

    if hasattr(app.state, "limiter"):
        app.state.limiter.enabled = False

    with TestClient(app) as client:
        yield client

    app.dependency_overrides.clear()
    if hasattr(app.state, "limiter"):
        app.state.limiter.enabled = True


@pytest.fixture
def director_token(session_fixture):
    director = session_fixture.exec(
        select(User).where(User.email == TEST_DIRECTOR_EMAIL)
    ).first()
    return create_access_token(
        subject=director.email,
        user_id=director.id,
        user_role=UserRole.DIRECTOR.value,
    )


@pytest.fixture
def sales_token(session_fixture):
    sales = session_fixture.exec(
        select(User).where(User.email == TEST_SALES_EMAIL)
    ).first()
    return create_access_token(
        subject=sales.email,
        user_id=sales.id,
        user_role=UserRole.SALES.value,
    )


@pytest.fixture
def auth_header_director(director_token):
    return {"Authorization": f"Bearer {director_token}"}


@pytest.fixture
def seed_client_and_tax(session_fixture):
    client = session_fixture.exec(select(Client)).first()
    tax = session_fixture.exec(select(TaxRate)).first()
    return client, tax
