import {ConfigFixture} from 'sentry-fixture/config';
import {EnvironmentsFixture} from 'sentry-fixture/environments';
import {EventFixture} from 'sentry-fixture/event';
import {EventsStatsFixture} from 'sentry-fixture/events';
import {GroupFixture} from 'sentry-fixture/group';
import {LocationFixture} from 'sentry-fixture/locationFixture';
import {ProjectFixture} from 'sentry-fixture/project';
import {TeamFixture} from 'sentry-fixture/team';
import {UserFixture} from 'sentry-fixture/user';

import {initializeOrg} from 'sentry-test/initializeOrg';
import {act, render, screen, waitFor} from 'sentry-test/reactTestingLibrary';
import {setWindowLocation} from 'sentry-test/utils';

import ConfigStore from 'sentry/stores/configStore';
import GroupStore from 'sentry/stores/groupStore';
import OrganizationStore from 'sentry/stores/organizationStore';
import PageFiltersStore from 'sentry/stores/pageFiltersStore';
import ProjectsStore from 'sentry/stores/projectsStore';
import {IssueCategory} from 'sentry/types/group';
import GroupDetails from 'sentry/views/issueDetails/groupDetails';
import {useHasStreamlinedUI} from 'sentry/views/issueDetails/utils';

const SAMPLE_EVENT_ALERT_TEXT =
  'You are viewing a sample error. Configure Sentry to start viewing real errors.';

jest.mock('sentry/views/issueDetails/utils', () => ({
  ...jest.requireActual('sentry/views/issueDetails/utils'),
  useHasStreamlinedUI: jest.fn(),
}));

