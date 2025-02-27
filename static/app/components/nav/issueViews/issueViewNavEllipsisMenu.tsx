import styled from '@emotion/styled';

import {Button} from 'sentry/components/button';
import {DropdownMenu} from 'sentry/components/dropdownMenu';
import InteractionStateLayer from 'sentry/components/interactionStateLayer';
import {normalizeDateTimeParams} from 'sentry/components/organizations/pageFilters/parse';
import {IconEllipsis, IconMegaphone} from 'sentry/icons';
import {t} from 'sentry/locale';
import {space} from 'sentry/styles/space';
import normalizeUrl from 'sentry/utils/url/normalizeUrl';
import {useFeedbackForm} from 'sentry/utils/useFeedbackForm';
import {useNavigate} from 'sentry/utils/useNavigate';
import type {IssueViewPF} from 'sentry/views/issueList/issueViewsPF/issueViewsPF';

interface IssueViewNavEllipsisMenuProps {
  baseUrl: string;
  deleteView: () => void;
  duplicateView: () => void;
  setIsEditing: (isEditing: boolean) => void;
  updateView: (view: IssueViewPF) => void;
  view: IssueViewPF;
  sectionRef?: React.RefObject<HTMLDivElement>;
}

export function IssueViewNavEllipsisMenu({
  sectionRef,
  setIsEditing,
  view,
  deleteView,
  duplicateView,
  updateView,
  baseUrl,
}: IssueViewNavEllipsisMenuProps) {
  const navigate = useNavigate();

  const handleSaveChanges = () => {
    const updatedView = {
      ...view,
      query: view.unsavedChanges?.query ?? view.query,
      querySort: view.unsavedChanges?.querySort ?? view.querySort,
      projects: view.unsavedChanges?.projects ?? view.projects,
      environments: view.unsavedChanges?.environments ?? view.environments,
      timeFilters: view.unsavedChanges?.timeFilters ?? view.timeFilters,
      unsavedChanges: undefined,
    };
    updateView(updatedView);
    navigate(constructViewLink(baseUrl, updatedView));
  };

  const handleDiscardChanges = () => {
    const updatedView = {
      ...view,
      unsavedChanges: undefined,
    };
    updateView(updatedView);
    navigate(constructViewLink(baseUrl, updatedView));
  };

  return (
    <DropdownMenu
      position="bottom-start"
      trigger={props => (
        <TriggerWrapper
          {...props}
          data-ellipsis-menu-trigger
          onPointerDownCapture={e => {
            e.stopPropagation();
            e.preventDefault();
          }}
          onPointerUpCapture={e => {
            e.stopPropagation();
            e.preventDefault();
            e.currentTarget.click();
          }}
        >
          <InteractionStateLayer />
          <IconEllipsis compact color="gray500" />
        </TriggerWrapper>
      )}
      items={[
        {
          key: 'changed',
          children: [
            {
              key: 'save-changes',
              label: t('Save Changes'),
              priority: 'primary',
              onAction: handleSaveChanges,
            },
            {
              key: 'discard-changes',
              label: t('Discard Changes'),
              onAction: handleDiscardChanges,
            },
          ],
          hidden: !view.unsavedChanges,
        },
        {
          key: 'default',
          children: [
            {
              key: 'rename-tab',
              label: t('Rename'),
              onAction: () => setIsEditing(true),
            },
            {
              key: 'duplicate-tab',
              label: t('Duplicate'),
              onAction: duplicateView,
            },
            {
              key: 'delete-tab',
              label: t('Delete'),
              priority: 'danger',
              onAction: deleteView,
            },
          ],
        },
      ]}
      shouldCloseOnInteractOutside={() => true}
      menuFooter={<FeedbackFooter />}
      usePortal
      portalContainerRef={sectionRef}
    />
  );
}

function FeedbackFooter() {
  const openForm = useFeedbackForm();

  if (!openForm) {
    return null;
  }

  return (
    <SectionedOverlayFooter>
      <Button
        size="xs"
        icon={<IconMegaphone />}
        onClick={() =>
          openForm({
            messagePlaceholder: t('How can we make custom views better for you?'),
            tags: {
              ['feedback.source']: 'left_nav_issue_views',
              ['feedback.owner']: 'issues',
            },
          })
        }
      >
        {t('Give Feedback')}
      </Button>
    </SectionedOverlayFooter>
  );
}

const constructViewLink = (baseUrl: string, view: IssueViewPF) => {
  return normalizeUrl({
    pathname: `${baseUrl}/views/${view.id}/`,
    query: {
      query: view.unsavedChanges?.query ?? view.query,
      sort: view.unsavedChanges?.querySort ?? view.querySort,
      project: view.unsavedChanges?.projects ?? view.projects,
      environment: view.unsavedChanges?.environments ?? view.environments,
      ...normalizeDateTimeParams(view.unsavedChanges?.timeFilters ?? view.timeFilters),
      cursor: undefined,
      page: undefined,
    },
  });
};

const TriggerWrapper = styled('div')`
  position: relative;
  width: 24px;
  height: 20px;
  border: 1px solid ${p => p.theme.gray200};
  border-radius: ${p => p.theme.borderRadius};
  align-items: center;
  justify-content: center;
  padding: 0;
  background-color: inherit;
  opacity: inherit;
  display: none;
`;

const SectionedOverlayFooter = styled('div')`
  grid-area: footer;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: ${space(1)};
  border-top: 1px solid ${p => p.theme.innerBorder};
`;
