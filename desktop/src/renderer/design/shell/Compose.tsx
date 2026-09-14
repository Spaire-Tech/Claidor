import { type KeyboardEvent, useMemo, useRef, useState } from 'react';

import { DEFAULT_VOICE_ID, voiceById,VOICES } from '../agents/voices';
import { CloseIcon } from '../icons';
import { Orb, OrbMood } from '../orb/Orb';
import { color, glass, line, radius, shadow, text, tracking } from '../tokens';
import {
  canCreate,
  ComposeAction,
  type ComposeRow,
  ComposeRowKind,
  composeRows,
  rowForShortcut,
} from './compose';
import type { SidebarAgent } from './Sidebar';

export interface AgentDraftSubmit {
  name: string;
  label: string;
  description: string;
  voiceId: string;
}

export interface ComposeProps {
  agents: readonly SidebarAgent[];
  /** Open a conversation with an agent that already exists. */
  onPick: (agentId: string) => void;
  onCreate: (draft: AgentDraftSubmit) => void;
  onClose: () => void;
}

/**
 * Starting something: a To: line, a picker, and the new-agent form.
 *
 * It takes over the conversation pane rather than opening a dialog over
 * it, which is what the canvas does and what Messages does — composing is
 * a place you are, not a thing on top of where you were.
 */
export function Compose({ agents, onPick, onCreate, onClose }: ComposeProps): JSX.Element {
  const [query, setQuery] = useState('');
  const [creating, setCreating] = useState(false);

  const [name, setName] = useState('');
  const [label, setLabel] = useState('');
  const [description, setDescription] = useState('');
  const [voiceId, setVoiceId] = useState(DEFAULT_VOICE_ID);
  const [pickingVoice, setPickingVoice] = useState(false);
  const nameRef = useRef<HTMLInputElement>(null);

  const rows = useMemo(() => composeRows({ agents, query }), [agents, query]);

  const take = (row: ComposeRow): void => {
    if (row.kind === ComposeRowKind.Action && row.id === ComposeAction.NewAgent) {
      setCreating(true);
      // The name is the only required field, so start in it.
      window.setTimeout(() => nameRef.current?.focus(), 0);
      return;
    }
    onPick(row.id);
  };

  const onKeyDown = (event: KeyboardEvent<HTMLInputElement>): void => {
    if (event.key === 'Escape') { onClose(); return; }
    if (event.key === 'Enter' && rows.length > 0) { event.preventDefault(); take(rows[0]); return; }
    if ((event.metaKey || event.ctrlKey) && /^[1-9]$/.test(event.key)) {
      const row = rowForShortcut(rows, event.key);
      if (row) { event.preventDefault(); take(row); }
    }
  };

  const voice = voiceById(voiceId);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', minWidth: 0, minHeight: 0, flex: '1 1 auto' }}>
      <div
        style={{
          display: 'flex', alignItems: 'center', gap: 10, padding: '16px 24px',
          borderBottom: `1px solid ${line.hairline}`,
          background: 'rgba(250,251,252,.92)', backdropFilter: 'blur(20px)',
        }}
      >
        <span style={{ fontSize: text.message, color: color.muted }}>To:</span>
        <input
          autoFocus
          value={query}
          onChange={event => setQuery(event.target.value)}
          onKeyDown={onKeyDown}
          placeholder={creating ? 'New agent' : 'Search'}
          aria-label="Who to message"
          disabled={creating}
          style={{
            flex: '1 1 auto', minWidth: 0, border: 'none', outline: 'none',
            background: 'transparent', font: 'inherit',
            fontSize: text.message, color: color.ink,
          }}
        />
        <button
          type="button"
          onClick={onClose}
          aria-label="Close"
          style={{
            width: 30, height: 30, border: 'none', background: 'transparent',
            cursor: 'pointer', color: color.muted, borderRadius: '50%',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}
        >
          <CloseIcon size={13} />
        </button>
      </div>

      <div
        style={{
          flex: '1 1 auto', minHeight: 0, overflowY: 'auto',
          padding: '18px 24px 28px', display: 'flex', flexDirection: 'column',
          gap: 14, alignItems: 'flex-start',
        }}
      >
        {creating ? (
          <NewAgentForm
            name={name} setName={setName}
            label={label} setLabel={setLabel}
            description={description} setDescription={setDescription}
            voiceId={voiceId}
            nameRef={nameRef}
            onPickVoice={() => setPickingVoice(true)}
            onCancel={onClose}
            onCreate={() => onCreate({ name, label, description, voiceId })}
          />
        ) : (
          <div
            style={{
              width: '100%', maxWidth: 640, boxSizing: 'border-box', padding: 8,
              borderRadius: radius.modal, background: glass.background,
              backdropFilter: glass.blur, border: `1px solid ${glass.border}`,
              boxShadow: `${shadow.modal}, ${shadow.glassInset}`,
              display: 'flex', flexDirection: 'column', gap: 2,
            }}
          >
            {rows.length === 0 && (
              <div style={{ padding: '14px 12px', fontSize: text.body, color: color.muted }}>
                Nobody by that name. Clear the box to see everyone.
              </div>
            )}
            {rows.map(row => (
              <button
                key={`${row.kind}:${row.id}`}
                type="button"
                onClick={() => take(row)}
                style={{
                  display: 'flex', alignItems: 'center', gap: 12, height: 46,
                  padding: '0 10px', borderRadius: radius.row, cursor: 'pointer',
                  border: 'none', background: 'transparent', font: 'inherit',
                  textAlign: 'left', width: '100%',
                }}
              >
                {row.kind === ComposeRowKind.Agent ? (
                  <Orb agentId={row.id} size={30} mood={OrbMood.Still} />
                ) : (
                  <span
                    style={{
                      width: 30, height: 30, flex: '0 0 auto', borderRadius: '50%',
                      background: color.fill, border: `1px solid ${line.hairline}`,
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      color: color.muted, fontSize: 17, lineHeight: 1,
                    }}
                  >
                    +
                  </span>
                )}
                <span
                  style={{
                    flex: '1 1 auto', minWidth: 0, fontSize: text.message, color: color.ink,
                    whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
                  }}
                >
                  {row.label}
                </span>
                {row.key && <Shortcut digit={row.key} />}
              </button>
            ))}
          </div>
        )}
      </div>

      {pickingVoice && (
        <VoicePicker
          voiceId={voiceId}
          onPick={id => { setVoiceId(id); setPickingVoice(false); }}
          onClose={() => setPickingVoice(false)}
        />
      )}

      {/* A quiet reminder of what the picked voice is, under the form. */}
      {creating && voice && (
        <div style={{ padding: '0 24px 18px', fontSize: text.small, color: color.faint }}>
          {voice.name} — {voice.description.toLowerCase()}
        </div>
      )}
    </div>
  );
}

