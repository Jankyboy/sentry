from sentry.utils.warnings import seen_warnings

from .base import Problem, StatusCheck, sort_by_severity
from .celery_alive import CeleryAliveCheck
from .celery_app_version import CeleryAppVersionCheck
from .warnings import WarningStatusCheck

__all__ = ("check_all", "sort_by_severity", "Problem", "StatusCheck")


checks = [CeleryAliveCheck(), CeleryAppVersionCheck(), WarningStatusCheck(seen_warnings)]


def check_all() -> dict[StatusCheck, list[Problem]]:
    return {check: check.check() for check in checks}
