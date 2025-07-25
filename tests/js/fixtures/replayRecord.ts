import {duration} from 'moment-timezone';

import type {HydratedReplayRecord} from 'sentry/views/replays/types';

export function ReplayRecordFixture(
  replayRecord: Partial<HydratedReplayRecord> = {}
): HydratedReplayRecord {
  return {
    activity: 0,
    clicks: [],
    browser: {
      name: 'Other',
      version: '',
    },
    count_dead_clicks: 1,
    count_errors: 1,
    count_infos: 1,
    count_rage_clicks: 1,
    count_segments: 14,
    count_urls: 1,
    count_warnings: 1,
    device: {
      name: '',
      brand: '',
      model_id: '',
      family: 'Other',
    },
    dist: '',
    duration: duration(84000),
    environment: 'demo',
    error_ids: ['5c83aaccfffb4a708ae893bad9be3a1c'],
    finished_at: new Date('Sep 22, 2022 5:00:03 PM UTC'),
    has_viewed: false,
    id: '761104e184c64d439ee1014b72b4d83b',
    info_ids: [],
    is_archived: false,
    os: {
      name: 'Other',
      version: '',
    },
    ota_updates: {
      channel: 'stable',
      runtime_version: '1.0.0',
      update_id: '1234567890',
    },
    platform: 'javascript',
    project_id: '6273278',
    releases: ['1.0.0', '2.0.0'],
    replay_type: 'buffer',
    sdk: {
      name: 'sentry.javascript.browser',
      version: '7.1.1',
    },
    started_at: new Date('Sep 22, 2022 4:58:39 PM UTC'),
    trace_ids: [],
    urls: ['http://localhost:3000/'],
    user: {
      id: '',
      username: '',
      email: '',
      ip: '127.0.0.1',
      display_name: '127.0.0.1',
    },
    warning_ids: [],
    ...replayRecord,
    tags: {
      ...replayRecord.tags,
      'browser.name': [replayRecord.browser?.name ?? 'Other'],
      'device.family': [replayRecord.device?.family ?? 'Other'],
      environment: ['demo'],
      'os.name': [replayRecord.os?.name ?? 'Other'],
      platform: [replayRecord.platform ?? 'javascript'],
      releases: replayRecord.releases ?? ['1.0.0', '2.0.0'],
      replayType: ['buffer'],
      'sdk.name': [replayRecord.sdk?.name ?? 'sentry.javascript.browser'],
      'sdk.version': [replayRecord.sdk?.version ?? '7.1.1'],
      'user.ip': [replayRecord.user?.ip ?? '127.0.0.1'],
    },
  };
}
