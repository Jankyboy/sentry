import styled from '@emotion/styled';

import ReplayClipPreview from 'sentry/components/events/eventReplay/replayClipPreview';
import {t} from 'sentry/locale';
import {space} from 'sentry/styles/space';
import type {EventTransaction} from 'sentry/types/event';
import type {Organization} from 'sentry/types/organization';
import {getAnalyticsDataForEvent} from 'sentry/utils/events';
import {getReplayIdFromEvent} from 'sentry/utils/replays/getReplayIdFromEvent';
import {InterimSection} from 'sentry/views/issueDetails/streamline/interimSection';

const REPLAY_CLIP_OFFSETS = {
  durationAfterMs: 5_000,
  durationBeforeMs: 5_000,
};

function ReplaySection({
  event,
  organization,
  showTitle = false,
}: {
  event: EventTransaction;
  organization: Organization;
  showTitle?: boolean;
}) {
  const replayId = getReplayIdFromEvent(event);
  const startTimestampMS =
    event && 'startTimestamp' in event ? event.startTimestamp * 1000 : undefined;
  const timeOfEvent = event.dateCreated ?? startTimestampMS ?? event.dateReceived;
  const eventTimestampMs = timeOfEvent ? Math.floor(new Date(timeOfEvent).getTime()) : 0;

  return replayId ? (
    <ReplaySectionContainer>
      {showTitle ? <ReplaySectionTitle>{t('Session Replay')}</ReplaySectionTitle> : null}
      <ReplayClipPreview
        analyticsContext="trace-view"
        replaySlug={replayId}
        orgSlug={organization.slug}
        eventTimestampMs={eventTimestampMs}
        clipOffsets={REPLAY_CLIP_OFFSETS}
        fullReplayButtonProps={{
          analyticsEventKey: 'trace-view.drawer-open-replay-details-clicked',
          analyticsEventName: 'Trace View: Open Replay Details Clicked',
          analyticsParams: {
            ...getAnalyticsDataForEvent(event),
            organization,
          },
        }}
      />
    </ReplaySectionContainer>
  ) : null;
}

export default function ReplayPreview({
  event,
  organization,
}: {
  event: EventTransaction;
  organization: Organization;
}) {
  const replayId = getReplayIdFromEvent(event);

  if (!replayId) {
    return null;
  }

  return (
    <InterimSection
      title={t('Session Replay')}
      type="trace_session_replay"
      disableCollapsePersistence
    >
      <ReplaySection event={event} organization={organization} />
    </InterimSection>
  );
}

const ReplaySectionContainer = styled('div')`
  display: flex;
  flex-direction: column;
`;

const ReplaySectionTitle = styled('div')`
  font-size: ${p => p.theme.fontSize.md};
  font-weight: ${p => p.theme.fontWeight.bold};
  margin-bottom: ${space(2)};
`;
