import '../conversation.css';

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import type { CoworkMessage, CoworkPermissionRequest } from '../../../types/cowork';
import AssistantTurnBlock from '../../cowork/AssistantTurnBlock';
import CoworkPermissionModal from '../../cowork/CoworkPermissionModal';
import CoworkQuestionWizard from '../../cowork/CoworkQuestionWizard';
import type { ConversationTurn } from '../../cowork/messageDisplayUtils';
import ProposedPlanBlock from '../../cowork/ProposedPlanBlock';
import ToolCallGroup, { ToolCallVariant } from '../../cowork/ToolCallGroup';

/**
 * A fake conversation through the real components, for the founder's
 * screenshots (docs/maties/design.md, section 8). Mounted only when the
 * URL hash is `#maties-preview`; nothing in the app links here.
 */

const NOW = Date.UTC(2026, 8, 10, 12, 40, 0);
const T = (secondsAfter: number): number => NOW + secondsAfter * 1000;
const MODEL = 'maties/claude-sonnet-5';
const BUDGET = '/Users/eva/Documents/Northbank/budget-v22.xlsx';
const DEBT = '/Users/eva/Documents/Northbank/debt-schedule.xlsx';

const message = (
  id: string,
  type: CoworkMessage['type'],
  content: string,
  seconds: number,
  metadata?: CoworkMessage['metadata'],
): CoworkMessage => ({ id, type, content, timestamp: T(seconds), metadata });

const FIRST_ANSWER = [
  'The 4.1% comes from the **debt schedule**, not from the operating model. Sheet *Q3* of budget-v22.xlsx reads the blended rate from debt-schedule.xlsx, cell D14, and that cell is a hardcode.',
  '',
  '| Line | v21 | v22 | Change |',
  '|---|---:|---:|---:|',
  '| Blended rate | 3.6% | 4.1% | +0.5 pt |',
  '| Interest, FY26 | 2,140 | 2,438 | +298 |',
  '| Coverage | 3.2× | 2.8× | −0.4× |',
  '',
  'Three things worth checking before the meeting:',
  '',
  '1. Whether D14 was meant to stay a hardcode after the refinancing.',
  '2. The coverage covenant in the facility letter (it trips under 2.5×).',
  '3. The rounding on the FY27 column — it is off by one basis point.',
  '',
  'The formula the schedule used before v22 was:',
  '',
  '```excel',
  '=SUMPRODUCT(Tranches!C4:C9, Tranches!E4:E9) / SUM(Tranches!C4:C9)',
  '```',
].join('\n');

const STREAMED_ANSWER = [
  'Yes. Restoring the formula in D14 brings the blended rate back to 3.6% and the FY26 interest line to 2,140. The coverage ratio returns to 3.2×, comfortably above the 2.5× covenant, so the v22 case no longer trips it.',
  '',
  'Before you send the file on, two small things remain. The FY27 column still rounds to one decimal in the summary while the schedule keeps two, which is where the one-basis-point drift comes from; and the note on sheet *Assumptions* still describes the refinancing as pending, though the schedule now treats it as done. Neither changes a number that matters, but both will be the first thing a careful reader asks about.',
  '',
  '- The fix: one cell, `D14`, back to a formula.',
  '- The effect: the rate, the interest line and the coverage move together.',
  '- What is still open: the rounding and the stale note.',
  '',
  'Shall I also run the same check on the v21 file, so you have the comparison the board asked for?',
].join('\n');

