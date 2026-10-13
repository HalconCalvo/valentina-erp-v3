"""Valentina Pruebas: APP_ENVIRONMENT=pruebas forces safe mode (no email, cloud or backups)."""
import importlib
import os

from app.core import config


def test_pruebas_forces_safe_mode(monkeypatch):
    monkeypatch.setenv("APP_ENVIRONMENT", "pruebas")
    monkeypatch.setenv("LOCAL_SAFE_MODE", "false")
    try:
        reloaded = importlib.reload(config)
        assert reloaded.settings.LOCAL_SAFE_MODE is True
    finally:
        monkeypatch.delenv("APP_ENVIRONMENT")
        monkeypatch.setenv("LOCAL_SAFE_MODE", os.environ.get("LOCAL_SAFE_MODE", "true"))
        importlib.reload(config)


def test_root_reports_the_environment(client_fixture):
    data = client_fixture.get("/").json()
    assert data["Environment"] and data["SafeMode"] is True  # tests always run in safe mode