const keyCap: React.CSSProperties = {
  minWidth: 22, height: 22, padding: '0 5px', borderRadius: radius.chip,
  background: color.fill, border: `1px solid ${line.hairline}`,
  display: 'flex', alignItems: 'center', justifyContent: 'center',
  fontFamily: 'ui-monospace, SFMono-Regular, monospace', fontSize: 11, color: color.muted,
};

function Shortcut({ digit }: { digit: string }): JSX.Element {
  return (
    <span style={{ flex: '0 0 auto', display: 'flex', alignItems: 'center', gap: 4 }}>
      <span style={keyCap}>⌘</span>
      <span style={keyCap}>{digit}</span>
    </span>
  );
}

const field: React.CSSProperties = {
  height: 44, padding: '0 16px', borderRadius: radius.input,
  border: `1px solid ${line.field}`, background: color.paper,
  outline: 'none', font: 'inherit', fontSize: text.message, color: color.ink,
};

interface NewAgentFormProps {
  name: string; setName: (value: string) => void;
  label: string; setLabel: (value: string) => void;
  description: string; setDescription: (value: string) => void;
  voiceId: string;
  nameRef: React.RefObject<HTMLInputElement>;
  onPickVoice: () => void;
  onCancel: () => void;
  onCreate: () => void;
}

