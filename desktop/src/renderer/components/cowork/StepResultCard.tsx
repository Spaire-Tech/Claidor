import React from 'react';

import { i18nService } from '../../services/i18n';
import { showShellFailureToast, showToast } from '../../utils/localFileActions';
import FileIcon from '../design/FileIcon';
import { type ToolStepResult } from './toolStepPresentation';

/**
 * What a step produced (docs/maties/design.md, « A step »): a white card,
 * radius 16, that starts as a grey skeleton and fills in place with a file
 * name and its icon (a link that opens the file), a page title, a number,
 * or a short line. The skeleton is not decoration: it is the honest shape
 * of « something is coming and I cannot name it yet ».
 */
export const openStepFile = async (filePath: string): Promise<void> => {
  try {
    const result = await window.electron?.shell?.openPath?.(filePath);
    if (result && !result.success) {
      showShellFailureToast(result, 'openFileFailed');
    }
  } catch (error) {
    console.warn('[StepResultCard] failed to open a file from a step:', error);
    showToast(i18nService.t('openFileFailed'));
  }
};

const Skeleton: React.FC = () => (
  <>
    <span className="maties-skeleton" style={{ flex: '0 0 24px', width: 24, height: 24, borderRadius: 8 }} />
    <span className="maties-skeleton" style={{ flex: 1, height: 10, maxWidth: 290, borderRadius: 999 }} />
  </>
);

const DiffFigures: React.FC<{ added: number; removed: number }> = ({ added, removed }) => (
  <span className="maties-mono tabular-nums" style={{ fontSize: 12, color: '#8f96a0', flex: '0 0 auto' }}>
    {added > 0 && <span style={{ color: '#1f8a4c' }}>+{added}</span>}
    {added > 0 && removed > 0 && ' '}
    {removed > 0 && <span style={{ color: '#e0322d' }}>−{removed}</span>}
  </span>
);

const StepResultCard: React.FC<{
  result: ToolStepResult | null;
  failed?: boolean;
  className?: string;
  style?: React.CSSProperties;
  onOpenAgent?: () => void;
  children?: React.ReactNode;
}> = ({ result, failed = false, className, style, onOpenAgent, children }) => {
  const content = (() => {
    if (children) return children;
    if (!result) return <Skeleton />;
    if (result.type === 'file') {
      return (
        <>
          <button
            type="button"
            onClick={() => void openStepFile(result.path)}
            title={result.path}
            aria-label={i18nService.t('matiesStepOpenFile').replace('{name}', result.name)}
            className="maties-in-slow flex min-w-0 flex-1 items-center gap-3 text-left"
          >
            <FileIcon fileName={result.name} size={20} />
            <span
              className="min-w-0 flex-1 truncate"
              style={{ fontSize: 14.5, letterSpacing: '-.01em', color: '#31353b', textDecoration: 'underline', textDecorationColor: 'rgba(49,53,59,.25)', textUnderlineOffset: 3 }}
            >
              {result.name}
            </span>
          </button>
          {result.diff && (result.diff.added > 0 || result.diff.removed > 0) && (
            <DiffFigures added={result.diff.added} removed={result.diff.removed} />
          )}
        </>
      );
    }
    if (result.type === 'agent') {
      return (
        <button
          type="button"
          onClick={onOpenAgent}
          disabled={!onOpenAgent}
          aria-label={i18nService.t('matiesStepOpenAgent')}
          className="maties-in-slow flex min-w-0 flex-1 items-center gap-3 text-left disabled:cursor-default"
        >
          <span
            className="flex shrink-0 items-center justify-center rounded-full"
            style={{ width: 22, height: 22, background: '#e8effa', color: '#0060d0', fontSize: 11, fontWeight: 600 }}
          >
            {result.name.trim().charAt(0).toUpperCase()}
          </span>
          <span className="min-w-0 flex-1 truncate" style={{ fontSize: 14.5, letterSpacing: '-.01em', color: '#31353b' }}>
            {result.name}
          </span>
          {onOpenAgent && (
            <svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke="#c4c8ce" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
              <polyline points="9,5 16,12 9,19" />
            </svg>
          )}
        </button>
      );
    }
    return (
      <span
        className="maties-in-slow min-w-0 flex-1 truncate"
        style={{ fontSize: 14.5, letterSpacing: '-.01em', color: failed ? '#e0322d' : '#31353b' }}
        title={result.text}
      >
        {result.number ? (
          <>
            <span className="tabular-nums" style={{ fontWeight: 500 }}>{result.number}</span>
            {result.text.slice(result.number.length)}
          </>
        ) : result.text}
      </span>
    );
  })();

  return (
    <div
      className={`maties-card maties-in-slow flex items-center gap-3 ${className ?? ''}`.trim()}
      style={{ alignSelf: 'flex-start', minWidth: 'min(380px, 100%)', maxWidth: '100%', ...style }}
    >
      {content}
    </div>
  );
};

export default StepResultCard;