describe('groupDetails', () => {
  let mockNavigate: jest.Mock;
  const group = GroupFixture({issueCategory: IssueCategory.ERROR});
  const event = EventFixture();
  const project = ProjectFixture({teams: [TeamFixture()]});
  let hasSeenMock!: jest.Mock;

  const initialRouterConfig = {
    location: {
      pathname: `/organizations/org-slug/issues/${group.id}/`,
    },
    route: '/organizations/:orgId/issues/:groupId/',
  };

  const defaultInit = initializeOrg<{groupId: string}>({});

  const recommendedUser = UserFixture({
    options: {
      ...UserFixture().options,
      defaultIssueEvent: 'recommended',
    },
  });
  const latestUser = UserFixture({
    options: {
      ...UserFixture().options,
      defaultIssueEvent: 'latest',
    },
  });
  const oldestUser = UserFixture({
    options: {
      ...UserFixture().options,
      defaultIssueEvent: 'oldest',
    },
  });

  function MockComponent() {
    return <div>Group Details Mock</div>;
  }

  const createWrapper = (
    routerConfig = initialRouterConfig,
    organization = defaultInit.organization
  ) => {
    // Add project id to the url to skip over the _allp redirect
    setWindowLocation(`http://localhost/?project=${group.project.id}`);
    return render(
      <GroupDetails>
        <MockComponent />
      </GroupDetails>,
      {
        organization,
        initialRouterConfig: routerConfig,
      }
    );
  };

  beforeEach(() => {
    mockNavigate = jest.fn();
    jest.mocked(useHasStreamlinedUI).mockReturnValue(false);
    MockApiClient.clearMockResponses();
    OrganizationStore.onUpdate(defaultInit.organization);
    act(() => ProjectsStore.loadInitialData(defaultInit.projects));

    MockApiClient.addMockResponse({
      url: `/assistant/`,
      body: [],
    });
    MockApiClient.addMockResponse({
      url: `/organizations/${defaultInit.organization.slug}/issues/${group.id}/`,
      body: {...group},
    });
    MockApiClient.addMockResponse({
      url: `/organizations/${defaultInit.organization.slug}/issues/${group.id}/events/recommended/`,
      statusCode: 200,
      body: {
        ...event,
      },
    });
    hasSeenMock = MockApiClient.addMockResponse({
      url: `/projects/org-slug/${project.slug}/issues/`,
      method: 'PUT',
      body: {
        hasSeen: false,
      },
    });
    MockApiClient.addMockResponse({
      url: '/organizations/org-slug/projects/',
      body: [project],
    });
    MockApiClient.addMockResponse({
      url: `/organizations/${defaultInit.organization.slug}/issues/${group.id}/first-last-release/`,
      method: 'GET',
    });
    MockApiClient.addMockResponse({
      url: `/organizations/${defaultInit.organization.slug}/events/`,
      statusCode: 200,
      body: {
        data: [
          {
            'count()': 1,
          },
        ],
      },
    });
    MockApiClient.addMockResponse({
      url: `/organizations/${defaultInit.organization.slug}/environments/`,
      body: EnvironmentsFixture(),
    });
    MockApiClient.addMockResponse({
      url: `/organizations/${defaultInit.organization.slug}/issues/${group.id}/tags/`,
      body: [],
    });
    MockApiClient.addMockResponse({
      url: '/organizations/org-slug/replay-count/',
      body: {},
    });
    MockApiClient.addMockResponse({
      url: `/projects/${defaultInit.organization.slug}/${project.slug}/`,
      body: project,
    });
  });

  afterEach(() => {
    act(() => ProjectsStore.reset());
    GroupStore.reset();
    PageFiltersStore.reset();
    MockApiClient.clearMockResponses();
    jest.clearAllMocks();
  });

  it('renders', async function () {
    act(() => ProjectsStore.reset());
    createWrapper();

    expect(screen.queryByText(group.title)).not.toBeInTheDocument();

    act(() => ProjectsStore.loadInitialData(defaultInit.projects));

    expect(await screen.findByText(group.shortId)).toBeInTheDocument();

    // Sample event alert should not show up
    expect(screen.queryByText(SAMPLE_EVENT_ALERT_TEXT)).not.toBeInTheDocument();
    expect(hasSeenMock).toHaveBeenCalled();
  });

  it('renders error when issue is not found', async function () {
    MockApiClient.addMockResponse({
      url: `/organizations/${defaultInit.organization.slug}/issues/${group.id}/`,
      statusCode: 404,
    });
    MockApiClient.addMockResponse({
      url: `/organization/${defaultInit.organization.slug}/issues/${group.id}/events/recommended/`,
      statusCode: 404,
    });

    createWrapper();

    await waitFor(() =>
      expect(screen.queryByTestId('loading-indicator')).not.toBeInTheDocument()
    );

    expect(
      await screen.findByText('The issue you were looking for was not found.')
    ).toBeInTheDocument();
  });

  it('renders MissingProjectMembership when trying to access issue in project the user does not belong to', async function () {
    MockApiClient.addMockResponse({
      url: `/organizations/${defaultInit.organization.slug}/issues/${group.id}/`,
      statusCode: 403,
    });
    MockApiClient.addMockResponse({
      url: `/organizations/${defaultInit.organization.slug}/issues/${group.id}/events/recommended/`,
      statusCode: 403,
    });

    createWrapper();
    expect(
      await screen.findByText(
        'No teams have access to this project yet. Ask an admin to add your team to this project.'
      )
    ).toBeInTheDocument();
  });

  it('fetches issue details for a given environment', async function () {
    const mock = MockApiClient.addMockResponse({
      url: `/organizations/${defaultInit.organization.slug}/issues/${group.id}/`,
      body: group,
    });

    const routerConfig = {
      ...initialRouterConfig,
      location: LocationFixture({
        ...initialRouterConfig.location,
        query: {environment: 'staging', project: group.project.id},
      }),
    };
    createWrapper(routerConfig);

    await waitFor(() =>
      expect(mock).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({
          query: {
            collapse: ['release', 'tags'],
            environment: ['staging'],
            expand: ['inbox', 'owners'],
          },
        })
      )
    );
  });

  it('renders substatus badge', async function () {
    MockApiClient.addMockResponse({
      url: `/organizations/${defaultInit.organization.slug}/issues/${group.id}/`,
      body: {
        ...group,
        inbox: null,
        status: 'unresolved',
        substatus: 'ongoing',
      },
    });
    createWrapper();
    expect(await screen.findByText('Ongoing')).toBeInTheDocument();
  });

  it('renders alert for sample event', async function () {
    MockApiClient.addMockResponse({
      url: `/organizations/${defaultInit.organization.slug}/issues/${group.id}/tags/`,
      body: [{key: 'sample_event'}],
    });

    createWrapper();

    expect(await screen.findByText(SAMPLE_EVENT_ALERT_TEXT)).toBeInTheDocument();
  });

  it('renders error when project does not exist', async function () {
    MockApiClient.addMockResponse({
      url: `/projects/org-slug/other-project-slug/issues/`,
      method: 'PUT',
    });
    MockApiClient.addMockResponse({
      url: `/organizations/${defaultInit.organization.slug}/issues/${group.id}/`,
      body: {...group, project: {slug: 'other-project-slug'}},
    });
    MockApiClient.addMockResponse({
      url: `/projects/${defaultInit.organization.slug}/other-project-slug/`,
      body: {},
    });

    createWrapper();

    expect(
      await screen.findByText('The project other-project-slug does not exist')
    ).toBeInTheDocument();
  });

  it('uses /recommended endpoint when feature flag is on and no event is provided', async function () {
    const recommendedMock = MockApiClient.addMockResponse({
      url: `/organizations/${defaultInit.organization.slug}/issues/${group.id}/events/recommended/`,
      statusCode: 200,
      body: event,
    });

    createWrapper();

    await waitFor(() => expect(recommendedMock).toHaveBeenCalledTimes(1));
  });

  it("refires request when recommended endpoint doesn't return an event", async function () {
    const recommendedWithSearchMock = MockApiClient.addMockResponse({
      url: `/organizations/${defaultInit.organization.slug}/issues/${group.id}/events/recommended/`,
      query: {
        query: 'foo:bar',
        statsPeriod: '14d',
      },
      statusCode: 404,
      body: {
        detail: 'No matching event',
      },
    });

    const routerConfig = {
      ...initialRouterConfig,
      location: LocationFixture({
        ...initialRouterConfig.location,
        query: {query: 'foo:bar', statsPeriod: '14d'},
      }),
    };
    const {router} = createWrapper(routerConfig);

    await waitFor(() => expect(recommendedWithSearchMock).toHaveBeenCalledTimes(1));

    await waitFor(() =>
      expect(router.location).toEqual(
        expect.objectContaining({
          pathname: routerConfig.location.pathname,
          // Query has been removed
          query: {},
        })
      )
    );
  });

  it('does not refire for request with streamlined UI', async function () {
    jest.mocked(useHasStreamlinedUI).mockReturnValue(true);
    // Bunch of mocks to load streamlined UI
    MockApiClient.addMockResponse({
      url: '/organizations/org-slug/flags/logs/',
      body: {data: []},
    });
    MockApiClient.addMockResponse({
      url: `/organizations/${defaultInit.organization.slug}/users/`,
      body: [],
    });
    MockApiClient.addMockResponse({
      url: `/organizations/${defaultInit.organization.slug}/issues/${group.id}/attachments/`,
      body: [],
    });
    MockApiClient.addMockResponse({
      url: `/organizations/${defaultInit.organization.slug}/issues/${group.id}/tags/`,
      body: [],
    });
    MockApiClient.addMockResponse({
      url: `/organizations/${defaultInit.organization.slug}/releases/stats/`,
      body: [],
    });
    MockApiClient.addMockResponse({
      url: `/organizations/${defaultInit.organization.slug}/events-stats/`,
      body: {'count()': EventsStatsFixture(), 'count_unique(user)': EventsStatsFixture()},
      method: 'GET',
    });
    MockApiClient.addMockResponse({
      url: `/organizations/${defaultInit.organization.slug}/events/`,
      body: {data: [{'count_unique(user)': 21}]},
    });
    MockApiClient.addMockResponse({
      url: `/organizations/${defaultInit.organization.slug}/sentry-app-installations/`,
      body: [],
    });
    MockApiClient.addMockResponse({
      url: `/organizations/${defaultInit.organization.slug}/sentry-app-components/`,
      body: [],
    });
    MockApiClient.addMockResponse({
      url: `/organizations/${defaultInit.organization.slug}/issues/${group.id}/events/recommended/`,
      query: {
        query: 'foo:bar',
        statsPeriod: '90d',
      },
      statusCode: 404,
      body: {
        detail: 'No matching event',
      },
    });
    createWrapper();
    expect(
      await screen.findByText("We couldn't track down an event")
    ).toBeInTheDocument();
    await waitFor(() => expect(mockNavigate).not.toHaveBeenCalled());
  });

  it('uses /latest endpoint when default is set to latest', async function () {
    ConfigStore.loadInitialData(ConfigFixture({user: latestUser}));
    const latestMock = MockApiClient.addMockResponse({
      url: `/organizations/${defaultInit.organization.slug}/issues/${group.id}/events/latest/`,
      statusCode: 200,
      body: event,
    });

    createWrapper();

    await waitFor(() => expect(latestMock).toHaveBeenCalledTimes(1));
  });

  it('uses /oldest endpoint when default is set to oldest', async function () {
    ConfigStore.loadInitialData(ConfigFixture({user: oldestUser}));
    const oldestMock = MockApiClient.addMockResponse({
      url: `/organizations/${defaultInit.organization.slug}/issues/${group.id}/events/oldest/`,
      statusCode: 200,
      body: event,
    });

    createWrapper();

    await waitFor(() => expect(oldestMock).toHaveBeenCalledTimes(1));
  });

  it('uses /recommended endpoint when default is set to recommended', async function () {
    ConfigStore.loadInitialData(ConfigFixture({user: recommendedUser}));
    const recommendedMock = MockApiClient.addMockResponse({
      url: `/organizations/${defaultInit.organization.slug}/issues/${group.id}/events/recommended/`,
      statusCode: 200,
      body: event,
    });

    createWrapper();

    await waitFor(() => expect(recommendedMock).toHaveBeenCalledTimes(1));
  });

  it('does not send hasSeen request when user is not a project member', async function () {
    const nonMemberProject = ProjectFixture({
      teams: [TeamFixture()],
      isMember: false,
    });

    // Mock the group to belong to the non-member project
    MockApiClient.addMockResponse({
      url: `/organizations/${defaultInit.organization.slug}/issues/${group.id}/`,
      body: {
        ...group,
        project: nonMemberProject,
        hasSeen: false,
      },
    });

    act(() => ProjectsStore.loadInitialData([nonMemberProject]));

    createWrapper();

    // Wait for the component to render
    expect(await screen.findByText(group.shortId)).toBeInTheDocument();

    // Verify that the hasSeen request was NOT made
    expect(hasSeenMock).not.toHaveBeenCalled();
  });
});
