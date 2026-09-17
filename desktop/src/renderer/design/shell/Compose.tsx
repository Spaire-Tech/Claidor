import { type ButtonHTMLAttributes, type CSSProperties, type KeyboardEvent, useMemo, useRef, useState } from 'react';

import { assignAvatar, AVATAR_COUNT, avatarFallback } from '../../../shared/agent/avatars';
import { DEFAULT_VOICE_ID, voiceById,VOICES } from '../agents/voices';
import { CloseIcon } from '../icons';
import { CloudBlob } from '../orb/CloudBlob';
import { Orb, OrbMood } from '../orb/Orb';
import { color, font, glass, line, motion, radius, shadow, text, tracking } from '../tokens';
import {
  canCreate,
  ComposeAction,
  type ComposeRow,
  ComposeRowKind,
  composeRows,
  rowForShortcut,
} from './composeRows';
import type { SidebarAgent } from './Sidebar';

export interface AgentDraftSubmit {
  name: string;
  label: string;
  description: string;
  /** '' when no voice was picked. The canvas allows that. */
  voiceId: string;
  /**
   * The face, 0–24. Rolled once when the form opened and shown on it
   * since, so the agent that appears in the sidebar is the one the person
   * was looking at while they typed its name.
   */
  avatar: number;
}

export interface ComposeProps {
  agents: readonly SidebarAgent[];
  /** Open a conversation with an agent that already exists. */
  onPick: (agentId: string) => void;
  onCreate: (draft: AgentDraftSubmit) => void;
  onClose: () => void;
  /**
   * Every face currently on an agent, for the roll. Without it the rule
   * "the first twenty-five are all different" cannot be kept here.
   */
  wornAvatars?: readonly number[];
}

/** A button that changes under the pointer, since inline styles cannot. */
function HoverButton(
  { hoverStyle, style, onMouseEnter, onMouseLeave, ...rest }:
    ButtonHTMLAttributes<HTMLButtonElement> & { hoverStyle: CSSProperties },
): JSX.Element {
  const [hover, setHover] = useState(false);
  return (
    <button
      type="button"
      onMouseEnter={event => { setHover(true); onMouseEnter?.(event); }}
      onMouseLeave={event => { setHover(false); onMouseLeave?.(event); }}
      style={{ ...style, ...(hover ? hoverStyle : {}) }}
      {...rest}
    />
  );
}

/**
 * The pills at the foot of the form and the voice picker (template.html
 * 262–263, 335–336): the primary is the accent, 34px, weight 500; Cancel
 * is white with no border and goes the window's grey under the pointer.
 */
const pill: CSSProperties = {
  height: 34, padding: '0 18px', borderRadius: radius.pill, border: 'none',
  font: 'inherit', fontSize: text.body, cursor: 'pointer', whiteSpace: 'nowrap',
  transition: `background ${motion.hover.duration} ${motion.hover.easing}`,
};

const primaryPill: CSSProperties = { ...pill, background: color.accent, color: color.paper, fontWeight: 500 };
const primaryHover: CSSProperties = { background: color.accentHover };
const cancelPill: CSSProperties = { ...pill, background: color.paper, color: color.ink, fontWeight: 400 };
const cancelHover: CSSProperties = { background: color.window };

/**
 * Starting something: a To: line, a picker, and the new-agent form.
 *
 * It takes over the conversation pane rather than opening a dialog over
 * it, which is what the canvas does and what Messages does — composing is
 * a place you are, not a thing on top of where you were.
 */
