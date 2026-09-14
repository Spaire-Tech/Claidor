import { useState } from 'react';

import type { ScheduledTask } from '../../../scheduledTask/types';
import { formatScheduleLabel } from '../../components/scheduledTasks/utils';
import type { CoworkUserMemoryEntry } from '../../types/cowork';
import { CloseIcon, FilesIcon, GlobeIcon, WarningIcon } from '../icons';
import { Orb, OrbMood } from '../orb/Orb';
import { color, glass, line, radius, shadow, text, tracking } from '../tokens';
import {
  AGENT_TABS,
  AgentTab,
  emptyLine,
  instructionsChanged,
  lastRunLine,
  subtitleLine,
} from './detail';
import type { AgentDetailState } from './useAgentDetail';

export interface AgentDetailProps {
  detail: AgentDetailState;
  /** The name the sidebar shows, which is the one a person knows. */
  agentName: string;
  agentId: string;
  onClose: () => void;
}

/**
 * The agent, opened.
 *
 * Reached by tapping the name at the top of the conversation, which is
 * the gesture Messages already teaches: the person you are talking to is
 * at the top, and tapping them tells you about them.
 *
 * Five tabs, all reading things that already existed — the agent record,
 * the workspace MEMORY.md, the skill manager, the cron service and the
 * MCP store. Nothing here is a new subsystem, and that is the point.
 */
export function AgentDetail({ detail, agentName, agentId, onClose }: AgentDetailProps): JSX.Element {
  const { agent, tab, onTab } = detail;
  const subtitle = subtitleLine(agent?.description, detail.have.length);

  return (
    <div
      style={{
        position: 'absolute', inset: 0, zIndex: 55, display: 'flex',
        alignItems: 'center', justifyContent: 'center', padding: 32,
        background: glass.scrim, backdropFilter: glass.scrimBlur,
      }}
      onClick={onClose}
      role="presentation"
    >
      <div
        onClick={event => event.stopPropagation()}
        role="presentation"
        style={{
          width: '100%', maxWidth: 680, height: '100%', maxHeight: 680,
          boxSizing: 'border-box', display: 'flex', flexDirection: 'column',
          borderRadius: radius.modal, background: glass.background,
          backdropFilter: glass.blur, border: `1px solid ${glass.border}`,
          boxShadow: `${shadow.modal}, ${shadow.glassInset}`, overflow: 'hidden',
        }}
      >
        <div style={{ flex: '0 0 auto', padding: '22px 24px 0', display: 'flex', gap: 14 }}>
          <Orb agentId={agentId} size={52} mood={OrbMood.Still} />
          <div style={{ flex: '1 1 auto', minWidth: 0, display: 'flex', flexDirection: 'column', gap: 3, paddingTop: 4 }}>
            <div style={{ fontSize: text.dialogTitle, fontWeight: 500, letterSpacing: tracking.screenTitle }}>
              {agentName}
            </div>
            {subtitle && (
              <div style={{ fontSize: text.small, color: color.muted }}>{subtitle}</div>
            )}
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            style={{
              flex: '0 0 auto', width: 28, height: 28, border: 'none',
              background: 'transparent', cursor: 'pointer', color: color.muted,
              borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}
          >
            <CloseIcon size={13} />
          </button>
        </div>

        <div
          role="tablist"
          style={{
            flex: '0 0 auto', display: 'flex', gap: 2, padding: '16px 20px 0',
            borderBottom: `1px solid ${line.hairline}`,
          }}
        >
          {AGENT_TABS.map(one => {
            const on = tab === one.id;
            return (
              <button
                key={one.id}
                type="button"
                role="tab"
                aria-selected={on}
                onClick={() => onTab(one.id)}
                style={{
                  padding: '8px 12px 10px', border: 'none', background: 'transparent',
                  font: 'inherit', fontSize: text.body, cursor: 'pointer',
                  letterSpacing: tracking.body,
                  color: on ? color.ink : color.muted,
                  fontWeight: on ? 500 : 400,
                  boxShadow: on ? `inset 0 -2px 0 ${color.accent}` : 'none',
                }}
              >
                {one.label}
              </button>
            );
          })}
        </div>

        <div
          role="tabpanel"
          style={{
            flex: '1 1 auto', minHeight: 0, overflowY: 'auto',
            padding: '16px 24px 20px', display: 'flex', flexDirection: 'column', gap: 10,
          }}
        >
          {detail.loading
            ? <Quiet>Reading…</Quiet>
            : <Panel detail={detail} agentName={agentName} />}
        </div>
      </div>
    </div>
  );
}

function Panel({ detail, agentName }: { detail: AgentDetailState; agentName: string }): JSX.Element {
  switch (detail.tab) {
    case AgentTab.Instructions: return <Instructions detail={detail} agentName={agentName} />;
    case AgentTab.Memories: return <Memories detail={detail} agentName={agentName} />;
    case AgentTab.Skills: return <Skills detail={detail} agentName={agentName} />;
    case AgentTab.Routines: return <Routines detail={detail} agentName={agentName} />;
    case AgentTab.Integrations: return <Integrations detail={detail} agentName={agentName} />;
  }
}

/** The one grey sentence a tab shows when it has nothing. */
function Quiet({ children }: { children: React.ReactNode }): JSX.Element {
  return (
    <div style={{ fontSize: text.body, color: color.muted, lineHeight: 1.5, maxWidth: 46 * 14 }}>
      {children}
    </div>
  );
}

/** A row: something on the left, a control on the right. */
function Row({ children }: { children: React.ReactNode }): JSX.Element {
  return (
    <div
      style={{
        display: 'flex', alignItems: 'center', gap: 12, padding: '11px 12px',
        borderRadius: radius.row, background: color.fill,
      }}
    >
      {children}
    </div>
  );
}

function Switch({ on, onChange, label }: {
  on: boolean; onChange: (on: boolean) => void; label: string;
}): JSX.Element {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      aria-label={label}
      onClick={() => onChange(!on)}
      style={{
        flex: '0 0 auto', width: 42, height: 25, padding: 2, cursor: 'pointer',
        borderRadius: radius.pill, border: `1px solid ${line.button}`,
        background: on ? color.accent : color.fillStrong,
        display: 'flex', justifyContent: on ? 'flex-end' : 'flex-start',
        transition: `background ${'.15s'} ease`,
      }}
    >
      <span
        style={{
          width: 19, height: 19, borderRadius: '50%', background: color.paper,
          boxShadow: shadow.flat,
        }}
      />
    </button>
  );
}

