import React, {Fragment, useEffect, useState} from 'react';
import styled from '@emotion/styled';

import {ExternalLink} from 'sentry/components/core/link';
import {Tooltip} from 'sentry/components/core/tooltip';
import * as Layout from 'sentry/components/layouts/thirds';
import {t, tct} from 'sentry/locale';
import {space} from 'sentry/styles/space';
import {decodeList} from 'sentry/utils/queryString';
import {useLocation} from 'sentry/utils/useLocation';
import useOrganization from 'sentry/utils/useOrganization';
import BrowserTypeSelector from 'sentry/views/insights/browser/webVitals/components/browserTypeSelector';
import {PerformanceScoreChart} from 'sentry/views/insights/browser/webVitals/components/charts/performanceScoreChart';
import {PagePerformanceTable} from 'sentry/views/insights/browser/webVitals/components/tables/pagePerformanceTable';
import WebVitalMeters from 'sentry/views/insights/browser/webVitals/components/webVitalMeters';
import WebVitalMetersWithIssues from 'sentry/views/insights/browser/webVitals/components/webVitalMetersWithIssues';
import {WebVitalsDetailPanel} from 'sentry/views/insights/browser/webVitals/components/webVitalsDetailPanel';
import {useProjectRawWebVitalsQuery} from 'sentry/views/insights/browser/webVitals/queries/rawWebVitalsQueries/useProjectRawWebVitalsQuery';
import {getWebVitalScoresFromTableDataRow} from 'sentry/views/insights/browser/webVitals/queries/storedScoreQueries/getWebVitalScoresFromTableDataRow';
import {useProjectWebVitalsScoresQuery} from 'sentry/views/insights/browser/webVitals/queries/storedScoreQueries/useProjectWebVitalsScoresQuery';
import type {WebVitals} from 'sentry/views/insights/browser/webVitals/types';
import decodeBrowserTypes from 'sentry/views/insights/browser/webVitals/utils/queryParameterDecoders/browserType';
import {ModulePageFilterBar} from 'sentry/views/insights/common/components/modulePageFilterBar';
import {ModulePageProviders} from 'sentry/views/insights/common/components/modulePageProviders';
import {ModulesOnboarding} from 'sentry/views/insights/common/components/modulesOnboarding';
import {ModuleBodyUpsellHook} from 'sentry/views/insights/common/components/moduleUpsellHookWrapper';
import {useWebVitalsDrawer} from 'sentry/views/insights/common/utils/useWebVitalsDrawer';
import {FrontendHeader} from 'sentry/views/insights/pages/frontend/frontendPageHeader';
import {ModuleName, SpanFields, type SubregionCode} from 'sentry/views/insights/types';

const WEB_VITALS_COUNT = 5;

