import { type ButtonHTMLAttributes, type CSSProperties, useEffect, useState } from 'react';

import { AVATAR_COUNT } from '../../../shared/agent/avatars';
import { CloseIcon } from '../icons';
import { CloudBlob } from '../orb/CloudBlob';
import { color, line, motion, radius, shadow, text, tracking } from '../tokens';

/**
 * The agent panel: the third column, from the 15 September canvas and
 * measured against the 17 September one (template.html 831–903).
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

/** An input on the panel's grey: white, no line, the flat shadow. */
const fieldStyle: CSSProperties = {
  height: 34, padding: '0 11px', borderRadius: radius.field,
  border: 'none', background: color.paper,
  outline: 'none', font: 'inherit', fontSize: text.message, color: color.ink,
  boxShadow: shadow.flat, boxSizing: 'border-box', width: '100%',
};

const labelStyle: CSSProperties = { fontSize: text.label, color: color.muted };

/** A group on the panel: the window's grey, no line round it. */
const boxStyle: CSSProperties = {
  borderRadius: radius.row, background: color.window, border: 'none',
};

const hoverTransition = `background ${motion.hover.duration} ${motion.hover.easing}`;

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
        // One step off the window's grey; the rounded corner is the shell's.
        background: color.fillRaised,
        animation: `fsr-message-in ${motion.messageIn.duration} ease-out both`,
      }}
    >
      <div
        style={{
          flex: '0 0 auto', display: 'flex', alignItems: 'center', gap: 9,
          padding: '14px 15px', borderBottom: `1px solid ${line.hairline}`,
        }}
      >
        <span style={{ flex: '1 1 auto', fontSize: text.emphasis, fontWeight: 500, letterSpacing: tracking.title }}>
          Agent settings
        </span>
        <HoverButton
          onClick={onClose}
          aria-label="Close"
          style={{
            width: 25, height: 25, borderRadius: radius.pill, border: '1px solid transparent',
            background: 'transparent', cursor: 'pointer', color: color.muted,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            transition: hoverTransition,
          }}
          hoverStyle={{ background: color.fill, borderColor: line.hairline }}
        >
          <CloseIcon size={12} />
        </HoverButton>
      </div>

      <div
        style={{
          flex: '1 1 auto', minHeight: 0, overflowY: 'auto', overflowX: 'hidden',
          padding: '17px 15px 21px', display: 'flex', flexDirection: 'column', gap: 14,
        }}
      >
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 9, padding: '2px 0' }}>
          <CloudBlob avatar={agent.avatar} size={70} />
          <HoverButton
            onClick={() => setPickerOpen(open => !open)}
            aria-expanded={pickerOpen}
            style={{
              height: 26, padding: '0 11px', borderRadius: radius.pill,
              border: 'none', background: color.paper,
              cursor: 'pointer', font: 'inherit', fontSize: text.caption, color: color.ink,
              whiteSpace: 'nowrap', boxShadow: shadow.flat, transition: hoverTransition,
            }}
            hoverStyle={{ background: color.window }}
          >
            {pickerOpen ? 'Done' : 'Edit avatar'}
          </HoverButton>
        </div>

        {pickerOpen && (
          <div style={{ ...boxStyle, padding: 11, display: 'flex', flexDirection: 'column', gap: 10 }}>
            <div style={labelStyle}>Choose an avatar</div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, minmax(0, 1fr))', gap: 6 }}>
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
                      borderRadius: radius.control, cursor: 'pointer',
                      background: on ? color.window : 'transparent',
                      border: `1.5px solid ${on ? color.ink : line.card}`,
                    }}
                  >
                    <CloudBlob avatar={index} size={36} style={{ width: '100%', height: '100%' }} />
                  </button>
                );
              })}
            </div>
          </div>
        )}

        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          <div style={labelStyle}>Name</div>
          <input
            value={name}
            onChange={event => { setName(event.target.value); onChange({ name: event.target.value }); }}
            placeholder="Agent name"
            style={fieldStyle}
          />
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          <div style={labelStyle}>Label (optional)</div>
          <input
            value={label}
            onChange={event => { setLabel(event.target.value); onChange({ label: event.target.value }); }}
            placeholder="Research, marketing, admin…"
            style={{ ...fieldStyle, fontSize: text.body }}
          />
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          <div style={labelStyle}>Description</div>
          <textarea
            value={description}
            onChange={event => { setDescription(event.target.value); onChange({ description: event.target.value }); }}
            placeholder="What should this agent take care of?"
            style={{
              ...fieldStyle, height: 'auto', minHeight: 78, padding: '11px 12px',
              borderRadius: radius.input, resize: 'vertical', lineHeight: 1.45,
            }}
          />
        </div>

        <div style={{ ...boxStyle, display: 'flex', alignItems: 'center', gap: 11, padding: '12px 13px' }}>
          <div style={{ flex: '1 1 auto', minWidth: 0, display: 'flex', flexDirection: 'column', gap: 4 }}>
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
              position: 'relative', width: 36, height: 21, flex: '0 0 auto', padding: 0,
              border: 'none', borderRadius: radius.pill, cursor: 'pointer',
              transition: hoverTransition,
              // The track when off: 9% black, the canvas's one value for it (template.html 1999).
              background: agent.notify ? color.accent : 'rgba(0,0,0,.09)',
            }}
          >
            <span
              style={{
                position: 'absolute', top: 3, left: agent.notify ? 21 : 3,
                width: 17, height: 17, borderRadius: '50%', background: color.paper,
                transition: `left ${motion.hover.duration} ${motion.hover.easing}`, boxShadow: shadow.flat,
              }}
            />
          </button>
        </div>

        {onDelete && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8, paddingTop: 12, borderTop: `1px solid ${line.field}` }}>
            {!askingDelete ? (
              <HoverButton
                onClick={() => setAskingDelete(true)}
                style={{
                  display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
                  height: 34, padding: '0 15px', borderRadius: radius.pill,
                  // The red's own lines and hover, drawn once in the canvas (template.html 886).
                  border: '1px solid rgba(201,42,37,.2)', background: color.deleteFill, color: color.deleteInk,
                  font: 'inherit', fontSize: text.body, whiteSpace: 'nowrap', cursor: 'pointer',
                  transition: hoverTransition,
                }}
                hoverStyle={{ background: '#fbdedc' }}
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.7} aria-hidden focusable="false" style={{ flex: '0 0 auto' }}>
                  <path d="M4 7h16" /><path d="M9 7V5h6v2" /><path d="M6 7l1 13h10l1-13" /><path d="M10 11v6M14 11v6" />
                </svg>
                <span>Delete agent</span>
              </HoverButton>
            ) : (
              <div
                style={{
                  display: 'flex', flexDirection: 'column', gap: 9, padding: 12,
                  // The question's line, drawn once in the canvas (template.html 892).
                  borderRadius: radius.input, background: color.deleteFill, border: '1px solid rgba(201,42,37,.16)',
                }}
              >
                <div style={{ fontSize: text.label, lineHeight: 1.45, color: color.deleteInk, textWrap: 'pretty' }}>
                  Delete {shownName} and this conversation? This can&apos;t be undone.
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <HoverButton
                    onClick={onDelete}
                    style={{
                      flex: '1 1 auto', height: 32, borderRadius: radius.pill, border: 'none',
                      background: color.deleteInk, color: color.paper,
                      font: 'inherit', fontSize: text.small, fontWeight: 400, cursor: 'pointer',
                      transition: hoverTransition,
                    }}
                    // The pressed red, drawn once in the canvas (template.html 895).
                    hoverStyle={{ background: '#b02420' }}
                  >
                    Delete
                  </HoverButton>
                  <HoverButton
                    onClick={() => setAskingDelete(false)}
                    style={{
                      flex: '1 1 auto', height: 32, borderRadius: radius.pill,
                      border: 'none', background: color.paper, color: color.ink,
                      font: 'inherit', fontSize: text.small, cursor: 'pointer',
                      transition: hoverTransition,
                    }}
                    hoverStyle={{ background: color.window }}
                  >
                    Keep
                  </HoverButton>
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