function Instructions({ detail, agentName }: { detail: AgentDetailState; agentName: string }): JSX.Element {
  const dirty = instructionsChanged(detail.savedInstructions, detail.instructions);
  const empty = !detail.savedInstructions.trim() && !detail.instructions.trim();

  return (
    <>
      {empty && <Quiet>{emptyLine(AgentTab.Instructions, agentName)}</Quiet>}
      <textarea
        value={detail.instructions}
        onChange={event => detail.onInstructions(event.target.value)}
        aria-label={`What ${agentName} is for`}
        spellCheck={false}
        style={{
          flex: '1 1 auto', minHeight: 260, resize: 'none', padding: 14,
          borderRadius: radius.field, background: color.fill,
          border: `1px solid ${line.hairline}`, outline: 'none',
          font: 'inherit', fontSize: text.message, lineHeight: 1.55, color: color.ink,
        }}
      />
      <div style={{ flex: '0 0 auto', display: 'flex', alignItems: 'center', gap: 12 }}>
        <span style={{ flex: '1 1 auto', fontSize: text.caption, color: color.muted }}>
          {agentName} reads this before every reply.
        </span>
        <button
          type="button"
          onClick={detail.onSaveInstructions}
          disabled={!dirty || detail.saving}
          style={{
            flex: '0 0 auto', height: 34, padding: '0 18px', borderRadius: radius.pill,
            border: 'none', font: 'inherit', fontSize: text.body, color: color.paper,
            background: dirty && !detail.saving ? color.ink : color.disabled,
            cursor: dirty && !detail.saving ? 'pointer' : 'default',
          }}
        >
          {detail.saving ? 'Saving…' : 'Save'}
        </button>
      </div>
    </>
  );
}