export function Compose({ agents, onPick, onCreate, onClose, wornAvatars = [] }: ComposeProps): JSX.Element {
  const [query, setQuery] = useState('');
  const [creating, setCreating] = useState(false);

  const [name, setName] = useState('');
  const [label, setLabel] = useState('');
  const [description, setDescription] = useState('');
  // No voice until one is picked: the canvas starts at "No voice yet".
  const [voiceId, setVoiceId] = useState('');
  const [pickingVoice, setPickingVoice] = useState(false);
  // Rolled once, when "Create new agent" is taken — the canvas's
  // `setupPalette()` — and held here until the agent is made or the pane
  // closes. Changing it is the picker's job, not typing's.
  const [avatar, setAvatar] = useState<number>();
  const [avatarOpen, setAvatarOpen] = useState(false);
  const nameRef = useRef<HTMLInputElement>(null);

  const rows = useMemo(() => composeRows({ agents, query }), [agents, query]);

  const take = (row: ComposeRow): void => {
    if (row.kind === ComposeRowKind.Action && row.id === ComposeAction.NewAgent) {
      setAvatar(assignAvatar(wornAvatars));
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
          display: 'flex', alignItems: 'center', gap: 9, padding: '14px 21px',
          borderBottom: `1px solid ${line.hairline}`,
          background: color.paper,
        }}
      >
        <span style={{ fontSize: text.emphasis, color: color.muted }}>To:</span>
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
            fontSize: text.emphasis, color: color.ink,
          }}
        />
        <HoverButton
          onClick={onClose}
          aria-label="Close"
          style={{
            width: 25, height: 25, border: 'none', background: 'transparent',
            cursor: 'pointer', color: color.muted, borderRadius: '50%',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}
          hoverStyle={{ background: color.fill, color: color.ink }}
        >
          <CloseIcon size={12} />
        </HoverButton>
      </div>

      <div
        style={{
          flex: '1 1 auto', minHeight: 0, overflowY: 'auto', overflowX: 'hidden',
          padding: '15px 21px 24px', display: 'flex', flexDirection: 'column',
          gap: 12, alignItems: 'flex-start', background: color.paper,
        }}
      >
        {creating ? (
          <NewAgentForm
            name={name} setName={setName}
            label={label} setLabel={setLabel}
            description={description} setDescription={setDescription}
            voiceId={voiceId}
            avatar={avatar ?? avatarFallback(name)}
            avatarOpen={avatarOpen}
            onToggleAvatar={() => setAvatarOpen(open => !open)}
            onPickAvatar={index => setAvatar(index)}
            nameRef={nameRef}
            onPickVoice={() => setPickingVoice(true)}
            onCancel={onClose}
            onCreate={() => {
              if (avatar === undefined) return;
              onCreate({ name, label, description, voiceId, avatar });
            }}
          />
        ) : (
          <div
            style={{
              width: '100%', maxWidth: 640, boxSizing: 'border-box', padding: 6,
              borderRadius: radius.panel, background: color.window, border: 'none',
              display: 'flex', flexDirection: 'column', gap: 4,
              animation: `fsr-message-in ${motion.messageIn.duration} ${motion.messageIn.easing} both`,
            }}
          >
            {rows.length === 0 && (
              <div style={{ padding: '14px 12px', fontSize: text.body, color: color.muted }}>
                Nobody by that name. Clear the box to see everyone.
              </div>
            )}
            {rows.map(row => (
              <HoverButton
                key={`${row.kind}:${row.id}`}
                onClick={() => take(row)}
                style={{
                  display: 'flex', alignItems: 'center', gap: 11, height: 43,
                  padding: '0 10px', borderRadius: radius.row, cursor: 'pointer',
                  border: 'none', background: 'transparent', font: 'inherit',
                  textAlign: 'left', width: '100%',
                  transition: `background ${motion.hover.duration} ${motion.hover.easing}`,
                }}
                hoverStyle={{ background: color.window }}
              >
                {row.kind === ComposeRowKind.Agent ? (
                  <CloudBlob avatar={row.avatar ?? avatarFallback(row.id)} size={25} />
                ) : (
                  <span
                    style={{
                      width: 25, height: 25, flex: '0 0 auto', borderRadius: '50%',
                      background: color.fill, border: `1px solid ${line.hairline}`,
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      color: color.muted, fontSize: 16, lineHeight: 1,
                    }}
                  >
                    +
                  </span>
                )}
                <span
                  style={{
                    flex: '1 1 auto', minWidth: 0, fontSize: text.emphasis, fontWeight: 400, color: color.ink,
                    whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
                  }}
                >
                  {row.label}
                </span>
                {row.key && <Shortcut digit={row.key} />}
              </HoverButton>
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
        <div style={{ padding: '0 24px 18px', fontSize: text.small, color: color.faint, background: color.paper }}>
          {voice.name} — {voice.description.toLowerCase()}
        </div>
      )}
    </div>
  );
}

const keyCap: CSSProperties = {
  minWidth: 19, height: 19, padding: '0 4px', borderRadius: radius.key,
  background: color.fill, border: `1px solid ${line.hairline}`,
  display: 'flex', alignItems: 'center', justifyContent: 'center',
  fontFamily: font.mono, fontSize: text.code, color: color.muted,
};

function Shortcut({ digit }: { digit: string }): JSX.Element {
  return (
    <span style={{ flex: '0 0 auto', display: 'flex', alignItems: 'center', gap: 4 }}>
      <span style={keyCap}>⌘</span>
      <span style={keyCap}>{digit}</span>
    </span>
  );
}

/** An input in the form: white on the window's grey, no line round it. */
const field: CSSProperties = {
  height: 36, padding: '0 12px', borderRadius: radius.field,
  border: 'none', background: color.paper,
  outline: 'none', font: 'inherit', fontSize: text.message, color: color.ink,
};

interface NewAgentFormProps {
  name: string; setName: (value: string) => void;
  label: string; setLabel: (value: string) => void;
  description: string; setDescription: (value: string) => void;
  voiceId: string;
  avatar: number;
  avatarOpen: boolean;
  onToggleAvatar: () => void;
  onPickAvatar: (avatar: number) => void;
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
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      <div style={{ fontSize: text.label, color: color.muted }}>{title}</div>
      {control}
    </div>
  );

  return (
    <div
      style={{
        width: '100%', maxWidth: 640, boxSizing: 'border-box', padding: '21px 21px 19px',
        borderRadius: radius.panel, background: color.window, border: 'none',
        display: 'flex', flexDirection: 'column', gap: 19,
        animation: `fsr-message-in ${motion.messageIn.longer} ${motion.messageIn.easing} both`,
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
        {/*
          The face was rolled when this form opened and it stays put while
          you type. It used to be drawn from the name — a different face on
          every keystroke, and none of them the one the agent ended up
          with, since that was drawn from its id. This one is stored.
        */}
        <CloudBlob avatar={props.avatar} size={52} />
        <div style={{ flex: '1 1 auto', minWidth: 0, display: 'flex', flexDirection: 'column', gap: 4 }}>
          <div style={{ fontSize: text.base, fontWeight: 500, letterSpacing: tracking.title, color: color.ink }}>
            New agent
          </div>
          <div style={{ fontSize: text.label, color: color.muted }}>Pick an avatar, a name and a voice.</div>
        </div>
        <HoverButton
          onClick={props.onToggleAvatar}
          aria-expanded={props.avatarOpen}
          style={{
            display: 'flex', alignItems: 'center', gap: 6, flex: '0 0 auto', height: 27,
            padding: '0 10px', borderRadius: radius.pill, cursor: 'pointer', font: 'inherit',
            color: color.ink, boxShadow: shadow.flat, border: `1px solid ${line.field}`,
            background: props.avatarOpen ? color.window : color.paper,
          }}
          hoverStyle={{ background: color.window }}
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.7} aria-hidden focusable="false">
            <path d="M4 20h4l10.5-10.5a2.5 2.5 0 00-3.5-3.5L4.5 16.5V20z" />
            <path d="M14.5 6.5l3 3" />
          </svg>
          <span style={{ fontSize: text.small, whiteSpace: 'nowrap' }}>Edit avatar</span>
        </HoverButton>
      </div>

      {props.avatarOpen && (
        <div
          style={{
            padding: 12, borderRadius: radius.row, background: color.window, border: 'none',
            display: 'flex', flexDirection: 'column', gap: 10,
          }}
        >
          <div style={{ fontSize: text.label, color: color.muted }}>Choose an avatar</div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(9, minmax(0, 1fr))', gap: 6 }}>
            {Array.from({ length: AVATAR_COUNT }, (_, index) => {
              const on = index === props.avatar;
              return (
                <button
                  key={index}
                  type="button"
                  onClick={() => props.onPickAvatar(index)}
                  aria-label={`Avatar ${index + 1}`}
                  aria-pressed={on}
                  style={{
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    width: '100%', minWidth: 0, aspectRatio: '1', padding: 0,
                    borderRadius: radius.field, cursor: 'pointer',
                    background: on ? color.window : 'transparent',
                    border: `1.5px solid ${on ? color.ink : line.card}`,
                  }}
                >
                  <CloudBlob avatar={index} size={31} style={{ width: '100%', height: '100%' }} />
                </button>
              );
            })}
          </div>
        </div>
      )}

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
        <HoverButton
          onClick={props.onPickVoice}
          style={{
            display: 'flex', alignItems: 'center', gap: 11, alignSelf: 'flex-start',
            height: 36, padding: '0 12px 0 5px', borderRadius: radius.pill,
            border: `1px solid ${line.button}`, background: color.paper,
            cursor: 'pointer', font: 'inherit',
            transition: `background ${motion.hover.duration} ${motion.hover.easing}`,
          }}
          hoverStyle={{ background: color.window }}
        >
          {/*
            The voice's own sphere, not the agent's face. A voice is a
            picture of its own in the canvas, and until one is picked there
            is a plain grey disc and "No voice yet" — not a default nobody
            chose wearing a colour that belongs to something else.
          */}
          {voice ? (
            <Orb agentId={voice.id} colors={voice.colors} seed={voice.seed} size={26} mood={OrbMood.Still} style={{ boxShadow: 'none' }} />
          ) : (
            <span
              style={{
                width: 26, height: 26, flex: '0 0 auto', borderRadius: '50%',
                background: color.fill, border: `1px solid ${line.hairline}`, display: 'block',
              }}
            />
          )}
          <span style={{ fontSize: text.message, color: color.ink, whiteSpace: 'nowrap' }}>{voice?.name ?? 'No voice yet'}</span>
          <span style={{ fontSize: text.message, color: color.muted, whiteSpace: 'nowrap' }}>{voice ? 'Change' : 'Add'}</span>
        </HoverButton>
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
            ...field, height: 'auto', minHeight: 78, padding: '11px 14px',
            borderRadius: radius.input, resize: 'none', lineHeight: 1.45,
          }}
        />
      ))}

      <div style={{ display: 'flex', alignItems: 'center', gap: 9, paddingTop: 2 }}>
        <HoverButton
          onClick={props.onCreate}
          disabled={!ready}
          style={{
            ...pill, fontWeight: 400,
            // Until a name is typed the button wears the hover grey and
            // ink, and does not point (template.html 2158–2159).
            background: ready ? color.accent : line.hover,
            color: ready ? color.paper : color.ink,
            cursor: ready ? 'pointer' : 'default',
          }}
          hoverStyle={ready ? primaryHover : {}}
        >
          Create agent
        </HoverButton>
        <HoverButton onClick={props.onCancel} style={cancelPill} hoverStyle={cancelHover}>
          Cancel
        </HoverButton>
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
 * One voice at a time, with an arrow either side.
 *
 * This was a list of seven tiles, and the file said so in a comment: "a
 * list rather than the canvas's one-at-a-time carousel: seven is few
 * enough to see at once". That is an argument, and it is not mine to
 * make — the canvas shows one 163px orb, the name at 18px, the
 * description at 14px, a row of dots, and "Use this voice" / "Cancel".
 *
 * And the argument was wrong anyway. A voice is not compared by looking
 * at seven of them; it is compared by hearing one, then the next. The
 * carousel is the shape of that.
 *
 * Nothing is chosen until "Use this voice" — the arrows move the
 * selection here and the caller only hears about it once.
 */
