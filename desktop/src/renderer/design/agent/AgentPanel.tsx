import { useEffect, useState } from 'react';

import { AVATAR_COUNT } from '../../../shared/agent/avatars';
import { CloseIcon } from '../icons';
import { CloudBlob } from '../orb/CloudBlob';
import { color, line, motion, radius, shadow, text, tracking } from '../tokens';

/**
 * The agent panel: the third column, from the 15 September canvas.
 *
 * Opened two ways and it is the same panel both times — by the agent's
 * name in the conversation header, and by the trash icon on the active
 * sidebar row, which opens it with the delete question already asked.
 * The founder: "i added a delete button in the left bar, that opens a
 * right panel. that same right panel opens up top. for edit."
 *
 * **Edits are live.** The canvas's `applyEdit` writes on every keystroke
 * and there is no Save. So the fields here are the agent's, typed into
 * directly, and every change goes up as a patch; the caller decides how
 * often to write it down (`useMessagesShell` debounces the store call).
 * Local state exists only so the caret does not jump while the store is
 * catching up — it is reset when a different agent opens.
 *
 * **Delete asks once, in place.** "Delete {name} and this conversation?
 * This can't be undone." with Delete and Keep, inside the panel. Not a
 * dialog, not a second press on the same button — the canvas draws the
 * question where the button was.
 */

export interface AgentPanelAgent {
  id: string;
  name: string;
  label: string;
  description: string;
  avatar: number;
  notify: boolean;
}

export interface AgentPanelPatch {
  name?: string;
  label?: string;
  description?: string;
  avatar?: number;
  notify?: boolean;
}

export interface AgentPanelProps {
  agent: AgentPanelAgent;
  /** Open with the delete question already showing (the sidebar's trash). */
  asking?: boolean;
  /** Absent for the main agent, which cannot be deleted. */
  onDelete?: () => void;
  onChange: (patch: AgentPanelPatch) => void;
  onClose: () => void;
}

const fieldStyle: React.CSSProperties = {
  height: 42, padding: '0 14px', borderRadius: radius.field,
  border: `1px solid ${line.button}`, background: color.paper,
  outline: 'none', font: 'inherit', fontSize: text.message, color: color.ink,
  boxShadow: shadow.flat, boxSizing: 'border-box', width: '100%',
};

const labelStyle: React.CSSProperties = { fontSize: text.caption, color: color.muted };

/** The canvas's card: paper on paper, an inset white line, a soft edge. */
const cardStyle: React.CSSProperties = {
  borderRadius: radius.row, background: color.paper,
  border: `1px solid ${line.hairline}`,
  boxShadow: `inset 0 1px 0 rgba(255,255,255,.7), ${shadow.flat}`,
};