function Memories({ detail, agentName }: { detail: AgentDetailState; agentName: string }): JSX.Element {
  const [draft, setDraft] = useState('');
  const add = (): void => { detail.onAddMemory(draft); setDraft(''); };

  return (
    <>
      <div style={{ flex: '0 0 auto', display: 'flex', gap: 8 }}>
        <input
          value={draft}
          onChange={event => setDraft(event.target.value)}
          onKeyDown={event => { if (event.key === 'Enter') { event.preventDefault(); add(); } }}
          placeholder={`Something ${agentName} should know`}
          aria-label={`Something ${agentName} should know`}
          style={{
            flex: '1 1 auto', minWidth: 0, height: 38, padding: '0 14px',
            borderRadius: radius.pill, background: color.fill,
            border: `1px solid ${line.hairline}`, outline: 'none',
            font: 'inherit', fontSize: text.small, color: color.ink,
          }}
        />
        <button
          type="button"
          onClick={add}
          disabled={!draft.trim()}
          style={{
            flex: '0 0 auto', height: 38, padding: '0 16px', borderRadius: radius.pill,
            border: `1px solid ${line.button}`, background: color.paper,
            font: 'inherit', fontSize: text.small,
            color: draft.trim() ? color.ink : color.disabled,
            cursor: draft.trim() ? 'pointer' : 'default',
          }}
        >
          Add
        </button>
      </div>

      {detail.memories.length === 0
        ? <Quiet>{emptyLine(AgentTab.Memories, agentName)}</Quiet>
        : detail.memories.map(entry => (
          <MemoryRow key={entry.id} entry={entry} onDelete={detail.onDeleteMemory} />
        ))}
    </>
  );
}

