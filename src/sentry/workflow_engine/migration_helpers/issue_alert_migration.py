import logging
from typing import Any

from django.db import router, transaction
from rest_framework import status

from sentry.api.exceptions import SentryAPIException
from sentry.constants import ObjectStatus
from sentry.grouping.grouptype import ErrorGroupType
from sentry.locks import locks
from sentry.models.project import Project
from sentry.models.rule import Rule, RuleSource
from sentry.models.rulesnooze import RuleSnooze
from sentry.rules.conditions.event_frequency import EventUniqueUserFrequencyConditionWithConditions
from sentry.rules.conditions.every_event import EveryEventCondition
from sentry.rules.processing.processor import split_conditions_and_filters
from sentry.utils.locking import UnableToAcquireLock
from sentry.workflow_engine.migration_helpers.issue_alert_conditions import (
    create_event_unique_user_frequency_condition_with_conditions,
    translate_to_data_condition,
)
from sentry.workflow_engine.migration_helpers.rule_action import (
    build_notification_actions_from_rule_data_actions,
)
from sentry.workflow_engine.models import (
    AlertRuleDetector,
    AlertRuleWorkflow,
    DataCondition,
    DataConditionGroup,
    DataConditionGroupAction,
    Detector,
    DetectorWorkflow,
    Workflow,
    WorkflowDataConditionGroup,
)
from sentry.workflow_engine.models.data_condition import (
    Condition,
    enforce_data_condition_json_schema,
)
from sentry.workflow_engine.types import ERROR_DETECTOR_NAME

logger = logging.getLogger(__name__)

SKIPPED_CONDITIONS = [Condition.EVERY_EVENT]


class UnableToAcquireLockApiError(SentryAPIException):
    status_code = status.HTTP_400_BAD_REQUEST
    code = "unable_to_acquire_lock"
    message = "Unable to acquire lock for issue alert migration."


def ensure_default_error_detector(project: Project) -> Detector:
    """
    Ensure that the default error detector exists for a project.
    If the Detector doesn't already exist, we try to acquire a lock to avoid double-creating,
    and UnableToAcquireLockApiError if that fails.
    """
    # If it already exists, life is simple and we can return immediately.
    # If there happen to be duplicates, we prefer the oldest.
    existing = (
        Detector.objects.filter(type=ErrorGroupType.slug, project=project).order_by("id").first()
    )
    if existing:
        return existing

    # If we may need to create it, we acquire a lock to avoid double-creating.
    # There isn't a unique constraint on the detector, so we can't rely on get_or_create
    # to avoid duplicates.
    # However, by only locking during the one-time creation, the window for a race condition is small.
    lock = locks.get(
        f"workflow-engine-project-error-detector:{project.id}",
        duration=2,
        name="workflow_engine_default_error_detector",
    )
    try:
        with (
            # Creation should be fast, so it's worth blocking a little rather
            # than failing a request.
            lock.blocking_acquire(initial_delay=0.1, timeout=3),
            transaction.atomic(router.db_for_write(Detector)),
        ):
            detector, _ = Detector.objects.get_or_create(
                type=ErrorGroupType.slug,
                project=project,
                defaults={"config": {}, "name": ERROR_DETECTOR_NAME},
            )
            return detector
    except UnableToAcquireLock:
        raise UnableToAcquireLockApiError


