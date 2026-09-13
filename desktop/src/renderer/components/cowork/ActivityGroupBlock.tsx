import React, { useMemo, useState } from 'react';

import { i18nService } from '../../services/i18n';
import { bucketCount, reportConversationBlockAction } from './conversationAnalytics';
import {
  type ActivityChunkEntry,
  getActivityGroupSummary,
} from './messageDisplayUtils';
import { countToolSteps, formatStepsFold } from './stepsFold';

export const ActivityGroupMode = {
  /** The run is going on: earlier steps fold behind a count, the last step shows whole. */
  Live: 'live',
  /** A finished run inside a turn that is still going: one line that opens to the list. */
  Folded: 'folded',
  /** Inside the turn's opened list: every step as a row. */
  Open: 'open',
} as const;
export type ActivityGroupMode = typeof ActivityGroupMode[keyof typeof ActivityGroupMode];

export type ActivityEntryVariant = 'step' | 'row';

export interface ActivityEntryRenderOptions {
  variant: ActivityEntryVariant;
  initiallyExpanded?: boolean;
}

const Chevron: React.FC<{ open: boolean }> = ({ open }) => (
  <svg
    width={11}
    height={11}
    viewBox="0 0 24 24"
    fill="none"
    stroke="#c4c8ce"
    strokeWidth={2.2}
    strokeLinecap="round"
    strokeLinejoin="round"
    style={{ flex: '0 0 11px', transform: open ? 'rotate(90deg)' : 'none', transition: 'transform .18s ease' }}
    aria-hidden
  >
    <polyline points="9,5 16,12 9,19" />
  </svg>
);

/**
 * A run of consecutive work items (docs/maties/design.md, « A step »):
 * one step at a time while it runs, a list of rows once opened. The
 * turn-level fold (« 4 steps · 12 s ») lives in AssistantTurnBlock; this
 * block only knows the run it holds.
 */
const ActivityGroupBlock: React.FC<{
  entries: ActivityChunkEntry[];
  mode: ActivityGroupMode;
  renderEntry: (entry: ActivityChunkEntry, options: ActivityEntryRenderOptions) => React.ReactNode;
  /** What the last step produced: stays visible under the folded line. */
  keptResult?: React.ReactNode;
}> = ({ entries, mode, renderEntry, keptResult }) => {
  const [isExpanded, setIsExpanded] = useState(false);

  const items = useMemo(() => entries.map((entry) => entry.item), [entries]);
  const summary = useMemo(() => getActivityGroupSummary(items), [items]);

  const handleToggle = () => {
    const nextExpanded = !isExpanded;
    reportConversationBlockAction({
      actionType: nextExpanded ? 'activity_group_expand' : 'activity_group_collapse',
      blockType: 'activity_group',
      params: {
        stepCount: summary.stepCount,
        stepCountBucket: bucketCount(summary.stepCount),
        itemCount: entries.length,
        isStreaming: mode === ActivityGroupMode.Live,
      },
    });
    setIsExpanded(nextExpanded);
  };

  const renderRows = (rows: ActivityChunkEntry[]) => (
    <div className="flex flex-col">
      {rows.map((entry) => (
        <React.Fragment key={`row-${entry.index}`}>
          {renderEntry(entry, { variant: 'row', initiallyExpanded: rows.length === 1 && mode !== ActivityGroupMode.Open })}
        </React.Fragment>
      ))}
    </div>
  );

  const renderFoldLine = (rows: ActivityChunkEntry[]) => {
    const count = countToolSteps(rows.map((entry) => entry.item));
    // Nothing to fold: only thinking, which carries its own line.
    if (count === 0) return renderRows(rows);
    return (
      <div>
        <button
          type="button"
          onClick={handleToggle}
          className="flex max-w-full items-center gap-1.5 py-0.5 text-left"
          aria-expanded={isExpanded}
          title={i18nService.t('matiesShowAll')}
        >
          <span className="maties-caption min-w-0 truncate">{formatStepsFold(count, null)}</span>
          <Chevron open={isExpanded} />
        </button>
        {isExpanded && <div className="maties-in mt-1">{renderRows(rows)}</div>}
        {!isExpanded && mode === ActivityGroupMode.Folded && keptResult && (
          <div className="mt-3">{keptResult}</div>
        )}
      </div>
    );
  };

  if (mode === ActivityGroupMode.Open) {
    return renderRows(entries);
  }

  if (mode === ActivityGroupMode.Folded) {
    return renderFoldLine(entries);
  }

  const earlier = entries.slice(0, -1);
  const last = entries[entries.length - 1];
  return (
    <div className="flex flex-col gap-4">
      {earlier.length > 0 && renderFoldLine(earlier)}
      {last && (
        <div key={`live-${last.index}`}>
          {renderEntry(last, { variant: 'step' })}
        </div>
      )}
    </div>
  );
};

export default ActivityGroupBlock;