function MemoryRow({ entry, onDelete }: {
  entry: CoworkUserMemoryEntry; onDelete: (id: string) => void;
}): JSX.Element {
  return (
    <Row>
      <span style={{ flex: '1 1 auto', minWidth: 0, fontSize: text.body, lineHeight: 1.45 }}>
        {entry.text}
      </span>
      <button
        type="button"
        onClick={() => onDelete(entry.id)}
        aria-label={`Forget: ${entry.text}`}
        style={{
          flex: '0 0 auto', width: 26, height: 26, border: 'none', background: 'transparent',
          cursor: 'pointer', color: color.muted, borderRadius: '50%',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}
      >
        <CloseIcon size={11} />
      </button>
    </Row>
  );
}

function Skills({ detail, agentName }: { detail: AgentDetailState; agentName: string }): JSX.Element {
  const has = new Set(detail.have.map(one => one.id));

  return (
    <>
      {/*
        A named skill that is not installed comes first and is marked.
        It is the one case here that is actually wrong rather than empty:
        the agent's instructions tell it to use something it does not
        have, and it looks like a working agent until somebody asks it to
        do that job.
      */}
      {detail.missing.map(id => (
        <Row key={id}>
          <span style={{ flex: '0 0 auto', color: color.warning, display: 'flex' }}>
            <WarningIcon size={15} />
          </span>
          <span style={{ flex: '1 1 auto', minWidth: 0, display: 'flex', flexDirection: 'column', gap: 2 }}>
            <span style={{ fontSize: text.body, fontWeight: 500 }}>{id}</span>
            <span style={{ fontSize: text.caption, color: color.muted }}>
              Named by {agentName}, but not installed on this computer.
            </span>
          </span>
        </Row>
      ))}

      {detail.allSkills.length === 0 && detail.missing.length === 0 && (
        <Quiet>{emptyLine(AgentTab.Skills, agentName)}</Quiet>
      )}

      {detail.allSkills.map(skill => (
        <Row key={skill.id}>
          <span style={{ flex: '0 0 auto', color: color.muted, display: 'flex' }}>
            <FilesIcon size={16} />
          </span>
          <span style={{ flex: '1 1 auto', minWidth: 0, display: 'flex', flexDirection: 'column', gap: 2 }}>
            <span style={{ fontSize: text.body, fontWeight: 500 }}>{skill.name}</span>
            {skill.description && (
              <span style={{ fontSize: text.caption, color: color.muted, lineHeight: 1.4 }}>
                {skill.description}
              </span>
            )}
          </span>
          <Switch
            on={has.has(skill.id)}
            onChange={on => detail.onToggleSkill(skill.id, on)}
            label={`Give ${agentName} ${skill.name}`}
          />
        </Row>
      ))}
    </>
  );
}

function Routines({ detail, agentName }: { detail: AgentDetailState; agentName: string }): JSX.Element {
  if (detail.routines.length === 0) {
    return <Quiet>{emptyLine(AgentTab.Routines, agentName)}</Quiet>;
  }
  return (
    <>
      {detail.routines.map(task => (
        <RoutineRow
          key={task.id}
          task={task}
          onToggle={detail.onToggleRoutine}
          onDelete={detail.onDeleteRoutine}
        />
      ))}
    </>
  );
}

function RoutineRow({ task, onToggle, onDelete }: {
  task: ScheduledTask;
  onToggle: (id: string, enabled: boolean) => void;
  onDelete: (id: string) => void;
}): JSX.Element {
  const failed = task.state.lastStatus === 'error';
  return (
    <Row>
      <span style={{ flex: '1 1 auto', minWidth: 0, display: 'flex', flexDirection: 'column', gap: 3 }}>
        <span style={{ fontSize: text.body, fontWeight: 500 }}>{task.name}</span>
        <span style={{ fontSize: text.caption, color: color.muted }}>
          {/*
            The schedule is read by the app's own cron reader rather than
            a second one written here: it already handles steps, weekdays
            and ranges, and falls back to showing the expression instead
            of guessing at it.
          */}
          {formatScheduleLabel(task.schedule)}
          {' · '}
          <span style={{ color: failed ? color.danger : color.muted }}>
            {lastRunLine(task)}
          </span>
        </span>
        {failed && task.state.lastError && (
          <span style={{ fontSize: text.caption, color: color.danger, lineHeight: 1.4 }}>
            {task.state.lastError}
          </span>
        )}
      </span>
      <Switch
        on={task.enabled}
        onChange={on => onToggle(task.id, on)}
        label={`Run ${task.name} on its schedule`}
      />
      <button
        type="button"
        onClick={() => onDelete(task.id)}
        aria-label={`Delete ${task.name}`}
        style={{
          flex: '0 0 auto', width: 26, height: 26, border: 'none', background: 'transparent',
          cursor: 'pointer', color: color.muted, borderRadius: '50%',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}
      >
        <CloseIcon size={11} />
      </button>
    </Row>
  );
}

function Integrations({ detail, agentName }: { detail: AgentDetailState; agentName: string }): JSX.Element {
  if (detail.servers.length === 0) {
    return <Quiet>{emptyLine(AgentTab.Integrations, agentName)}</Quiet>;
  }
  return (
    <>
      {detail.servers.map(server => (
        <Row key={server.id}>
          <span style={{ flex: '0 0 auto', color: color.muted, display: 'flex' }}>
            <GlobeIcon size={16} />
          </span>
          <span style={{ flex: '1 1 auto', minWidth: 0, display: 'flex', flexDirection: 'column', gap: 2 }}>
            <span style={{ fontSize: text.body, fontWeight: 500 }}>{server.name}</span>
            {server.description && (
              <span style={{ fontSize: text.caption, color: color.muted, lineHeight: 1.4 }}>
                {server.description}
              </span>
            )}
          </span>
          <Switch
            on={server.enabled}
            onChange={on => detail.onToggleServer(server.id, on)}
            label={`Let agents reach ${server.name}`}
          />
        </Row>
      ))}
      {/*
        Integrations are the computer's, not one agent's: an MCP server
        is reachable by every agent once it is on. Saying so is cheaper
        than letting somebody discover it by turning one off here and
        finding it gone everywhere.
      */}
      <Quiet>Integrations are shared. Turning one on here turns it on for every agent.</Quiet>
    </>
  );
}
