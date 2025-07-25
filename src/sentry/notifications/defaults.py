from sentry.integrations.types import ExternalProviderEnum
from sentry.notifications.types import NotificationSettingEnum, NotificationSettingsOptionEnum

"""
These mappings represents how to interpret the absence of a DB row for a given
provider. For example, a user with no NotificationSettings should be opted
into receiving emails but no Slack messages.
"""

# This specifies the default value for each type of notification
NOTIFICATION_SETTINGS_TYPE_DEFAULTS = {
    NotificationSettingEnum.DEPLOY: NotificationSettingsOptionEnum.COMMITTED_ONLY,
    NotificationSettingEnum.ISSUE_ALERTS: NotificationSettingsOptionEnum.ALWAYS,
    NotificationSettingEnum.WORKFLOW: NotificationSettingsOptionEnum.SUBSCRIBE_ONLY,
    NotificationSettingEnum.APPROVAL: NotificationSettingsOptionEnum.ALWAYS,
    NotificationSettingEnum.QUOTA: NotificationSettingsOptionEnum.ALWAYS,
    NotificationSettingEnum.QUOTA_ERRORS: NotificationSettingsOptionEnum.ALWAYS,
    NotificationSettingEnum.QUOTA_TRANSACTIONS: NotificationSettingsOptionEnum.ALWAYS,
    NotificationSettingEnum.QUOTA_ATTACHMENTS: NotificationSettingsOptionEnum.ALWAYS,
    NotificationSettingEnum.QUOTA_REPLAYS: NotificationSettingsOptionEnum.ALWAYS,
    NotificationSettingEnum.QUOTA_MONITOR_SEATS: NotificationSettingsOptionEnum.ALWAYS,
    NotificationSettingEnum.QUOTA_SPANS: NotificationSettingsOptionEnum.ALWAYS,
    NotificationSettingEnum.QUOTA_PROFILE_DURATION: NotificationSettingsOptionEnum.ALWAYS,
    NotificationSettingEnum.QUOTA_PROFILE_DURATION_UI: NotificationSettingsOptionEnum.ALWAYS,
    NotificationSettingEnum.QUOTA_SEER_BUDGET: NotificationSettingsOptionEnum.ALWAYS,
    NotificationSettingEnum.QUOTA_LOG_BYTES: NotificationSettingsOptionEnum.ALWAYS,
    NotificationSettingEnum.QUOTA_WARNINGS: NotificationSettingsOptionEnum.ALWAYS,
    NotificationSettingEnum.QUOTA_SPEND_ALLOCATIONS: NotificationSettingsOptionEnum.ALWAYS,
    NotificationSettingEnum.QUOTA_THRESHOLDS: NotificationSettingsOptionEnum.ALWAYS,
    NotificationSettingEnum.SPIKE_PROTECTION: NotificationSettingsOptionEnum.ALWAYS,
    NotificationSettingEnum.REPORTS: NotificationSettingsOptionEnum.ALWAYS,
    NotificationSettingEnum.BROKEN_MONITORS: NotificationSettingsOptionEnum.ALWAYS,
}


# email and slack are defaulted to being on
DEFAULT_ENABLED_PROVIDERS = [
    ExternalProviderEnum.EMAIL,
    ExternalProviderEnum.SLACK,
]

DEFAULT_ENABLED_PROVIDERS_VALUES = [
    ExternalProviderEnum.EMAIL.value,
    ExternalProviderEnum.SLACK.value,
]
