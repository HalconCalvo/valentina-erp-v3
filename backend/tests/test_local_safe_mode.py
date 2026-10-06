from io import BytesIO

import pytest

from app import main
from app.core.config import settings
from app.services import backup_service, cloud_storage, email_service


@pytest.fixture
def safe_mode(monkeypatch):
    monkeypatch.setattr(settings, "LOCAL_SAFE_MODE", True)


def _fail(*_args, **_kwargs):
    raise AssertionError("must not be called in LOCAL_SAFE_MODE")


def test_scheduler_does_not_start(safe_mode, monkeypatch):
    monkeypatch.setattr(main, "start_scheduler", _fail)
    main.start_background_jobs()


def test_scheduler_starts_when_safe_mode_is_off(monkeypatch):
    monkeypatch.setattr(settings, "LOCAL_SAFE_MODE", False)
    calls = []
    monkeypatch.setattr(main, "start_scheduler", lambda: calls.append(True))
    main.start_background_jobs()
    assert calls == [True]


def test_backup_is_skipped(safe_mode, monkeypatch):
    monkeypatch.setattr(backup_service, "_get_gcs_client", _fail)
    monkeypatch.setattr(backup_service.subprocess, "run", _fail)
    result = backup_service.run_backup()
    assert result["status"] == "skipped"


def test_upload_returns_none_without_creating_client(safe_mode, monkeypatch):
    monkeypatch.setattr(cloud_storage.storage.Client, "from_service_account_json", _fail)
    assert cloud_storage.upload_to_gcs(BytesIO(b"x"), "evidence/test.jpg") is None


def test_email_is_not_sent(safe_mode, monkeypatch):
    monkeypatch.setattr(email_service.requests, "post", _fail)
    assert email_service.send_purchase_order_email(
        "smtp", "from@test.local", "secret", "provider@test.local", "Proveedor", "OC-0001"
    ) is None
