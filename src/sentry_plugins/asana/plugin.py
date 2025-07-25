from django.urls import re_path
from requests.exceptions import HTTPError
from rest_framework.request import Request
from rest_framework.response import Response

from sentry.exceptions import PluginError, PluginIdentityRequired
from sentry.integrations.base import FeatureDescription, IntegrationFeatures
from sentry.plugins.bases.issue2 import IssueGroupActionEndpoint, IssuePlugin2
from sentry.utils.http import absolute_uri
from sentry_plugins.base import CorePluginMixin

from .client import AsanaClient

ERR_AUTH_NOT_CONFIGURED = "You still need to associate an Asana identity with this account."
ERR_BEARER_EXPIRED = "Authorization failed. Disconnect identity and reconfigure."

DESCRIPTION = """
Improve your productivity by creating tasks in Asana directly
from Sentry issues. This integration also allows you to link Sentry
issues to existing tasks in Asana.
"""


class AsanaPlugin(CorePluginMixin, IssuePlugin2):
    description = DESCRIPTION
    slug = "asana"
    title = "Asana"
    conf_title = title
    conf_key = "asana"
    auth_provider = "asana"
    required_field = "workspace"
    feature_descriptions = [
        FeatureDescription(
            """
            Create and link Sentry issue groups directly to an Asana ticket in any of your
            projects, providing a quick way to jump from a Sentry bug to tracked ticket.
            """,
            IntegrationFeatures.ISSUE_BASIC,
        ),
        FeatureDescription(
            """
            Link Sentry issues to existing Asana tickets.
            """,
            IntegrationFeatures.ISSUE_BASIC,
        ),
    ]

    def get_group_urls(self):
        return super().get_group_urls() + [
            re_path(
                r"^autocomplete",
                IssueGroupActionEndpoint.as_view(view_method_name="view_autocomplete", plugin=self),
                name=f"sentry-api-0-plugins-{self.slug}-autocomplete",
            )
        ]

    def is_configured(self, project) -> bool:
        return bool(self.get_option("workspace", project))

    def has_workspace_access(self, workspace, choices):
        for c, _ in choices:
            if workspace == c:
                return True
        return False

    def get_workspace_choices(self, workspaces):
        return [(w["gid"], w["name"]) for w in workspaces["data"]]

    def get_new_issue_fields(self, request: Request, group, event, **kwargs):
        fields = super().get_new_issue_fields(request, group, event, **kwargs)
        client = self.get_client(request.user)
        workspaces = client.get_workspaces()
        workspace_choices = self.get_workspace_choices(workspaces)
        workspace = self.get_option("workspace", group.project)
        if workspace and not self.has_workspace_access(workspace, workspace_choices):
            workspace_choices.append((workspace, workspace))

        # use labels that are more applicable to asana
        for field in fields:
            if field["name"] == "title":
                field["label"] = "Name"
            if field["name"] == "description":
                field["label"] = "Notes"
                field["required"] = False

        return [
            {
                "name": "workspace",
                "label": "Asana Workspace",
                "default": workspace,
                "type": "select",
                "choices": workspace_choices,
                "readonly": True,
            },
            *fields,
            {
                "name": "project",
                "label": "Project",
                "type": "select",
                "has_autocomplete": True,
                "required": False,
                "placeholder": "Start typing to search for a project",
            },
            {
                "name": "assignee",
                "label": "Assignee",
                "type": "select",
                "has_autocomplete": True,
                "required": False,
                "placeholder": "Start typing to search for a user",
            },
        ]

    def get_link_existing_issue_fields(self, request: Request, group, event, **kwargs):
        return [
            {
                "name": "issue_id",
                "label": "Task",
                "default": "",
                "type": "select",
                "has_autocomplete": True,
            },
            {
                "name": "comment",
                "label": "Comment",
                "default": absolute_uri(
                    group.get_absolute_url(params={"referrer": "asana_plugin"})
                ),
                "type": "textarea",
                "help": ("Leave blank if you don't want to " "add a comment to the Asana issue."),
                "required": False,
            },
        ]

    def get_client(self, user):
        auth = self.get_auth_for_user(user=user)
        if auth is None:
            raise PluginIdentityRequired(ERR_AUTH_NOT_CONFIGURED)
        return AsanaClient(auth=auth)

    def error_message_from_json(self, data):
        errors = data.get("errors")
        if errors:
            return " ".join(e["message"] for e in errors)
        return "unknown error"

    def create_issue(self, request: Request, group, form_data):
        client = self.get_client(request.user)

        try:
            response = client.create_issue(
                workspace=self.get_option("workspace", group.project), data=form_data
            )
        except Exception as e:
            self.raise_error(e, identity=client.auth)

        return response["data"]["gid"]

    def link_issue(self, request: Request, group, form_data, **kwargs):
        client = self.get_client(request.user)
        try:
            issue = client.get_issue(issue_id=form_data["issue_id"])["data"]
        except Exception as e:
            self.raise_error(e, identity=client.auth)

        comment = form_data.get("comment")
        if comment:
            try:
                client.create_comment(issue["gid"], {"text": comment})
            except Exception as e:
                self.raise_error(e, identity=client.auth)

        return {"title": issue["name"]}

    def get_issue_label(self, group, issue_id: str) -> str:
        return "Asana Issue"

    def get_issue_url(self, group, issue_id: str) -> str:
        return "https://app.asana.com/0/0/%s" % issue_id

    def validate_config(self, project, config, actor=None):
        """
        ```
        if config['foo'] and not config['bar']:
            raise PluginError('You cannot configure foo with bar')
        return config
        ```
        """
        try:
            int(config["workspace"])
        except ValueError as exc:
            self.logger.exception(str(exc))
            raise PluginError("Non-numeric workspace value")
        return config

    def get_config(self, project, user=None, initial=None, add_additional_fields: bool = False):
        try:
            client = self.get_client(user)
        except PluginIdentityRequired as e:
            self.raise_error(e)
        try:
            workspaces = client.get_workspaces()
        except HTTPError as e:
            if (
                e.response.status_code == 400
                and e.response.url == "https://app.asana.com/-/oauth_token"
            ):
                raise PluginIdentityRequired(ERR_BEARER_EXPIRED)
            raise
        workspace_choices = self.get_workspace_choices(workspaces)
        workspace = self.get_option("workspace", project)
        # check to make sure the current user has access to the workspace
        helptext = None
        if workspace and not self.has_workspace_access(workspace, workspace_choices):
            workspace_choices.append((workspace, workspace))
            helptext = (
                "This plugin has been configured for an Asana workspace "
                "that either you don't have access to or doesn't "
                "exist. You can edit the configuration, but you will not "
                "be able to change it back to the current configuration "
                "unless a teammate grants you access to the workspace in Asana."
            )
        return [
            {
                "name": "workspace",
                "label": "Workspace",
                "type": "select",
                "choices": workspace_choices,
                "default": workspace or workspaces["data"][0]["gid"],
                "help": helptext,
            }
        ]

    def view_autocomplete(self, request: Request, group, **kwargs):
        field = request.GET["autocomplete_field"]
        query = request.GET["autocomplete_query"]

        client = self.get_client(request.user)
        workspace = self.get_option("workspace", group.project)

        if field == "issue_id":
            field_name = "task"
        elif field == "assignee":
            field_name = "user"
        else:
            field_name = field

        try:
            response = client.search(workspace, field_name, query.encode("utf-8"))
        except Exception as e:
            return Response(
                {"error_type": "validation", "errors": [{"__all__": self.message_from_error(e)}]},
                status=400,
            )

        results = [
            {"text": "(#{}) {}".format(i["gid"], i["name"]), "id": i["gid"]}
            for i in response.get("data", [])
        ]
        return Response({field: results})