const finishedTurn: ConversationTurn = {
  id: 'turn-1',
  userMessage: message('u1', 'user', 'Where does the 4.1% come from?', 0),
  assistantItems: [
    { type: 'assistant', message: message('t1', 'assistant', 'The person asks about a rate. I should find it in the workbook rather than guess: open the budget, then the schedule it links to.', 1, { isThinking: true }) },
    {
      type: 'tool_group',
      group: {
        type: 'tool_group',
        toolUse: message('s1', 'tool_use', 'Using tool: read', 4, { toolName: 'read', toolInput: { file_path: BUDGET }, toolUseId: 'call-1' }),
        toolResult: message('r1', 'tool_result', 'Sheet Q3: 42 rows, 12 columns. D14 = 4.1% (hardcode).', 7, { toolUseId: 'call-1' }),
      },
    },
    {
      type: 'tool_group',
      group: {
        type: 'tool_group',
        toolUse: message('s2', 'tool_use', 'Using tool: read', 8, { toolName: 'read', toolInput: { file_path: DEBT }, toolUseId: 'call-2' }),
        toolResult: message('r2', 'tool_result', 'Sheet Tranches: 6 tranches, blended 3.6% by formula; D14 overridden.', 11, { toolUseId: 'call-2' }),
      },
    },
    {
      type: 'tool_group',
      group: {
        type: 'tool_group',
        toolUse: message('s3', 'tool_use', 'Using tool: exec', 11, { toolName: 'exec', toolInput: { command: 'python3 compare.py budget-v21.xlsx budget-v22.xlsx' }, toolUseId: 'call-3' }),
        toolResult: message('r3', 'tool_result', '3 cells differ\nD14: 3.6% -> 4.1%\nF22: 2140 -> 2438\nH9: 3.2 -> 2.8', 13, { toolUseId: 'call-3' }),
      },
    },
    { type: 'assistant', message: message('a1', 'assistant', FIRST_ANSWER, 14, { model: MODEL, usage: { inputTokens: 18_420, outputTokens: 612 } }) },
  ],
};

const streamingPermission: CoworkPermissionRequest = {
  sessionId: 'preview',
  toolName: 'Bash',
  toolInput: {
    command: 'rm -rf ~/Documents/Northbank/_old-versions',
    dangerLevel: 'destructive',
    dangerReason: 'recursive-delete',
    cwd: '/Users/eva/Documents/Northbank',
  },
  requestId: 'approval-1',
  toolUseId: 'call-5',
};

const questionPermission: CoworkPermissionRequest = {
  sessionId: 'preview',
  toolName: 'AskUserQuestion',
  toolInput: {
    questions: [
      {
        question: 'Which version should the board pack use?',
        header: 'Board pack',
        options: [
          { label: 'v22 with the fix' },
          { label: 'v21 as sent' },
          { label: 'Both, side by side' },
        ],
      },
      {
        question: 'Should I keep the change log on the first sheet?',
        options: [{ label: 'Keep it' }, { label: 'Move it to a separate file' }],
      },
    ],
  },
  requestId: 'question-1',
  toolUseId: null,
};

const PLAN = [
  '1. Restore the formula in D14 of the debt schedule and re-link sheet Q3.',
  '2. Re-run the comparison against v21 and confirm the three cells that move.',
  '3. Fix the FY27 rounding in the summary so both files show two decimals.',
  '4. Update the note on the Assumptions sheet and add a line to the change log.',
].join('\n');

/** Tokens landing in bursts, the way a real model delivers them. */
const useBurstyStream = (fullText: string, startDelayMs: number) => {
  const [content, setContent] = useState('');
  const [streaming, setStreaming] = useState(true);
  const [round, setRound] = useState(0);
  const timers = useRef<number[]>([]);

  useEffect(() => {
    setContent('');
    setStreaming(true);
    const bursts = [0.06, 0.18, 0.31, 0.5, 0.62, 0.8, 1];
    const schedule: number[] = [];
    bursts.forEach((fraction, index) => {
      schedule.push(window.setTimeout(() => {
        setContent(fullText.slice(0, Math.round(fullText.length * fraction)));
        if (index === bursts.length - 1) setStreaming(false);
      }, startDelayMs + index * 550 + (index % 2) * 180));
    });
    timers.current = schedule;
    return () => {
      for (const timer of schedule) window.clearTimeout(timer);
    };
  }, [fullText, startDelayMs, round]);

  const replay = useCallback(() => setRound((value) => value + 1), []);
  return { content, streaming, replay };
};

