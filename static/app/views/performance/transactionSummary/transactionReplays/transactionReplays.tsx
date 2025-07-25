import {Fragment, useEffect, useMemo} from 'react';
import {useTheme} from '@emotion/react';
import type {Location} from 'history';

import * as Layout from 'sentry/components/layouts/thirds';
import LoadingIndicator from 'sentry/components/loadingIndicator';
import ReplayTable from 'sentry/components/replays/table/replayTable';
import {
  ReplayActivityColumn,
  ReplayBrowserColumn,
  ReplayCountErrorsColumn,
  ReplayDurationColumn,
  ReplayOSColumn,
  ReplaySessionColumn,
  ReplaySlowestTransactionColumn,
} from 'sentry/components/replays/table/replayTableColumns';
import {t} from 'sentry/locale';
import type {Organization} from 'sentry/types/organization';
import EventView from 'sentry/utils/discover/eventView';
import {
  SPAN_OP_BREAKDOWN_FIELDS,
  SPAN_OP_RELATIVE_BREAKDOWN_FIELD,
} from 'sentry/utils/discover/fields';
import useReplayList from 'sentry/utils/replays/hooks/useReplayList';
import {useLocation} from 'sentry/utils/useLocation';
import useMedia from 'sentry/utils/useMedia';
import useOrganization from 'sentry/utils/useOrganization';
import useProjects from 'sentry/utils/useProjects';
import type {ChildProps} from 'sentry/views/performance/transactionSummary/pageLayout';
import PageLayout from 'sentry/views/performance/transactionSummary/pageLayout';
import Tab from 'sentry/views/performance/transactionSummary/tabs';
import useAllMobileProj from 'sentry/views/replays/detail/useAllMobileProj';
import type {ReplayListLocationQuery} from 'sentry/views/replays/types';

import type {EventSpanData} from './useReplaysFromTransaction';
import useReplaysFromTransaction from './useReplaysFromTransaction';
import useReplaysWithTxData from './useReplaysWithTxData';

function TransactionReplays() {
  const location = useLocation<ReplayListLocationQuery>();
  const organization = useOrganization();
  const {projects} = useProjects();

  return (
    <PageLayout
      location={location}
      organization={organization}
      projects={projects}
      tab={Tab.REPLAYS}
      getDocumentTitle={getDocumentTitle}
      generateEventView={generateEventView}
      childComponent={ReplaysContentWrapper}
    />
  );
}

function getDocumentTitle(transactionName: string): string {
  const hasTransactionName =
    typeof transactionName === 'string' && String(transactionName).trim().length > 0;

  if (hasTransactionName) {
    return [String(transactionName).trim(), t('Replays')].join(' \u2014 ');
  }

  return [t('Summary'), t('Replays')].join(' \u2014 ');
}

function generateEventView({
  location,
  transactionName,
}: {
  location: Location;
  transactionName: string;
}) {
  const fields = [
    'replayId',
    'count()',
    'transaction.duration',
    'trace',
    'timestamp',
    ...SPAN_OP_BREAKDOWN_FIELDS,
    SPAN_OP_RELATIVE_BREAKDOWN_FIELD,
  ];

  return EventView.fromSavedQuery({
    id: '',
    name: `Replay events within a transaction`,
    version: 2,
    fields,
    query: `event.type:transaction transaction:"${transactionName}" !replayId:""`,
    projects: [Number(location.query.project)],
  });
}

function ReplaysContentWrapper({
  eventView: replayIdsEventView,
  location,
  organization,
  setError,
}: ChildProps) {
  // Hard-code 90d to match the count query. There's no date selector for the replay tab.
  const {data, fetchError, isFetching, pageLinks} = useReplaysFromTransaction({
    replayIdsEventView,
    location: {
      ...location,
      query: {
        ...location.query,
        statsPeriod: '90d',
      },
    },
    organization,
  });

  useEffect(() => {
    setError(fetchError?.message ?? fetchError);
  }, [setError, fetchError]);

  if (!data) {
    return isFetching ? (
      <Layout.Main fullWidth>
        <LoadingIndicator />
      </Layout.Main>
    ) : (
      <Fragment>{null}</Fragment>
    );
  }

  const {events, replayRecordsEventView} = data;
  return (
    <ReplaysContent
      eventView={replayRecordsEventView}
      events={events}
      organization={organization}
      pageLinks={pageLinks}
    />
  );
}

function ReplaysContent({
  eventView,
  events,
  organization,
}: {
  eventView: EventView;
  events: EventSpanData[];
  organization: Organization;
  pageLinks: string | null;
}) {
  const location = useLocation();

  if (!eventView.query) {
    eventView.query = String(location.query.query ?? '');
  }

  const newLocation = useMemo(
    () => ({query: {}}) as Location<ReplayListLocationQuery>,
    []
  );
  const theme = useTheme();
  const hasRoomForColumns = useMedia(`(min-width: ${theme.breakpoints.sm})`);

  const {replays, isFetching, fetchError} = useReplayList({
    eventView,
    location: newLocation,
    organization,
    queryReferrer: 'transactionReplays',
  });

  const replaysWithTx = useReplaysWithTxData({
    replays,
    events,
  });

  const {allMobileProj} = useAllMobileProj({});

  return (
    <Layout.Main fullWidth>
      <ReplayTable
        columns={[
          ReplaySessionColumn,
          ...(hasRoomForColumns ? [ReplaySlowestTransactionColumn] : []),
          ReplayOSColumn,
          ...(allMobileProj ? [] : [ReplayBrowserColumn]),
          ReplayDurationColumn,
          ReplayCountErrorsColumn,
          ReplayActivityColumn,
        ]}
        error={fetchError}
        isPending={isFetching}
        replays={replaysWithTx ?? []}
        showDropdownFilters={false}
      />
    </Layout.Main>
  );
}
export default TransactionReplays;
