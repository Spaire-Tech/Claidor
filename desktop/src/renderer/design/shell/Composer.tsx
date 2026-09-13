import { type KeyboardEvent, useState } from 'react';

import { color, line, radius, text } from '../tokens';

export interface ComposerProps {
  placeholder?: string;
  disabled?: boolean;
  onSend: (message: string) => void;
  /** The `+` menu. Attach files, teach a task. */
  onPlus?: () => void;
}

/**
 * The pill at the bottom.
 *
 * Two details from the canvas that are easy to lose and matter:
 *
 * - **The send button changes with the draft.** Empty, it is a microphone;
 *   with text, an arrow. One control, two jobs, no dead button ever shown.
 * - **Enter sends, Shift+Enter does not.** This is a texting app.
 */
export function Composer({
  placeholder = 'Message', disabled, onSend, onPlus,
}: ComposerProps): JSX.Element {
  const [draft, setDraft] = useState('');
  const has = draft.trim().length > 0;

  const send = (): void => {
    const message = draft.trim();
    if (!message || disabled) return;
    setDraft('');
    onSend(message);
  };

  const onKeyDown = (event: KeyboardEvent<HTMLInputElement>): void => {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      send();
    }
  };

  return (
    <div style={{ padding: '14px 24px 22px' }}>
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 12,
          minHeight: 52,
          padding: '6px 8px 6px 6px',
          borderRadius: radius.pill,
          background: color.fill,
          border: `1px solid ${line.hairline}`,
          boxShadow: 'inset 0 1px 0 rgba(255,255,255,.7)',
        }}
      >
        {onPlus && (
          <button
            type="button"
            onClick={onPlus}
            aria-label="More"
            style={{
              width: 40, height: 40, flex: '0 0 auto', borderRadius: '50%',
              border: `1px solid ${line.hairline}`, background: color.paper,
              color: color.muted, fontSize: 19, lineHeight: 1, cursor: 'pointer',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}
          >
            +
          </button>
        )}

        <input
          value={draft}
          onChange={event => setDraft(event.target.value)}
          onKeyDown={onKeyDown}
          placeholder={placeholder}
          disabled={disabled}
          style={{
            flex: '1 1 auto', minWidth: 0, border: 'none', outline: 'none',
            background: 'transparent', font: 'inherit',
            fontSize: text.message, color: color.ink,
          }}
        />

        <button
          type="button"
          onClick={send}
          disabled={disabled}
          aria-label={has ? 'Send' : 'Speak'}
          style={{
            width: 40, height: 40, flex: '0 0 auto', borderRadius: '50%',
            border: 'none', background: color.ink, cursor: disabled ? 'default' : 'pointer',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            opacity: disabled ? 0.5 : 1,
          }}
        >
          <span aria-hidden style={{ color: color.paper, fontSize: 16, lineHeight: 1 }}>
            {has ? '↑' : '🎙'}
          </span>
        </button>
      </div>
    </div>
  );
}
