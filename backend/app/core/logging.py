"""Structured logging configuration for Valentina ERP backend."""
import logging
import sys

import structlog

from app.core.config import settings

_CONFIGURED = False


def _forward_errors_to_sentry(
    logger: structlog.types.WrappedLogger,
    method_name: str,
    event_dict: structlog.types.EventDict,
) -> structlog.types.EventDict:
    """Send structlog ERROR/CRITICAL events to Sentry when configured."""
    if method_name not in ("error", "critical") or not settings.SENTRY_DSN:
        return event_dict

    import sentry_sdk

    user_id = event_dict.get("user_id")
    path = event_dict.get("path")

    with sentry_sdk.push_scope() as scope:
        if user_id is not None:
            scope.set_user({"id": str(user_id)})
        if path:
            scope.set_tag("path", str(path))
        for key, value in event_dict.items():
            if key in ("exc_info", "stack_info"):
                continue
            scope.set_extra(key, value)

        exc_info = event_dict.get("exc_info")
        event_name = event_dict.get("event") or event_dict.get("message") or "logged_error"

        if exc_info is True:
            sentry_sdk.capture_exception()
        elif exc_info:
            sentry_sdk.capture_exception(exc_info)
        else:
            sentry_sdk.capture_message(str(event_name), level="error")

    return event_dict


def configure_logging() -> None:
    """Configure structlog once at application startup."""
    global _CONFIGURED
    if _CONFIGURED:
        return

    timestamper = structlog.processors.TimeStamper(fmt="iso", key="timestamp")

    shared_processors: list[structlog.types.Processor] = [
        structlog.contextvars.merge_contextvars,
        structlog.stdlib.add_log_level,
        structlog.stdlib.add_logger_name,
        timestamper,
        structlog.processors.StackInfoRenderer(),
        structlog.processors.format_exc_info,
        structlog.processors.UnicodeDecoder(),
        _forward_errors_to_sentry,
    ]

    if settings.DEBUG:
        renderer: structlog.types.Processor = structlog.dev.ConsoleRenderer(colors=True)
    else:
        renderer = structlog.processors.JSONRenderer()

    structlog.configure(
        processors=[
            *shared_processors,
            structlog.stdlib.ProcessorFormatter.wrap_for_formatter,
        ],
        logger_factory=structlog.stdlib.LoggerFactory(),
        wrapper_class=structlog.stdlib.BoundLogger,
        cache_logger_on_first_use=True,
    )

    formatter = structlog.stdlib.ProcessorFormatter(
        foreign_pre_chain=shared_processors,
        processors=[
            structlog.stdlib.ProcessorFormatter.remove_processors_meta,
            renderer,
        ],
    )

    handler = logging.StreamHandler(sys.stdout)
    handler.setFormatter(formatter)

    root_logger = logging.getLogger()
    root_logger.handlers.clear()
    root_logger.addHandler(handler)
    root_logger.setLevel(logging.DEBUG if settings.DEBUG else logging.INFO)

    _CONFIGURED = True