function WebVitalsLandingPage() {
  const organization = useOrganization();
  const location = useLocation();

  const [state, setState] = useState<{webVital: WebVitals | null}>({
    webVital: (location.query.webVital as WebVitals) ?? null,
  });

  const browserTypes = decodeBrowserTypes(location.query[SpanFields.BROWSER_NAME]);
  const subregions = decodeList(
    location.query[SpanFields.USER_GEO_SUBREGION]
  ) as SubregionCode[];

  const {data: projectData, isPending} = useProjectRawWebVitalsQuery({
    browserTypes,
    subregions,
  });
  const {data: projectScores, isPending: isProjectScoresLoading} =
    useProjectWebVitalsScoresQuery({browserTypes, subregions});

  const projectScore =
    isProjectScoresLoading || isPending
      ? undefined
      : getWebVitalScoresFromTableDataRow(projectScores?.[0]);

  const {openVitalsDrawer} = useWebVitalsDrawer({
    Component: <WebVitalsDetailPanel webVital={state.webVital} />,
    webVital: state.webVital,
    onClose: () => {
      setState({webVital: null});
    },
  });

  useEffect(() => {
    if (state.webVital) {
      openVitalsDrawer();
    }
  });

  const useWebVitalsIssues = organization.features.includes(
    'performance-web-vitals-issues'
  );

  return (
    <React.Fragment>
      <FrontendHeader module={ModuleName.VITAL} />

      <ModuleBodyUpsellHook moduleName={ModuleName.VITAL}>
        <Layout.Body>
          <Layout.Main fullWidth>
            <TopMenuContainer>
              <ModulePageFilterBar
                moduleName={ModuleName.VITAL}
                extraFilters={
                  <Fragment>
                    <BrowserTypeSelector />
                  </Fragment>
                }
              />
            </TopMenuContainer>
            <MainContentContainer>
              <ModulesOnboarding moduleName={ModuleName.VITAL}>
                <PerformanceScoreChartContainer>
                  <PerformanceScoreChart
                    projectScore={projectScore}
                    isProjectScoreLoading={isPending || isProjectScoresLoading}
                    webVital={state.webVital}
                  />
                </PerformanceScoreChartContainer>
                <WebVitalMetersContainer>
                  {(isPending || isProjectScoresLoading) && <WebVitalMetersPlaceholder />}
                  {useWebVitalsIssues ? (
                    <WebVitalMetersWithIssues
                      projectData={projectData}
                      projectScore={projectScore}
                      onClick={webVital => setState({...state, webVital})}
                    />
                  ) : (
                    <WebVitalMeters
                      projectData={projectData}
                      projectScore={projectScore}
                      onClick={webVital => setState({...state, webVital})}
                    />
                  )}
                </WebVitalMetersContainer>
                <PagePerformanceTable />
                <PagesTooltipContainer>
                  <Tooltip
                    isHoverable
                    title={
                      <div>
                        <div>
                          {tct(
                            'If pages you expect to see are missing, your framework is most likely not supported by the SDK, or your traffic is coming from unsupported browsers. Find supported browsers and frameworks [link:here].',
                            {
                              link: (
                                <ExternalLink href="https://docs.sentry.io/product/insights/web-vitals/#prerequisites-and-limitations" />
                              ),
                            }
                          )}
                        </div>
                        <br />
                        <div>
                          {t(
                            'Keep your JavaScript SDK updated to the latest version for the best Web Vitals support.'
                          )}
                        </div>
                      </div>
                    }
                  >
                    <PagesTooltip>{t('Why are my pages not showing up?')}</PagesTooltip>
                  </Tooltip>
                </PagesTooltipContainer>
              </ModulesOnboarding>
            </MainContentContainer>
          </Layout.Main>
        </Layout.Body>
      </ModuleBodyUpsellHook>
    </React.Fragment>
  );
}

export function WebVitalMetersPlaceholder() {
  return (
    <LoadingBoxContainer>
      {[...new Array(WEB_VITALS_COUNT)].map((_, index) => (
        <LoadingBox key={index} />
      ))}
    </LoadingBoxContainer>
  );
}

function PageWithProviders() {
  return (
    <ModulePageProviders moduleName="vital" analyticEventName="insight.page_loads.vital">
      <WebVitalsLandingPage />
    </ModulePageProviders>
  );
}

export default PageWithProviders;

const TopMenuContainer = styled('div')`
  display: flex;
  gap: ${space(2)};
`;

const PerformanceScoreChartContainer = styled('div')`
  margin-bottom: ${space(1)};
`;

const MainContentContainer = styled('div')`
  margin-top: ${space(2)};
`;

const WebVitalMetersContainer = styled('div')`
  margin-bottom: ${space(2)};
`;

const LoadingBoxContainer = styled('div')`
  display: flex;
  flex-direction: row;
  justify-content: space-between;
  width: 100%;
  gap: ${space(1)};
  align-items: center;
  flex-wrap: wrap;

  margin-bottom: ${space(1)};
`;

const LoadingBox = styled('div')`
  flex: 1;
  min-width: 140px;
  height: 90px;
  background-color: ${p => p.theme.gray100};
  border-radius: ${p => p.theme.borderRadius};
`;

const PagesTooltip = styled('span')`
  font-size: ${p => p.theme.fontSize.sm};
  color: ${p => p.theme.subText};
  text-decoration: underline dotted ${p => p.theme.gray300};
`;

const PagesTooltipContainer = styled('div')`
  display: flex;
`;
