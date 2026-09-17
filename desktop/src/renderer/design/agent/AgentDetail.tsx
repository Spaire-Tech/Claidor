import { useEffect, useState } from 'react';

import type { ScheduledTask } from '../../../scheduledTask/types';
import { formatScheduleLabel } from '../../components/scheduledTasks/utils';
import type { CoworkUserMemoryEntry } from '../../types/cowork';
import { CloseIcon, FilesIcon, GlobeIcon, WarningIcon } from '../icons';
import { Orb, OrbMood } from '../orb/Orb';
import { AGENT_TABS as ROLE_TABS } from '../shell/roles';
import { color, line, motion, radius, shadow, text, tracking } from '../tokens';
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
 * The note under each tab's name, which the canvas writes beside the tab
 * (`detailTabs`, template.html:2079) and `shell/roles.ts` already carries
 * verbatim. The two tab lists name the same five things; this joins them
 * by the label rather than copying five strings a second time.
 */
const TAB_NOTES: ReadonlyMap<string, string> = new Map(ROLE_TABS.map(one => [one.id, one.note]));

/** The pointer over a control, for the canvas's `style-hover` states. */
function useHover(): [boolean, { onMouseEnter: () => void; onMouseLeave: () => void }] {
  const [over, setOver] = useState(false);
  return [over, { onMouseEnter: () => setOver(true), onMouseLeave: () => setOver(false) }];
}

/** The canvas's round icon button: transparent, the fill under the pointer. */
function RoundButton(
  { size, label, onClick, children }: {
    size: number;
    label: string;
    onClick: () => void;
    children: React.ReactNode;
  },
): JSX.Element {
  const [over, hover] = useHover();
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      {...hover}
      style={{
        width: size, height: size, flex: '0 0 auto', border: 'none',
        background: over ? color.fill : 'transparent', borderRadius: '50%', cursor: 'pointer',
        color: over ? color.ink : color.muted,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}
    >
      {children}
    </button>
  );
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
 *
 * Drawn as the 17 September canvas draws an agent's page inside Apps: a
 * white ground filling the pane, the face at 82px beside the name, a
 * 240px column of tabs with a note under each, and the body in a panel
 * of the inset fill. No glass, and no scrim — this is the pane itself.
 */
export function AgentDetail({ detail, agentName, agentId, onClose }: AgentDetailProps): JSX.Element {
  const { agent, tab, onTab } = detail;
  const subtitle = subtitleLine(agent?.description, detail.have.length);

  // Escape is the keyboard's way back, the same place the shell's back
  // bar goes. The X that used to sit in this header is gone.
  useEffect(() => {
    const onKey = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <div
      style={{
        position: 'absolute', inset: 0, zIndex: 55, display: 'flex',
        background: color.paper,
        // The canvas: `animation:msgIn .18s ease-out both` (template.html:437).
        animation: `fsr-message-in .18s ${motion.messageIn.easing} both`,
      }}
    >
      <div
        style={{
          width: '100%', height: '100%', boxSizing: 'border-box',
          display: 'flex', flexDirection: 'column', overflow: 'hidden', background: color.paper,
        }}
      >
        <div
          style={{
            flex: '1 1 auto', minHeight: 0, overflowY: 'auto', overflowX: 'hidden',
            padding: '26px 29px 38px', display: 'flex', flexDirection: 'column',
          }}
        >
          <div style={{ width: '100%', maxWidth: 860, margin: '0 auto', display: 'flex', flexDirection: 'column', gap: 31 }}>
            <div style={{ display: 'flex', alignItems: 'flex-start', gap: 19 }}>
              <Orb agentId={agentId} size={82} mood={OrbMood.Still} />
              <div style={{ flex: '1 1 auto', minWidth: 0, display: 'flex', flexDirection: 'column', gap: 6, paddingTop: 6 }}>
                <div style={{ fontSize: text.detailTitle, fontWeight: 500, letterSpacing: tracking.detailTitle, lineHeight: 1.2, color: color.ink }}>
                  {agentName}
                </div>
                {subtitle && (
                  <div style={{ fontSize: text.message, color: color.muted }}>{subtitle}</div>
                )}
              </div>
              {/* The X is gone: the shell's back bar is the way out of
                  every screen, and one door beats four (18 September). */}
            </div>

            <div style={{ height: 1, background: color.divider }} />

            <div style={{ display: 'grid', gridTemplateColumns: '240px minmax(0,1fr)', gap: 28, alignItems: 'start', paddingBottom: 6 }}>
              <div role="tablist" style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                {AGENT_TABS.map(one => {
                  const on = tab === one.id;
                  const note = TAB_NOTES.get(one.label);
                  return (
                    <button
                      key={one.id}
                      type="button"
                      role="tab"
                      aria-selected={on}
                      onClick={() => onTab(one.id)}
                      style={{
                        display: 'flex', flexDirection: 'column', gap: 4, alignItems: 'flex-start',
                        textAlign: 'left', padding: '14px 15px', borderRadius: radius.row,
                        cursor: 'pointer', font: 'inherit',
                        // The canvas's `detailTabs`: `transition:background .14s` (template.html:2087).
                        transition: 'background .14s',
                        background: on ? color.fillStrong : 'transparent',
                        border: on ? `1px solid ${line.hairline}` : '1px solid transparent',
                      }}
                    >
                      <span style={{ fontSize: text.emphasis, color: color.ink }}>{one.label}</span>
                      {note && <span style={{ fontSize: text.small, color: color.muted }}>{note}</span>}
                    </button>
                  );
                })}
              </div>

              <div
                role="tabpanel"
                style={{
                  minHeight: 280, padding: '24px 26px', borderRadius: radius.menu,
                  background: color.fill, border: `1px solid ${line.hairline}`,
                  display: 'flex', flexDirection: 'column', gap: 17,
                }}
              >
                <div style={{ fontSize: text.caption, color: color.muted }}>
                  {AGENT_TABS.find(one => one.id === tab)?.label}
                </div>
                {detail.loading
                  ? <Quiet>Reading…</Quiet>
                  : <Panel detail={detail} agentName={agentName} />}
              </div>
            </div>
          </div>
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

/** The one sentence a tab shows when it has nothing: the panel's body type, muted. */
function Quiet({ children }: { children: React.ReactNode }): JSX.Element {
  return (
    <div style={{ fontSize: text.emphasis, color: color.muted, lineHeight: 1.65, maxWidth: '62ch', textWrap: 'pretty' }}>
      {children}
    </div>
  );
}

/**
 * A row: something on the left, a control on the right. The panel is the
 * inset fill, so a row sits on it the way a skill chip does — the window's
 * grey with the card line.
 */
function Row({ children }: { children: React.ReactNode }): JSX.Element {
  return (
    <div
      style={{
        display: 'flex', alignItems: 'center', gap: 12, padding: '11px 13px',
        borderRadius: radius.row, background: color.window, border: `1px solid ${line.card}`,
      }}
    >
      {children}
    </div>
  );
}

/** The settings toggle, so a switch is one shape everywhere. */
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
        width: 44, height: 23, flex: '0 0 auto', border: 'none', borderRadius: radius.pill,
        cursor: 'pointer', display: 'flex', alignItems: 'center',
        justifyContent: on ? 'flex-end' : 'flex-start', padding: '0 2px',
        // The canvas: `transition:background .18s` and the off track at
        // `rgba(0,0,0,.09)` (template.html:1304), which is no token.
        transition: 'background .18s',
        background: on ? color.accent : 'rgba(0,0,0,.09)',
      }}
    >
      <span
        style={{
          width: 19, height: 19, borderRadius: '50%', background: color.paper,
          boxShadow: shadow.knob, display: 'block',
        }}
      />
    </button>
  );
}

