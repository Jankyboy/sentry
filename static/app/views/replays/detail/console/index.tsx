import {useMemo, useRef, useState} from 'react';
import type {ListRowProps} from 'react-virtualized';
import {AutoSizer, CellMeasurer, List as ReactVirtualizedList} from 'react-virtualized';

import {Flex} from 'sentry/components/core/layout/flex';
import Placeholder from 'sentry/components/placeholder';
import JumpButtons from 'sentry/components/replays/jumpButtons';
import {useReplayContext} from 'sentry/components/replays/replayContext';
import useJumpButtons from 'sentry/components/replays/useJumpButtons';
import {t} from 'sentry/locale';
import useCrumbHandlers from 'sentry/utils/replays/hooks/useCrumbHandlers';
import {useReplayReader} from 'sentry/utils/replays/playback/providers/replayReaderProvider';
import useCurrentHoverTime from 'sentry/utils/replays/playback/providers/useCurrentHoverTime';
import ConsoleFilters from 'sentry/views/replays/detail/console/consoleFilters';
import ConsoleLogRow from 'sentry/views/replays/detail/console/consoleLogRow';
import useConsoleFilters from 'sentry/views/replays/detail/console/useConsoleFilters';
import NoRowRenderer from 'sentry/views/replays/detail/noRowRenderer';
import TabItemContainer from 'sentry/views/replays/detail/tabItemContainer';
import useVirtualizedInspector from 'sentry/views/replays/detail/useVirtualizedInspector';
import useVirtualizedList from 'sentry/views/replays/detail/useVirtualizedList';

// Ensure this object is created once as it is an input to
// `useVirtualizedList`'s memoization
const cellMeasurer = {
  fixedWidth: true,
  minHeight: 24,
};

export default function Console() {
  const replay = useReplayReader();
  const {currentTime} = useReplayContext();
  const [currentHoverTime] = useCurrentHoverTime();
  const {onMouseEnter, onMouseLeave, onClickTimestamp} = useCrumbHandlers();

  const startTimestampMs = replay?.getReplay()?.started_at?.getTime() ?? 0;
  const frames = replay?.getConsoleFrames();

  const [scrollToRow, setScrollToRow] = useState<undefined | number>(undefined);

  const filterProps = useConsoleFilters({frames: frames || []});
  const {expandPathsRef, searchTerm, logLevel, items, setSearchTerm} = filterProps;
  const clearSearchTerm = () => setSearchTerm('');

  const listRef = useRef<ReactVirtualizedList>(null);

  const deps = useMemo(() => [items], [items]);
  const {cache, updateList} = useVirtualizedList({
    cellMeasurer,
    ref: listRef,
    deps,
  });

  const {handleDimensionChange} = useVirtualizedInspector({
    cache,
    listRef,
    expandPathsRef,
  });

  const {
    handleClick: onClickToJump,
    onRowsRendered,
    showJumpDownButton,
    showJumpUpButton,
  } = useJumpButtons({
    currentTime,
    frames: items,
    isTable: false,
    setScrollToRow,
  });

  const renderRow = ({index, key, style, parent}: ListRowProps) => {
    const item = items[index];

    return (
      <CellMeasurer
        cache={cache}
        columnIndex={0}
        // Set key based on filters, otherwise we can have odd expand/collapse state
        // with <StructuredEventData> when filtering
        key={`${searchTerm}-${logLevel.join(',')}-${key}`}
        parent={parent}
        rowIndex={index}
      >
        <ConsoleLogRow
          currentHoverTime={currentHoverTime}
          currentTime={currentTime}
          expandPaths={Array.from(expandPathsRef.current?.get(index) || [])}
          frame={item!}
          onMouseEnter={onMouseEnter}
          onMouseLeave={onMouseLeave}
          index={index}
          onClickTimestamp={onClickTimestamp}
          onDimensionChange={handleDimensionChange}
          startTimestampMs={startTimestampMs}
          style={style}
        />
      </CellMeasurer>
    );
  };

  return (
    <Flex direction="column" wrap="nowrap">
      <ConsoleFilters frames={frames} {...filterProps} />
      <TabItemContainer data-test-id="replay-details-console-tab">
        {frames ? (
          <AutoSizer onResize={updateList}>
            {({width, height}) => (
              <ReactVirtualizedList
                deferredMeasurementCache={cache}
                height={height}
                noRowsRenderer={() => (
                  <NoRowRenderer
                    unfilteredItems={frames}
                    clearSearchTerm={clearSearchTerm}
                  >
                    {t('No console logs recorded')}
                  </NoRowRenderer>
                )}
                onRowsRendered={onRowsRendered}
                onScroll={() => {
                  if (scrollToRow !== undefined) {
                    setScrollToRow(undefined);
                  }
                }}
                overscanRowCount={5}
                ref={listRef}
                rowCount={items.length}
                rowHeight={cache.rowHeight}
                rowRenderer={renderRow}
                scrollToIndex={scrollToRow}
                width={width}
              />
            )}
          </AutoSizer>
        ) : (
          <Placeholder height="100%" />
        )}
        {items?.length ? (
          <JumpButtons
            jump={showJumpUpButton ? 'up' : showJumpDownButton ? 'down' : undefined}
            onClick={onClickToJump}
            tableHeaderHeight={0}
          />
        ) : null}
      </TabItemContainer>
    </Flex>
  );
}
