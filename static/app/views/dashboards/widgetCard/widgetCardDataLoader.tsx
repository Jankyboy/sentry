import {Fragment} from 'react';

import type {PageFilters} from 'sentry/types/core';
import type {Series} from 'sentry/types/echarts';
import type {Confidence} from 'sentry/types/organization';
import type {TableDataWithTitle} from 'sentry/utils/discover/discoverQuery';
import type {AggregationOutputType} from 'sentry/utils/discover/fields';
import useApi from 'sentry/utils/useApi';
import useOrganization from 'sentry/utils/useOrganization';
import type {DashboardFilters, Widget} from 'sentry/views/dashboards/types';
import {WidgetType} from 'sentry/views/dashboards/types';
import {shouldForceQueryToSpans} from 'sentry/views/dashboards/utils/shouldForceQueryToSpans';
import SpansWidgetQueries from 'sentry/views/dashboards/widgetCard/spansWidgetQueries';

import IssueWidgetQueries from './issueWidgetQueries';
import ReleaseWidgetQueries from './releaseWidgetQueries';
import WidgetQueries from './widgetQueries';

type Results = {
  loading: boolean;
  confidence?: Confidence;
  errorMessage?: string;
  isProgressivelyLoading?: boolean;
  isSampled?: boolean | null;
  pageLinks?: string;
  sampleCount?: number;
  tableResults?: TableDataWithTitle[];
  timeseriesResults?: Series[];
  timeseriesResultsTypes?: Record<string, AggregationOutputType>;
  totalIssuesCount?: string;
};

type Props = {
  children: (props: Results) => React.ReactNode;
  selection: PageFilters;
  widget: Widget;
  dashboardFilters?: DashboardFilters;
  onDataFetchStart?: () => void;
  onDataFetched?: (
    results: Pick<
      Results,
      | 'pageLinks'
      | 'tableResults'
      | 'timeseriesResults'
      | 'timeseriesResultsTypes'
      | 'totalIssuesCount'
      | 'confidence'
      | 'sampleCount'
    >
  ) => void;
  onWidgetSplitDecision?: (splitDecision: WidgetType) => void;
  tableItemLimit?: number;
};

export function WidgetCardDataLoader({
  children,
  widget,
  selection,
  dashboardFilters,
  tableItemLimit,
  onDataFetched,
  onWidgetSplitDecision,
  onDataFetchStart,
}: Props) {
  const api = useApi();
  const organization = useOrganization();

  if (widget.widgetType === WidgetType.ISSUE) {
    return (
      <IssueWidgetQueries
        api={api}
        organization={organization}
        widget={widget}
        selection={selection}
        limit={tableItemLimit}
        onDataFetched={onDataFetched}
        dashboardFilters={dashboardFilters}
        onDataFetchStart={onDataFetchStart}
      >
        {({tableResults, errorMessage, loading}) => (
          <Fragment>{children({tableResults, errorMessage, loading})}</Fragment>
        )}
      </IssueWidgetQueries>
    );
  }

  if (widget.widgetType === WidgetType.RELEASE) {
    return (
      <ReleaseWidgetQueries
        api={api}
        organization={organization}
        widget={widget}
        selection={selection}
        limit={tableItemLimit}
        onDataFetched={onDataFetched}
        dashboardFilters={dashboardFilters}
        onDataFetchStart={onDataFetchStart}
      >
        {({tableResults, timeseriesResults, errorMessage, loading}) => (
          <Fragment>
            {children({tableResults, timeseriesResults, errorMessage, loading})}
          </Fragment>
        )}
      </ReleaseWidgetQueries>
    );
  }

  if (widget.widgetType === WidgetType.SPANS || shouldForceQueryToSpans(widget)) {
    return (
      <SpansWidgetQueries
        api={api}
        widget={widget}
        selection={selection}
        limit={tableItemLimit}
        onDataFetched={onDataFetched}
        dashboardFilters={dashboardFilters}
        onDataFetchStart={onDataFetchStart}
      >
        {props => <Fragment>{children({...props})}</Fragment>}
      </SpansWidgetQueries>
    );
  }

  return (
    <WidgetQueries
      api={api}
      organization={organization}
      widget={widget}
      selection={selection}
      limit={tableItemLimit}
      onDataFetched={onDataFetched}
      onDataFetchStart={onDataFetchStart}
      dashboardFilters={dashboardFilters}
      onWidgetSplitDecision={onWidgetSplitDecision}
    >
      {({
        tableResults,
        timeseriesResults,
        errorMessage,
        loading,
        timeseriesResultsTypes,
        confidence,
      }) => (
        <Fragment>
          {children({
            tableResults,
            timeseriesResults,
            errorMessage,
            loading,
            timeseriesResultsTypes,
            confidence,
          })}
        </Fragment>
      )}
    </WidgetQueries>
  );
}