/** The 26px round X on a row that can be taken away. */
function RowClose({ label, onClick }: { label: string; onClick: () => void }): JSX.Element {
  return (
    <RoundButton size={26} label={label} onClick={onClick}>
      <CloseIcon size={11} />
    </RoundButton>
  );
}

function Instructions({ detail, agentName }: { detail: AgentDetailState; agentName: string }): JSX.Element {
  const dirty = instructionsChanged(detail.savedInstructions, detail.instructions);
  const empty = !detail.savedInstructions.trim() && !detail.instructions.trim();
  const live = dirty && !detail.saving;

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
          borderRadius: radius.input, background: color.window,
          border: `1px solid ${line.field}`, outline: 'none',
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
          disabled={!live}
          style={{
            flex: '0 0 auto', height: 32, padding: '0 15px', borderRadius: radius.pill,
            border: 'none', font: 'inherit', fontSize: text.body, fontWeight: 500,
            color: live ? color.paper : color.muted,
            background: live ? color.accent : line.hover,
            cursor: live ? 'pointer' : 'default',
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
  const live = draft.trim().length > 0;

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
            flex: '1 1 auto', minWidth: 0, height: 32, padding: '0 13px',
            borderRadius: radius.pill, background: color.window,
            border: `1px solid ${line.field}`, outline: 'none',
            font: 'inherit', fontSize: text.body, color: color.ink,
          }}
        />
        <button
          type="button"
          onClick={add}
          disabled={!live}
          style={{
            flex: '0 0 auto', height: 32, padding: '0 15px', borderRadius: radius.pill,
            border: `1px solid ${line.field}`, background: color.window,
            font: 'inherit', fontSize: text.body, fontWeight: 400,
            color: live ? color.ink : color.faint,
            cursor: live ? 'pointer' : 'default',
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
      <span style={{ flex: '1 1 auto', minWidth: 0, fontSize: text.body, lineHeight: 1.45, color: color.ink }}>
        {entry.text}
      </span>
      <RowClose label={`Forget: ${entry.text}`} onClick={() => onDelete(entry.id)} />
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
            <span style={{ fontSize: text.body, fontWeight: 500, color: color.ink }}>{id}</span>
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
            <span style={{ fontSize: text.body, fontWeight: 500, color: color.ink }}>{skill.name}</span>
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
        <span style={{ fontSize: text.body, fontWeight: 500, color: color.ink }}>{task.name}</span>
        <span style={{ fontSize: text.caption, color: color.muted }}>
          {/*
            The schedule is read by the app's own cron reader rather than
            a second one written here: it already handles steps, weekdays
            and ranges, and falls back to showing the expression instead
            of guessing at it.
          */}
          {formatScheduleLabel(task.schedule)}
          {' · '}
          <span style={{ color: failed ? color.deleteInk : color.muted }}>
            {lastRunLine(task)}
          </span>
        </span>
        {failed && task.state.lastError && (
          <span style={{ fontSize: text.caption, color: color.deleteInk, lineHeight: 1.4 }}>
            {task.state.lastError}
          </span>
        )}
      </span>
      <Switch
        on={task.enabled}
        onChange={on => onToggle(task.id, on)}
        label={`Run ${task.name} on its schedule`}
      />
      <RowClose label={`Delete ${task.name}`} onClick={() => onDelete(task.id)} />
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
            <span style={{ fontSize: text.body, fontWeight: 500, color: color.ink }}>{server.name}</span>
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