export function AgentPanel({ agent, asking = false, onDelete, onChange, onClose }: AgentPanelProps): JSX.Element {
  const [name, setName] = useState(agent.name);
  const [label, setLabel] = useState(agent.label);
  const [description, setDescription] = useState(agent.description);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [askingDelete, setAskingDelete] = useState(asking);

  // A different agent, or the same one opened from the trash: start over.
  useEffect(() => {
    setName(agent.name);
    setLabel(agent.label);
    setDescription(agent.description);
    setPickerOpen(false);
    setAskingDelete(asking);
  }, [agent.id, asking]); // eslint-disable-line react-hooks/exhaustive-deps

  const shownName = name.trim() || agent.name;

  return (
    <div
      style={{
        display: 'flex', flexDirection: 'column', minHeight: 0, minWidth: 0, overflow: 'hidden',
        borderLeft: `1px solid ${line.hairline}`,
        background: 'rgba(249,250,252,.86)', backdropFilter: 'blur(20px)',
        animation: `fsr-message-in ${motion.messageIn.duration} ease-out both`,
      }}
    >
      <div
        style={{
          flex: '0 0 auto', display: 'flex', alignItems: 'center', gap: 10,
          padding: '16px 18px', borderBottom: `1px solid ${line.hairline}`,
        }}
      >
        <span style={{ flex: '1 1 auto', fontSize: text.emphasis, fontWeight: 500, letterSpacing: tracking.title }}>
          Agent settings
        </span>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close"
          style={{
            width: 30, height: 30, borderRadius: 10, border: '1px solid transparent',
            background: 'transparent', cursor: 'pointer', color: color.muted,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}
        >
          <CloseIcon size={13} />
        </button>
      </div>

      <div
        style={{
          flex: '1 1 auto', minHeight: 0, overflowY: 'auto', overflowX: 'hidden',
          padding: '20px 18px 24px', display: 'flex', flexDirection: 'column', gap: 16,
        }}
      >
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10, padding: '2px 0' }}>
          <CloudBlob avatar={agent.avatar} size={76} />
          <button
            type="button"
            onClick={() => setPickerOpen(open => !open)}
            aria-expanded={pickerOpen}
            style={{
              height: 32, padding: '0 14px', borderRadius: radius.pill,
              border: `1px solid ${line.button}`, background: color.paper,
              cursor: 'pointer', font: 'inherit', fontSize: text.caption, color: color.ink,
              whiteSpace: 'nowrap', boxShadow: shadow.flat,
            }}
          >
            {pickerOpen ? 'Done' : 'Edit avatar'}
          </button>
        </div>

        {pickerOpen && (
          <div style={{ ...cardStyle, padding: 13, display: 'flex', flexDirection: 'column', gap: 11 }}>
            <div style={labelStyle}>Choose an avatar</div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, minmax(0, 1fr))', gap: 7 }}>
              {Array.from({ length: AVATAR_COUNT }, (_, index) => {
                const on = index === agent.avatar;
                return (
                  <button
                    key={index}
                    type="button"
                    onClick={() => onChange({ avatar: index })}
                    aria-label={`Avatar ${index + 1}`}
                    aria-pressed={on}
                    style={{
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      width: '100%', minWidth: 0, aspectRatio: '1', padding: 0,
                      borderRadius: 13, cursor: 'pointer',
                      background: on ? color.fill : 'transparent',
                      border: `1.5px solid ${on ? color.ink : line.hairline}`,
                    }}
                  >
                    <CloudBlob avatar={index} size={38} style={{ width: '100%', height: '100%' }} />
                  </button>
                );
              })}
            </div>
          </div>
        )}

        <div style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
          <div style={labelStyle}>Name</div>
          <input
            value={name}
            onChange={event => { setName(event.target.value); onChange({ name: event.target.value }); }}
            placeholder="Agent name"
            style={fieldStyle}
          />
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
          <div style={labelStyle}>Label (optional)</div>
          <input
            value={label}
            onChange={event => { setLabel(event.target.value); onChange({ label: event.target.value }); }}
            placeholder="Research, marketing, admin…"
            style={{ ...fieldStyle, fontSize: text.body }}
          />
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
          <div style={labelStyle}>Description</div>
          <textarea
            value={description}
            onChange={event => { setDescription(event.target.value); onChange({ description: event.target.value }); }}
            placeholder="What should this agent take care of?"
            style={{
              ...fieldStyle, height: 'auto', minHeight: 84, padding: '12px 14px',
              borderRadius: radius.panel, resize: 'vertical', lineHeight: 1.45,
            }}
          />
        </div>

        <div style={{ ...cardStyle, display: 'flex', alignItems: 'center', gap: 12, padding: '14px 15px' }}>
          <div style={{ flex: '1 1 auto', minWidth: 0, display: 'flex', flexDirection: 'column', gap: 3 }}>
            <div style={{ fontSize: text.body, fontWeight: 500, color: color.ink }}>Notifications</div>
            <div style={{ fontSize: text.label, color: color.muted, lineHeight: 1.4 }}>
              Get notified when this agent finishes or needs input
            </div>
          </div>
          <button
            type="button"
            role="switch"
            aria-checked={agent.notify}
            aria-label="Notifications"
            onClick={() => onChange({ notify: !agent.notify })}
            style={{
              position: 'relative', width: 44, height: 26, flex: '0 0 auto', padding: 0,
              border: 'none', borderRadius: radius.pill, cursor: 'pointer',
              transition: 'background .16s ease',
              background: agent.notify ? color.ink : '#c4ccd8',
            }}
          >
            <span
              style={{
                position: 'absolute', top: 3, left: agent.notify ? 21 : 3,
                width: 20, height: 20, borderRadius: '50%', background: color.paper,
                transition: 'left .16s ease', boxShadow: '0 1px 2px rgba(16,22,35,.18)',
              }}
            />
          </button>
        </div>

        {onDelete && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 9, paddingTop: 14, borderTop: `1px solid ${line.hairline}` }}>
            {!askingDelete ? (
              <button
                type="button"
                onClick={() => setAskingDelete(true)}
                style={{
                  display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
                  height: 42, padding: '0 16px', borderRadius: radius.field,
                  border: '1px solid rgba(201,42,37,.2)', background: '#fdeceb', color: color.danger,
                  font: 'inherit', fontSize: text.body, whiteSpace: 'nowrap', cursor: 'pointer',
                }}
              >
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.7} aria-hidden focusable="false" style={{ flex: '0 0 auto' }}>
                  <path d="M4 7h16" /><path d="M9 7V5h6v2" /><path d="M6 7l1 13h10l1-13" /><path d="M10 11v6M14 11v6" />
                </svg>
                <span>Delete agent</span>
              </button>
            ) : (
              <div
                style={{
                  display: 'flex', flexDirection: 'column', gap: 10, padding: 14,
                  borderRadius: radius.panel, background: '#fdeceb', border: '1px solid rgba(201,42,37,.16)',
                }}
              >
                <div style={{ fontSize: text.label, lineHeight: 1.45, color: color.danger, textWrap: 'pretty' }}>
                  Delete {shownName} and this conversation? This can&apos;t be undone.
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <button
                    type="button"
                    onClick={onDelete}
                    style={{
                      flex: '1 1 auto', height: 38, borderRadius: 11, border: 'none',
                      background: color.danger, color: color.paper,
                      font: 'inherit', fontSize: text.small, fontWeight: 500, cursor: 'pointer',
                    }}
                  >
                    Delete
                  </button>
                  <button
                    type="button"
                    onClick={() => setAskingDelete(false)}
                    style={{
                      flex: '1 1 auto', height: 38, borderRadius: 11,
                      border: `1px solid ${line.button}`, background: color.paper, color: color.ink,
                      font: 'inherit', fontSize: text.small, cursor: 'pointer',
                    }}
                  >
                    Keep
                  </button>
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
