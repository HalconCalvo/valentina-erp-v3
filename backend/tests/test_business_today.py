"""Gabriel 23/10: every "today" Valentina suggests or uses is the Mérida day, never the UTC day (tomorrow after 18:00)."""
import re
from datetime import datetime, timezone
from pathlib import Path
from unittest.mock import patch

from app.core import business_time

APP_DIR = Path(__file__).resolve().parents[1] / "app"
UTC_TODAY = re.compile(r"date\.today\(\)|datetime\.(utcnow|now)\(\)\.date\(\)")


def test_no_utc_today_in_app():
    offenders = [
        f"{path.relative_to(APP_DIR)}:{number}"
        for path in APP_DIR.rglob("*.py")
        for number, line in enumerate(path.read_text().splitlines(), start=1)
        if UTC_TODAY.search(line)
    ]
    assert offenders == [], f"use business_time.today_local(): {offenders}"


def test_today_local_at_18_30_merida_is_still_today():
    class FakeDatetime(datetime):
        @classmethod
        def now(cls, tz=None):
            utc = datetime(2026, 10, 24, 0, 30, tzinfo=timezone.utc)  # 18:30 Mérida, 23/10
            return utc.astimezone(tz) if tz else utc.replace(tzinfo=None)

    with patch.object(business_time, "datetime", FakeDatetime):
        assert business_time.today_local().isoformat() == "2026-10-23"
