"""Business time zone helpers. The database stores naive UTC datetimes; business dates are America/Merida."""
from datetime import date, datetime, time, timezone
from zoneinfo import ZoneInfo

BUSINESS_TZ = ZoneInfo("America/Merida")
END_OF_DAY = time(23, 59, 59)
MIDDAY = time(12, 0)


def local_to_utc_naive(local_dt: datetime) -> datetime:
    return local_dt.replace(tzinfo=BUSINESS_TZ).astimezone(timezone.utc).replace(tzinfo=None)


def utc_naive_to_local(utc_dt: datetime) -> datetime:
    return utc_dt.replace(tzinfo=timezone.utc).astimezone(BUSINESS_TZ).replace(tzinfo=None)


def cut_end_utc(cut_date: date) -> datetime:
    """Inventory cut: 23:59:59 business time of cut_date, as naive UTC."""
    return local_to_utc_naive(datetime.combine(cut_date, END_OF_DAY))


def today_local() -> date:
    return datetime.now(BUSINESS_TZ).date()


def effective_datetime_for(day: date) -> datetime:
    """Effective UTC datetime for a business date: now if it is today, otherwise midday of that day."""
    if day == today_local():
        return datetime.utcnow()
    return local_to_utc_naive(datetime.combine(day, MIDDAY))


def format_local_date(utc_dt: datetime) -> str:
    return utc_naive_to_local(utc_dt).strftime("%d/%m/%Y")