const ConversationPreview: React.FC = () => {
  const { content, streaming, replay } = useBurstyStream(STREAMED_ANSWER, 1200);
  const [showApproval, setShowApproval] = useState(true);
  const [showQuestion, setShowQuestion] = useState(false);
  const [answered, setAnswered] = useState<string | null>(null);

  const streamingTurn = useMemo<ConversationTurn>(() => ({
    id: 'turn-2',
    userMessage: message('u2', 'user', 'Fix it.', 60),
    assistantItems: [
      { type: 'assistant', message: message('t2', 'assistant', 'Restore D14 first, then confirm the numbers move back together.', 61, { isThinking: true }) },
      {
        type: 'tool_group',
        group: {
          type: 'tool_group',
          toolUse: message('s4', 'tool_use', 'Using tool: edit', 64, { toolName: 'edit', toolInput: { file_path: DEBT, old_string: '4.1%', new_string: '=SUMPRODUCT(Tranches!C4:C9, Tranches!E4:E9) / SUM(Tranches!C4:C9)' }, toolUseId: 'call-4' }),
          toolResult: message('r4', 'tool_result', 'Edited 1 cell.', 66, { toolUseId: 'call-4' }),
        },
      },
      { type: 'assistant', message: message('a2', 'assistant', content, 68, { isStreaming: streaming, model: MODEL, usage: { inputTokens: 21_980, outputTokens: 240 } }) },
    ],
  }), [content, streaming]);

  // A turn stopped at a step that needs the person's yes: the ring turns, the card asks.
  const approvalTurn: ConversationTurn = {
    id: 'turn-3',
    userMessage: message('u3', 'user', 'Now clear the old versions folder.', 120),
    assistantItems: [
      { type: 'assistant', message: message('t3', 'assistant', 'Deleting is not reversible; ask before running it.', 121, { isThinking: true }) },
      {
        type: 'tool_group',
        group: {
          type: 'tool_group',
          toolUse: message('s6', 'tool_use', 'Using tool: read', 123, { toolName: 'read', toolInput: { file_path: '/Users/eva/Documents/Northbank/_old-versions/README.txt' }, toolUseId: 'call-6' }),
          toolResult: message('r6', 'tool_result', 'Superseded copies of v18 to v21. Safe to remove after v22 is signed off.', 124, { toolUseId: 'call-6' }),
        },
      },
      {
        type: 'tool_group',
        group: {
          type: 'tool_group',
          toolUse: message('s5', 'tool_use', 'Using tool: exec', 125, { toolName: 'exec', toolInput: { command: 'rm -rf ~/Documents/Northbank/_old-versions' }, toolUseId: 'call-5' }),
          toolResult: null,
        },
      },
    ],
  };

  const doneStep: ConversationTurn['assistantItems'][number] = finishedTurn.assistantItems[3];
  const failedGroup = {
    type: 'tool_group' as const,
    toolUse: message('s9', 'tool_use', 'Using tool: web_fetch', 0, { toolName: 'web_fetch', toolInput: { url: 'https://northbank.example/annual-report.pdf' }, toolUseId: 'call-9' }),
    toolResult: message('r9', 'tool_result', 'HTTP 404: the report moved.', 3, { toolUseId: 'call-9', isError: true }),
  };
  const skeletonGroup = {
    type: 'tool_group' as const,
    toolUse: message('s10', 'tool_use', 'Using tool: web_search', 0, { toolName: 'web_search', toolInput: { query: 'OHADA uniform act on commercial companies 2026 revision' }, toolUseId: 'call-10' }),
    toolResult: null,
  };

  return (
    <div
      className="fixed inset-0 z-[100] overflow-y-auto"
      style={{ background: '#fff', fontFamily: "'Instrument Sans', -apple-system, system-ui, sans-serif", color: '#1c1f23', fontSize: 14.5, lineHeight: 1.5, letterSpacing: '-.008em' }}
      data-maties-preview
    >
      <div className="mx-auto flex w-full max-w-[860px] flex-col gap-2 px-6 pb-24 pt-6">
        <div className="mb-2 flex items-center gap-2" data-cowork-search-exclude="true">
          <span className="maties-meta">Preview</span>
          <span className="flex-1" />
          <button type="button" className="maties-button maties-button-ghost" onClick={replay}>Replay the stream</button>
          <button type="button" className="maties-button maties-button-ghost" onClick={() => setShowApproval((value) => !value)}>
            {showApproval ? 'Hide the approval' : 'Show the approval'}
          </button>
          <button type="button" className="maties-button maties-button-ghost" onClick={() => setShowQuestion((value) => !value)}>
            {showQuestion ? 'Hide the question' : 'Show the question'}
          </button>
        </div>

        {/* The person's message, drawn here only for context: the real bubble is the other engineer's. */}
        <div className="flex justify-end px-6 py-2 sm:px-8 lg:px-10">
          <div className="mx-auto w-full max-w-[760px]">
            <div className="flex justify-end">
              <div style={{ background: '#f4f5f7', borderRadius: 18, padding: '12px 18px', maxWidth: '72%', fontSize: 14.5, color: '#1c1f23' }}>
                {finishedTurn.userMessage?.content}
              </div>
            </div>
          </div>
        </div>

        <AssistantTurnBlock turn={finishedTurn} showCopyButtons onForkMessage={() => undefined} onRetryTurn={() => undefined} />

        <div className="flex justify-end px-6 py-2 sm:px-8 lg:px-10">
          <div className="mx-auto w-full max-w-[760px]">
            <div className="flex justify-end">
              <div style={{ background: '#f4f5f7', borderRadius: 18, padding: '12px 18px', maxWidth: '72%', fontSize: 14.5, color: '#1c1f23' }}>
                {streamingTurn.userMessage?.content}
              </div>
            </div>
          </div>
        </div>

        <div data-maties-preview-turn="2">
          <AssistantTurnBlock turn={streamingTurn} isStreamingTurn showActivityIndicator showCopyButtons={false} />
        </div>

        <div className="flex justify-end px-6 py-2 sm:px-8 lg:px-10">
          <div className="mx-auto w-full max-w-[760px]">
            <div className="flex justify-end">
              <div style={{ background: '#f4f5f7', borderRadius: 18, padding: '12px 18px', maxWidth: '72%', fontSize: 14.5, color: '#1c1f23' }}>
                {approvalTurn.userMessage?.content}
              </div>
            </div>
          </div>
        </div>

        <div data-maties-preview-turn="3">
          <AssistantTurnBlock turn={approvalTurn} isStreamingTurn showActivityIndicator showCopyButtons={false} liveModelRef={MODEL} />
        </div>

        {showApproval && (
          <CoworkPermissionModal
            permission={streamingPermission}
            onRespond={(result) => { setAnswered(result.behavior); setShowApproval(false); }}
            onMinimize={() => setShowApproval(false)}
          />
        )}
        {showQuestion && (
          <CoworkQuestionWizard
            permission={questionPermission}
            onRespond={(result) => { setAnswered(result.behavior); setShowQuestion(false); }}
          />
        )}
        {answered && <div className="maties-meta px-10">Last answer: {answered}</div>}

        <div className="mt-10 flex flex-col gap-6 px-6 sm:px-8 lg:px-10">
          <div className="mx-auto flex w-full max-w-[760px] flex-col gap-6">
            <span className="maties-meta">States</span>
            <div className="flex flex-col gap-8" style={{ paddingLeft: 36 }}>
              {doneStep.type === 'tool_group' && <ToolCallGroup group={doneStep.group} isLive={false} />}
              <ToolCallGroup group={failedGroup} isLive />
              <ToolCallGroup group={skeletonGroup} isLive />
            </div>
            <span className="maties-meta">Inside the opened list</span>
            <div style={{ paddingLeft: 36 }}>
              {doneStep.type === 'tool_group' && <ToolCallGroup group={doneStep.group} variant={ToolCallVariant.Row} isLive={false} />}
              <ToolCallGroup group={failedGroup} variant={ToolCallVariant.Row} isLive />
            </div>
            <span className="maties-meta">A plan</span>
            <ProposedPlanBlock content={PLAN} onImageClick={() => undefined} showConfirmationActions onConfirmExecution={() => undefined} onAdjustPlan={() => undefined} />
          </div>
        </div>
      </div>
    </div>
  );
};

export default ConversationPreview;