class IssueAlertMigrator:
    def __init__(
        self,
        rule: Rule,
        user_id: int | None = None,
        is_dry_run: bool | None = False,
        should_create_actions: bool | None = True,
    ):
        self.rule = rule
        self.user_id = user_id
        self.is_dry_run = is_dry_run
        self.should_create_actions = should_create_actions
        self.data = rule.data
        self.project = rule.project
        self.organization = self.project.organization

    def run(self) -> Workflow:
        error_detector = self._create_detector_lookup()
        conditions, filters = split_conditions_and_filters(self.data["conditions"])
        action_match = self.data.get("action_match") or Rule.DEFAULT_CONDITION_MATCH
        workflow = self._create_workflow_and_lookup(
            conditions=conditions,
            filters=filters,
            action_match=action_match,
            detector=error_detector,
        )
        filter_match = self.data.get("filter_match") or Rule.DEFAULT_FILTER_MATCH
        if_dcg = self._create_if_dcg(
            filter_match=filter_match,
            workflow=workflow,
            conditions=conditions,
            filters=filters,
        )
        if self.should_create_actions:
            self._create_workflow_actions(if_dcg=if_dcg, actions=self.data["actions"])

        return workflow

    def _create_detector_lookup(self) -> Detector | None:
        if self.rule.source == RuleSource.CRON_MONITOR:
            return None

        if self.is_dry_run:
            error_detector = Detector.objects.filter(
                type=ErrorGroupType.slug, project=self.project
            ).first()
            if not error_detector:
                error_detector = Detector(type=ErrorGroupType.slug, project=self.project)

        else:
            error_detector, _ = Detector.objects.get_or_create(
                type=ErrorGroupType.slug,
                project=self.project,
                defaults={"config": {}, "name": ERROR_DETECTOR_NAME},
            )
            AlertRuleDetector.objects.get_or_create(detector=error_detector, rule_id=self.rule.id)

        return error_detector

    def _bulk_create_data_conditions(
        self,
        conditions: list[dict[str, Any]],
        dcg: DataConditionGroup,
        filters: list[dict[str, Any]] | None = None,
    ):
        dcg_conditions: list[DataCondition] = []

        for condition in conditions:
            try:
                if (
                    condition["id"] == EventUniqueUserFrequencyConditionWithConditions.id
                ):  # special case: this condition uses filters, so the migration needs to combine the filters into the condition
                    dcg_conditions.append(
                        create_event_unique_user_frequency_condition_with_conditions(
                            dict(condition), dcg, filters
                        )
                    )
                else:
                    dcg_conditions.append(translate_to_data_condition(dict(condition), dcg=dcg))
            except Exception as e:
                logger.exception(
                    "workflow_engine.issue_alert_migration.error",
                    extra={"rule_id": self.rule.id, "error": str(e)},
                )
                if self.is_dry_run:
                    raise
                else:
                    continue

        filtered_data_conditions = [
            dc for dc in dcg_conditions if dc.type not in SKIPPED_CONDITIONS
        ]

        if self.is_dry_run:
            for dc in filtered_data_conditions:
                dc.full_clean(
                    exclude=["condition_group"]
                )  # condition_group will be null, which is not allowed
                enforce_data_condition_json_schema(dc)
            return filtered_data_conditions

        data_conditions: list[DataCondition] = []
        # try one by one, ignoring errors
        for dc in filtered_data_conditions:
            try:
                dc.save()
                data_conditions.append(dc)
            except Exception as e:
                logger.exception(
                    "workflow_engine.issue_alert_migration.error",
                    extra={"rule_id": self.rule.id, "error": str(e)},
                )

        return data_conditions

    def _create_when_dcg(
        self,
        action_match: str,
    ):
        if action_match == "any":
            logic_type = DataConditionGroup.Type.ANY_SHORT_CIRCUIT.value
        else:
            logic_type = DataConditionGroup.Type(action_match)

        kwargs = {"organization": self.organization, "logic_type": logic_type}

        if self.is_dry_run:
            when_dcg = DataConditionGroup(**kwargs)
            when_dcg.full_clean()
        else:
            when_dcg = DataConditionGroup.objects.create(**kwargs)

        return when_dcg

    def _create_workflow_and_lookup(
        self,
        conditions: list[dict[str, Any]],
        filters: list[dict[str, Any]],
        action_match: str,
        detector: Detector | None,
    ) -> Workflow:
        when_dcg = self._create_when_dcg(action_match=action_match)
        data_conditions = self._bulk_create_data_conditions(
            conditions=conditions, filters=filters, dcg=when_dcg
        )

        # the only time the data_conditions list will be empty is if somebody only has EveryEventCondition in their conditions list.
        # if it's empty and this is not the case, we should not migrate
        no_conditions = len(conditions) == 0
        no_data_conditions = len(data_conditions) == 0
        only_has_every_event_cond = (
            len(
                [condition for condition in conditions if condition["id"] == EveryEventCondition.id]
            )
            > 0
        )

        if not self.is_dry_run:
            if no_data_conditions and no_conditions:
                # originally no conditions and we expect no data conditions
                pass
            elif no_data_conditions and not only_has_every_event_cond:
                raise Exception("No valid trigger conditions, skipping migration")

        enabled = True
        rule_snooze = RuleSnooze.objects.filter(rule=self.rule, user_id=None).first()
        if rule_snooze and rule_snooze.until is None:
            enabled = False
        if self.rule.status == ObjectStatus.DISABLED:
            enabled = False

        config = {"frequency": self.rule.data.get("frequency") or Workflow.DEFAULT_FREQUENCY}
        kwargs = {
            "organization": self.organization,
            "name": self.rule.label,
            "environment_id": self.rule.environment_id,
            "when_condition_group": when_dcg,
            "created_by_id": self.user_id,
            "owner_user_id": self.rule.owner_user_id,
            "owner_team": self.rule.owner_team,
            "config": config,
            "enabled": enabled,
        }

        if self.is_dry_run:
            workflow = Workflow(**kwargs)
            workflow.full_clean(exclude=["when_condition_group"])
            workflow.validate_config(workflow.config_schema)
            if AlertRuleWorkflow.objects.filter(rule_id=self.rule.id).exists():
                raise Exception("Issue alert already migrated")
        else:
            workflow = Workflow.objects.create(**kwargs)
            workflow.update(date_added=self.rule.date_added)
            if detector:
                DetectorWorkflow.objects.create(detector=detector, workflow=workflow)
            AlertRuleWorkflow.objects.create(rule_id=self.rule.id, workflow=workflow)

        return workflow

    def _create_if_dcg(
        self,
        filter_match: str,
        workflow: Workflow,
        conditions: list[dict[str, Any]],
        filters: list[dict[str, Any]],
    ) -> DataConditionGroup:
        if (
            filter_match == "any" or filter_match is None
        ):  # must create IF DCG even if it's empty, to attach actions
            logic_type = DataConditionGroup.Type.ANY_SHORT_CIRCUIT
        else:
            logic_type = DataConditionGroup.Type(filter_match)

        kwargs = {
            "organization": self.organization,
            "logic_type": logic_type,
        }

        if self.is_dry_run:
            if_dcg = DataConditionGroup(**kwargs)
            if_dcg.full_clean()
        else:
            if_dcg = DataConditionGroup.objects.create(**kwargs)
            WorkflowDataConditionGroup.objects.create(workflow=workflow, condition_group=if_dcg)

        conditions_ids = [condition["id"] for condition in conditions]
        # skip migrating filters for special case
        if EventUniqueUserFrequencyConditionWithConditions.id not in conditions_ids:
            self._bulk_create_data_conditions(conditions=filters, dcg=if_dcg)

        return if_dcg

    def _create_workflow_actions(
        self, if_dcg: DataConditionGroup, actions: list[dict[str, Any]]
    ) -> None:
        notification_actions = build_notification_actions_from_rule_data_actions(
            actions, is_dry_run=self.is_dry_run or False
        )
        dcg_actions = [
            DataConditionGroupAction(action=action, condition_group=if_dcg)
            for action in notification_actions
        ]
        if not self.is_dry_run:
            DataConditionGroupAction.objects.bulk_create(dcg_actions)
