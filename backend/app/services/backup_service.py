"""Backup diario PostgreSQL → Google Cloud Storage."""
import gzip
import os
import re
import subprocess
import time
from datetime import datetime, timedelta, timezone

import structlog
from google.cloud import storage

from app.core.config import settings

logger = structlog.get_logger(__name__)

BACKUP_BUCKET = "valentina-erp-v3-assets"
BACKUP_PREFIX = "backups/"
RETENTION_DAYS = 30
CREDENTIALS_FILENAME = "service_account.json"
BACKUP_NAME_RE = re.compile(r"^backups/(\d{4}-\d{2}-\d{2})\.sql\.gz$")


def _pg_dump_url(database_url: str) -> str:
    if database_url.startswith("postgresql+"):
        return "postgresql://" + database_url.split("://", 1)[1]
    return database_url


def _credentials_path() -> str | None:
    if settings.GOOGLE_APPLICATION_CREDENTIALS and os.path.exists(
        settings.GOOGLE_APPLICATION_CREDENTIALS
    ):
        return settings.GOOGLE_APPLICATION_CREDENTIALS
    local_path = os.path.normpath(
        os.path.join(
            os.path.dirname(os.path.abspath(__file__)),
            "..",
            "..",
            CREDENTIALS_FILENAME,
        )
    )
    render_path = f"/etc/secrets/{CREDENTIALS_FILENAME}"
    if os.path.exists(local_path):
        return local_path
    if os.path.exists(render_path):
        return render_path
    return None


def _get_gcs_client() -> storage.Client:
    cred_path = _credentials_path()
    if cred_path:
        return storage.Client.from_service_account_json(cred_path)
    return storage.Client()


def _cleanup_old_backups(bucket: storage.Bucket) -> None:
    cutoff = datetime.now(timezone.utc) - timedelta(days=RETENTION_DAYS)
    for blob in bucket.list_blobs(prefix=BACKUP_PREFIX):
        match = BACKUP_NAME_RE.match(blob.name)
        if not match:
            continue
        try:
            blob_date = datetime.strptime(match.group(1), "%Y-%m-%d").replace(
                tzinfo=timezone.utc
            )
        except ValueError:
            continue
        if blob_date < cutoff:
            blob.delete()
            logger.info("backup_retention_deleted", blob=blob.name, blob_date=match.group(1))


def run_backup() -> dict:
    """Ejecuta pg_dump, comprime, sube a GCS y aplica retención de 30 días."""
    started = time.perf_counter()
    date_str = datetime.now(timezone.utc).strftime("%Y-%m-%d")
    filename = f"{date_str}.sql.gz"
    blob_path = f"{BACKUP_PREFIX}{filename}"

    if not settings.DATABASE_URL.startswith("postgres"):
        detail = "DATABASE_URL no es PostgreSQL; backup omitido."
        logger.warning("backup_skipped", reason=detail)
        return {
            "status": "skipped",
            "filename": None,
            "size_mb": None,
            "duration_seconds": round(time.perf_counter() - started, 2),
            "detail": detail,
        }

    try:
        dump_url = _pg_dump_url(settings.DATABASE_URL)
        proc = subprocess.run(
            ["pg_dump", dump_url],
            capture_output=True,
            check=True,
        )
        if proc.stderr:
            logger.warning("pg_dump_stderr", stderr=proc.stderr.decode("utf-8", errors="replace")[:500])

        compressed = gzip.compress(proc.stdout, compresslevel=6)
        size_bytes = len(compressed)
        size_mb = round(size_bytes / (1024 * 1024), 2)

        client = _get_gcs_client()
        bucket = client.bucket(BACKUP_BUCKET)
        blob = bucket.blob(blob_path)
        blob.upload_from_string(compressed, content_type="application/gzip")

        _cleanup_old_backups(bucket)

        duration_seconds = round(time.perf_counter() - started, 2)
        logger.info(
            "backup_completed",
            filename=filename,
            blob_path=blob_path,
            size_mb=size_mb,
            size_bytes=size_bytes,
            duration_seconds=duration_seconds,
        )
        return {
            "status": "ok",
            "filename": filename,
            "size_mb": size_mb,
            "duration_seconds": duration_seconds,
            "detail": None,
        }
    except Exception as exc:
        logger.error("backup_failed", error=str(exc), exc_info=True)
        try:
            import sentry_sdk

            sentry_sdk.capture_exception(exc)
        except Exception:
            pass
        raise
