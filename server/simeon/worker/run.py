from simeon import tasks
from simeon.logfire import configure_logfire
from simeon.logging import configure as configure_logging
from simeon.posthog import configure_posthog
from simeon.sentry import configure_sentry
from simeon.worker import broker

configure_sentry()
configure_logfire("worker")
configure_logging(logfire=True)
configure_posthog()

__all__ = ["broker", "tasks"]