function NewAgentForm(props: NewAgentFormProps): JSX.Element {
  const { name, setName, label, setLabel, description, setDescription } = props;
  const voice = voiceById(props.voiceId);
  const ready = canCreate(name);

  const group = (title: string, control: JSX.Element): JSX.Element => (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 9 }}>
      <div style={{ fontSize: text.small, color: color.muted }}>{title}</div>
      {control}
    </div>
  );

  return (
    <div
      style={{
        width: '100%', maxWidth: 640, boxSizing: 'border-box', padding: '24px 24px 22px',
        borderRadius: radius.modal, background: glass.background,
        backdropFilter: glass.blur, border: `1px solid ${glass.border}`,
        boxShadow: `${shadow.modal}, ${shadow.glassInset}`,
        display: 'flex', flexDirection: 'column', gap: 22,
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
        {/* The orb is drawn from the name, so it changes as you type and
            the agent arrives already looking like itself. */}
        <Orb agentId={name.trim() || 'new-agent'} size={56} mood={OrbMood.Idle} elevated />
        <div style={{ fontSize: text.base, fontWeight: 500, letterSpacing: tracking.title }}>
          New agent
        </div>
      </div>

      {group('Name', (
        <input
          ref={props.nameRef}
          value={name}
          onChange={event => setName(event.target.value)}
          placeholder="e.g. Perrin"
          style={field}
        />
      ))}

      {group('Voice', (
        <button
          type="button"
          onClick={props.onPickVoice}
          style={{
            display: 'flex', alignItems: 'center', gap: 12, alignSelf: 'flex-start',
            height: 44, padding: '0 16px 0 6px', borderRadius: radius.pill,
            border: `1px solid ${line.button}`, background: color.paper,
            cursor: 'pointer', font: 'inherit',
          }}
        >
          <Orb agentId={props.voiceId} size={32} mood={OrbMood.Still} />
          <span style={{ fontSize: text.message, color: color.ink }}>{voice?.name ?? 'Pick a voice'}</span>
          <span style={{ fontSize: text.message, color: color.muted }}>Change</span>
        </button>
      ))}

      {group('Label (optional)', (
        <input
          value={label}
          onChange={event => setLabel(event.target.value)}
          placeholder="Research, marketing, admin…"
          style={field}
        />
      ))}

      {group('Description', (
        <textarea
          value={description}
          onChange={event => setDescription(event.target.value)}
          placeholder="What should this agent take care of?"
          style={{
            ...field, height: 'auto', minHeight: 84, padding: '13px 16px',
            borderRadius: radius.panel, resize: 'none', lineHeight: 1.45,
          }}
        />
      ))}

      <div style={{ display: 'flex', alignItems: 'center', gap: 10, paddingTop: 2 }}>
        <button
          type="button"
          onClick={props.onCreate}
          disabled={!ready}
          style={{
            height: 42, padding: '0 22px', borderRadius: radius.field, border: 'none',
            background: ready ? color.ink : color.disabled, color: color.paper,
            font: 'inherit', fontSize: text.body, fontWeight: 500,
            cursor: ready ? 'pointer' : 'default',
          }}
        >
          Create agent
        </button>
        <button
          type="button"
          onClick={props.onCancel}
          style={{
            height: 42, padding: '0 20px', borderRadius: radius.field,
            border: `1px solid ${line.button}`, background: color.paper,
            color: color.ink, font: 'inherit', fontSize: text.body, cursor: 'pointer',
          }}
        >
          Cancel
        </button>
      </div>
    </div>
  );
}

interface VoicePickerProps {
  voiceId: string;
  onPick: (voiceId: string) => void;
  onClose: () => void;
}

/**
 * Seven voices, each with its own orb.
 *
 * A list rather than the canvas's one-at-a-time carousel: seven is few
 * enough to see at once, and comparing them is the whole task.
 */
function VoicePicker({ voiceId, onPick, onClose }: VoicePickerProps): JSX.Element {
  return (
    <div
      style={{
        position: 'absolute', inset: 0, zIndex: 60, display: 'flex',
        alignItems: 'center', justifyContent: 'center', padding: 32,
        background: 'rgba(195,203,214,.42)', backdropFilter: 'blur(10px)',
      }}
      onClick={onClose}
      role="presentation"
    >
      <div
        onClick={event => event.stopPropagation()}
        role="presentation"
        style={{
          width: '100%', maxWidth: 480, maxHeight: '100%', overflowY: 'auto',
          boxSizing: 'border-box', padding: 24, borderRadius: radius.modal,
          background: glass.background, backdropFilter: glass.blur,
          border: `1px solid ${glass.border}`,
          boxShadow: `${shadow.modal}, ${shadow.glassInset}`,
          display: 'flex', flexDirection: 'column', gap: 16,
        }}
      >
        <div style={{ textAlign: 'center', display: 'flex', flexDirection: 'column', gap: 6 }}>
          <div style={{ fontSize: text.dialogTitle, fontWeight: 500, letterSpacing: tracking.screenTitle }}>
            Choose a voice.
          </div>
          <div style={{ fontSize: text.emphasis, color: color.muted }}>
            How your agent speaks to you.
          </div>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
          {VOICES.map(voice => {
            const on = voice.id === voiceId;
            return (
              <button
                key={voice.id}
                type="button"
                onClick={() => onPick(voice.id)}
                aria-pressed={on}
                style={{
                  display: 'flex', alignItems: 'center', gap: 12, padding: '10px 12px',
                  borderRadius: radius.row, cursor: 'pointer', font: 'inherit',
                  textAlign: 'left', width: '100%',
                  background: on ? color.paper : 'transparent',
                  border: on ? '1px solid rgba(255,255,255,.6)' : '1px solid transparent',
                  boxShadow: on ? shadow.raised : 'none',
                }}
              >
                <Orb agentId={voice.id} size={34} mood={OrbMood.Still} />
                <span style={{ flex: '1 1 auto', minWidth: 0, display: 'flex', flexDirection: 'column', gap: 2 }}>
                  <span style={{ fontSize: text.emphasis, color: color.ink }}>{voice.name}</span>
                  <span style={{ fontSize: text.small, color: color.muted }}>{voice.description}</span>
                </span>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
