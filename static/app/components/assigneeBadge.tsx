import {Fragment} from 'react';
import {type DO_NOT_USE_ChonkTheme} from '@emotion/react';
import styled from '@emotion/styled';

import {ActorAvatar} from 'sentry/components/core/avatar/actorAvatar';
import {Tag} from 'sentry/components/core/badge/tag';
import {ExternalLink} from 'sentry/components/core/link';
import {Tooltip} from 'sentry/components/core/tooltip';
import LoadingIndicator from 'sentry/components/loadingIndicator';
import Placeholder from 'sentry/components/placeholder';
import {IconChevron} from 'sentry/icons';
import {t, tct} from 'sentry/locale';
import {space} from 'sentry/styles/space';
import type {Actor} from 'sentry/types/core';
import type {SuggestedOwnerReason} from 'sentry/types/group';
import {withChonk} from 'sentry/utils/theme/withChonk';

type AssigneeBadgeProps = {
  assignedTo?: Actor | undefined;
  assignmentReason?: SuggestedOwnerReason;
  chevronDirection?: 'up' | 'down';
  isTooltipDisabled?: boolean;
  loading?: boolean;
  showLabel?: boolean;
};

const AVATAR_SIZE = 16;

export function AssigneeBadge({
  assignedTo,
  assignmentReason,
  showLabel = false,
  chevronDirection = 'down',
  loading = false,
  isTooltipDisabled,
}: AssigneeBadgeProps) {
  const suggestedReasons: Record<SuggestedOwnerReason, React.ReactNode> = {
    suspectCommit: tct('Based on [commit:commit data]', {
      commit: (
        <TooltipSubExternalLink href="https://docs.sentry.io/product/sentry-basics/integrate-frontend/configure-scms/" />
      ),
    }),
    ownershipRule: t('Matching Issue Owners Rule'),
    projectOwnership: t('Matching Issue Owners Rule'),
    codeowners: t('Matching Codeowners Rule'),
  };

  const makeAssignedIcon = (actor: Actor) => {
    return (
      <Fragment>
        <ActorAvatar
          actor={actor}
          className="avatar"
          size={AVATAR_SIZE}
          hasTooltip={false}
          data-test-id="assigned-avatar"
          // Team avatars need extra left margin since the
          // square team avatar is being fit into a rounded borders
          style={{
            marginLeft: actor.type === 'team' ? space(0.5) : '0',
          }}
        />
        {showLabel && (
          <StyledText>{`${actor.type === 'team' ? '#' : ''}${actor.name}`}</StyledText>
        )}
        <IconChevron color="subText" direction={chevronDirection} size="xs" />
      </Fragment>
    );
  };

  const loadingIcon = (
    <Fragment>
      <StyledLoadingIndicator mini relative size={AVATAR_SIZE} />
      {showLabel && 'Loading...'}
      <IconChevron color="subText" direction={chevronDirection} size="xs" />
    </Fragment>
  );

  const unassignedIcon = (
    <Fragment>
      <Placeholder
        shape="circle"
        testId="unassigned-avatar"
        width={`${AVATAR_SIZE}px`}
        height={`${AVATAR_SIZE}px`}
      />
      {showLabel && <Fragment>Unassigned</Fragment>}
      <IconChevron color="subText" direction={chevronDirection} size="xs" />
    </Fragment>
  );

  return loading ? (
    <StyledTag icon={loadingIcon} />
  ) : assignedTo ? (
    <Tooltip
      isHoverable
      disabled={isTooltipDisabled}
      title={
        <TooltipWrapper>
          {t('Assigned to ')}
          {assignedTo.type === 'team' ? `#${assignedTo.name}` : assignedTo.name}
          {assignmentReason && (
            <TooltipSubtext>{suggestedReasons[assignmentReason]}</TooltipSubtext>
          )}
        </TooltipWrapper>
      }
      skipWrapper
    >
      <StyledTag icon={makeAssignedIcon(assignedTo)} />
    </Tooltip>
  ) : (
    <Tooltip
      isHoverable
      disabled={isTooltipDisabled}
      title={
        <TooltipWrapper>
          <div>{t('Unassigned')}</div>
          <TooltipSubtext>
            {tct(
              'You can auto-assign issues by adding [issueOwners:Issue Owner rules].',
              {
                issueOwners: (
                  <TooltipSubExternalLink href="https://docs.sentry.io/product/error-monitoring/issue-owners/" />
                ),
              }
            )}
          </TooltipSubtext>
        </TooltipWrapper>
      }
      skipWrapper
    >
      <UnassignedTag icon={unassignedIcon} />
    </Tooltip>
  );
}

const StyledLoadingIndicator = styled(LoadingIndicator)`
  display: inline-flex;
  align-items: center;
`;

const TooltipWrapper = styled('div')`
  text-align: left;
`;

const StyledText = styled('div')`
  color: ${p => p.theme.textColor};
  max-width: 114px;
  ${p => p.theme.overflowEllipsis};
`;

const StyledTag = styled(Tag)`
  gap: ${space(0.5)};
  height: 24px;
  padding: ${space(0.5)};
  padding-right: ${space(0.25)};
  color: ${p => p.theme.subText};
`;

const UnassignedTag = withChonk(
  styled(StyledTag)`
    border-style: dashed;
  `,
  styled(StyledTag)<{theme: DO_NOT_USE_ChonkTheme}>`
    border: 1px dashed ${p => p.theme.border};
    background-color: transparent;
  `
);

const TooltipSubtext = styled('div')`
  color: ${p => p.theme.subText};
`;

const TooltipSubExternalLink = styled(ExternalLink)`
  color: ${p => p.theme.subText};
  text-decoration: underline;

  :hover {
    color: ${p => p.theme.subText};
  }
`;