function VoicePicker({ voiceId, onPick, onClose }: VoicePickerProps): JSX.Element {
  const start = Math.max(0, VOICES.findIndex(one => one.id === (voiceId || DEFAULT_VOICE_ID)));
  const [at, setAt] = useState(start);
  const voice = VOICES[at] ?? VOICES[0];

  // Wrapping, so neither arrow is ever dead. `+ VOICES.length` because
  // `-1 % 7` is `-1` in JavaScript and would leave nothing selected.
  const step = (by: number): void =>
    setAt(current => (current + by + VOICES.length) % VOICES.length);

  const arrow = (by: number, label: string, path: string): JSX.Element => (
    <HoverButton
      onClick={() => step(by)}
      aria-label={label}
      style={{
        width: 29, height: 29, flex: '0 0 auto', border: 'none', borderRadius: '50%',
        background: 'transparent', cursor: 'pointer', color: color.muted,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}
      hoverStyle={{ color: color.ink, background: line.hover }}
    >
      <svg width="15.5" height="15.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" aria-hidden focusable="false">
        <path d={path} />
      </svg>
    </HoverButton>
  );

  return (
    <div
      style={{
        position: 'absolute', inset: 0, zIndex: 60, display: 'flex',
        alignItems: 'center', justifyContent: 'center', padding: 28,
        background: glass.scrim, backdropFilter: glass.scrimBlur,
        animation: `fsr-message-in ${motion.messageIn.longer} ${motion.messageIn.easing} both`,
      }}
      onClick={onClose}
      role="presentation"
    >
      <div
        onClick={event => event.stopPropagation()}
        role="presentation"
        style={{
          width: '100%', maxWidth: 560, boxSizing: 'border-box',
          padding: '29px 28px 24px', borderRadius: radius.modal,
          background: color.paper, border: `1px solid ${line.hairline}`,
          boxShadow: shadow.modal,
          display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 21,
        }}
      >
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6, textAlign: 'center' }}>
          <div style={{ fontSize: text.dialogTitle, fontWeight: 500, letterSpacing: tracking.screenTitle, color: color.ink }}>
            Choose a voice.
          </div>
          <div style={{ fontSize: text.emphasis, color: color.muted }}>
            How your agent speaks to you.
          </div>
        </div>

        <Orb agentId={voice.id} colors={voice.colors} seed={voice.seed} size={163} mood={OrbMood.Idle} elevated />

        <div style={{ display: 'flex', alignItems: 'center', gap: 17, width: '100%', justifyContent: 'center' }}>
          {arrow(-1, 'Previous voice', 'M15 5l-7 7 7 7')}
          <div style={{ minWidth: 204, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4, textAlign: 'center' }}>
            <div style={{ fontSize: text.sidebarTitle, fontWeight: 500, letterSpacing: '-.012em', color: color.ink }}>
              {voice.name}
            </div>
            <div style={{ fontSize: text.message, color: color.muted }}>{voice.description}</div>
          </div>
          {arrow(1, 'Next voice', 'M9 5l7 7-7 7')}
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          {VOICES.map((one, index) => (
            <button
              key={one.id}
              type="button"
              onClick={() => setAt(index)}
              aria-label={one.name}
              aria-current={index === at}
              style={{
                width: 9, height: 9, padding: 0, borderRadius: '50%',
                border: 'none', cursor: 'pointer',
                transition: `background ${motion.hover.duration} ${motion.hover.easing}`,
                background: index === at ? color.ink : color.faint,
              }}
            />
          ))}
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 9, paddingTop: 2 }}>
          <HoverButton onClick={() => onPick(voice.id)} style={primaryPill} hoverStyle={primaryHover}>
            Use this voice
          </HoverButton>
          <HoverButton onClick={onClose} style={cancelPill} hoverStyle={cancelHover}>
            Cancel
          </HoverButton>
        </div>
      </div>
    </div>
  );
}
