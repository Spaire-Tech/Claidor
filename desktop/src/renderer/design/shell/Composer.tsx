import { type KeyboardEvent, useEffect, useRef, useState } from 'react';

import { i18nService } from '../../services/i18n';
import { AttachIcon, CloseIcon, MicIcon, SendIcon } from '../icons';
import { color, line, motion, radius, shadow, text } from '../tokens';
import { attachmentLines, basenameOf } from './attach';
import type { DictationHandle } from './useDictation';

export interface ComposerProps {
  placeholder?: string;
  disabled?: boolean;
  onSend: (message: string) => void;
  /**
   * "Teach a task" — walk the agent through something once so it can do it
   * again. Absent, the row is not shown rather than shown dead.
   */
  onTeach?: () => void;
  /**
   * Text put into the box from outside — Reply on a message. `at` is a
   * stamp that changes each time, so quoting the same message twice
   * works; the text replaces the draft and the caret lands after it.
   */
  seed?: { text: string; at: number };
  /**
   * The microphone. `text` mirrors into the draft while listening and
   * lands as the draft when `finalAt` bumps; `note` is shown in place of
   * the placeholder while the draft is empty. Absent, the mic button is
   * still drawn (the canvas has it) but says speech needs the app.
   */
  dictation?: DictationHandle;
}

/**
 * The pill at the bottom.
 *
 * Three details from the canvas that are easy to lose and matter:
 *
 * - **The send button changes with the draft.** Empty, it is a microphone;
 *   with text, an arrow. One control, two jobs, no dead button ever shown.
 * - **Enter sends, Shift+Enter does not.** This is a texting app.
 * - **The `+` opens a 216px popover**: Attach files, and Teach a task with
 *   a red record dot. It shipped once as `onPlus={() => {}}` — a button
 *   that looked like every other button and did nothing at all.
 */
export function Composer({
  placeholder = 'Message', disabled, onSend, onTeach, seed, dictation,
}: ComposerProps): JSX.Element {
  const [draft, setDraft] = useState('');
  const [plusOpen, setPlusOpen] = useState(false);
  const [attached, setAttached] = useState<readonly string[]>([]);
  const has = draft.trim().length > 0;
  const plusRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // While the person speaks, the draft is what has been recognised so
  // far; when they stop, the final text takes its place and the caret
  // lands after it, ready to be read, fixed and sent.
  const listening = dictation?.listening ?? false;
  const spoken = dictation?.text ?? '';
  const finalAt = dictation?.finalAt ?? 0;
  useEffect(() => {
    if (!listening) return;
    setDraft(spoken);
  }, [listening, spoken]);
  useEffect(() => {
    if (finalAt === 0) return;
    setDraft(spoken);
    const input = inputRef.current;
    if (!input) return;
    input.focus();
    window.setTimeout(() => input.setSelectionRange(spoken.length, spoken.length), 0);
    // `spoken` is fixed for a given `finalAt`; re-running on it would reseed a draft being edited.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [finalAt]);

  useEffect(() => {
    if (!seed) return;
    setDraft(seed.text);
    const input = inputRef.current;
    if (!input) return;
    input.focus();
    // After React has written the value, or the caret lands at 0.
    window.setTimeout(() => input.setSelectionRange(seed.text.length, seed.text.length), 0);
  }, [seed]);

  // Escape, and a click anywhere else. The same behaviour as the account
  // menu, because a popover that only closes by pressing its own button is
  // the kind of thing nobody notices until they are stuck behind it.
  useEffect(() => {
    if (!plusOpen) return undefined;
    const onKey = (event: globalThis.KeyboardEvent): void => {
      if (event.key === 'Escape') setPlusOpen(false);
    };
    const onDown = (event: MouseEvent): void => {
      if (!plusRef.current?.contains(event.target as Node)) setPlusOpen(false);
    };
    document.addEventListener('keydown', onKey);
    const timer = window.setTimeout(() => document.addEventListener('mousedown', onDown), 0);
    return () => {
      document.removeEventListener('keydown', onKey);
      document.removeEventListener('mousedown', onDown);
      window.clearTimeout(timer);
    };
  }, [plusOpen]);

  const send = (): void => {
    const message = draft.trim();
    if (disabled) return;
    // A file with nothing said about it is still a message: "here, look at
    // this" is what dropping a file on somebody means.
    if (!message && !attached.length) return;
    setDraft('');
    setAttached([]);
    onSend([
      message,
      ...attachmentLines(attached, {
        file: i18nService.t('inputFileLabel'),
        folder: i18nService.t('inputFolderLabel'),
      }),
    ].filter(Boolean).join('\n'));
  };

  const onKeyDown = (event: KeyboardEvent<HTMLInputElement>): void => {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      send();
    }
  };

  const attach = async (): Promise<void> => {
    setPlusOpen(false);
    const picked = await window.electron?.dialog?.selectFiles?.({ title: 'Attach files' });
    if (!picked?.success || !picked.paths?.length) return;
    setAttached(current => [...current, ...picked.paths.filter(path => !current.includes(path))]);
  };

  const menuRow = (icon: JSX.Element, label: string, onClick: () => void): JSX.Element => (
    <button
      type="button"
      onClick={onClick}
      style={{
        display: 'flex', alignItems: 'center', gap: 11, height: 36, padding: '0 10px',
        border: 'none', background: 'transparent', borderRadius: radius.input,
        cursor: 'pointer', font: 'inherit', color: color.muted, width: '100%',
      }}
    >
      {icon}
      <span style={{ fontSize: text.body, color: color.ink }}>{label}</span>
    </button>
  );

  return (
    // Above the voice overlay's fade (canvas: z-index 7 over its 6), or
    // the pill vanishes under white the moment the mode changes.
    <div style={{ position: 'relative', zIndex: 7, padding: '12px 21px 19px' }}>
      {/* What is going with the next message. Above the pill, so the pill
          keeps the shape the canvas gives it however many files there are. */}
      {attached.length > 0 && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 7, padding: '0 6px 10px' }}>
          {attached.map(path => (
            <span
              key={path}
              title={path}
              style={{
                display: 'flex', alignItems: 'center', gap: 7, height: 30,
                padding: '0 6px 0 12px', borderRadius: radius.pill,
                background: color.fill, border: `1px solid ${line.hairline}`,
                fontSize: text.label, color: color.ink, maxWidth: 280,
              }}
            >
              <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {basenameOf(path)}
              </span>
              <button
                type="button"
                onClick={() => setAttached(current => current.filter(one => one !== path))}
                aria-label={`Remove ${basenameOf(path)}`}
                style={{
                  width: 18, height: 18, border: 'none', background: 'transparent',
                  cursor: 'pointer', color: color.muted, padding: 0,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                }}
              >
                <CloseIcon size={10} />
              </button>
            </span>
          ))}
        </div>
      )}

      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          // The canvas's pill: 44 high, the fill, no line round it.
          gap: 11,
          minHeight: 44,
          padding: '5px 7px 5px 6px',
          borderRadius: radius.pill,
          background: color.fill,
          border: 'none',
        }}
      >
        <div ref={plusRef} style={{ position: 'relative', flex: '0 0 auto' }}>
          {plusOpen && (
            <div
              role="menu"
              style={{
                position: 'absolute', left: 0, bottom: 52, width: 216, zIndex: 40,
                padding: 6, borderRadius: radius.menu,
                background: color.paper, border: `1px solid ${line.field}`,
                boxShadow: shadow.popover,
                display: 'flex', flexDirection: 'column', gap: 4,
                animation: `fsr-message-in ${motion.messageIn.duration} ${motion.messageIn.easing} both`,
              }}
            >
              {menuRow(<AttachIcon size={15.5} />, 'Attach files', () => { void attach(); })}
              {onTeach && menuRow(
                // The canvas draws this one as a record dot rather than an
                // icon: a 17px ring in `danger` around a 7px filled centre.
                <span
                  style={{
                    width: 17, height: 17, flex: '0 0 auto', borderRadius: '50%',
                    border: `2px solid ${color.danger}`,
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                  }}
                >
                  <span style={{ width: 7, height: 7, borderRadius: '50%', background: color.danger }} />
                </span>,
                'Teach a task',
                () => { setPlusOpen(false); onTeach(); },
              )}
            </div>
          )}
          <button
            type="button"
            onClick={() => setPlusOpen(open => !open)}
            aria-label="More"
            aria-expanded={plusOpen}
            style={{
              // Canvas line 815: a 34px disc of 5% black with the flat shadow.
              width: 34, height: 34, borderRadius: '50%',
              border: 'none', background: 'rgba(0,0,0,.05)',
              color: color.ink, fontSize: 18, lineHeight: 1, cursor: 'pointer',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              boxShadow: shadow.flat,
            }}
          >
            +
          </button>
        </div>

        <input
          ref={inputRef}
          value={draft}
          onChange={event => setDraft(event.target.value)}
          onKeyDown={onKeyDown}
          placeholder={dictation?.note && !has ? dictation.note : placeholder}
          disabled={disabled}
          style={{
            flex: '1 1 auto', minWidth: 0, border: 'none', outline: 'none',
            background: 'transparent', font: 'inherit',
            fontSize: text.message, color: color.ink,
          }}
        />

        {/*
          One control, three jobs: listening, it stops; with text, it sends;
          empty, it starts listening. While listening it is the record red
          from the canvas's Teach row, so a live microphone is never mistaken
          for an idle one.
        */}
        <button
          type="button"
          onClick={listening ? dictation?.toggle : (has ? send : (dictation?.toggle ?? send))}
          disabled={disabled}
          aria-label={listening ? 'Stop' : (has ? 'Send' : 'Speak')}
          aria-pressed={listening}
          style={{
            width: 34, height: 34, flex: '0 0 auto', borderRadius: '50%',
            border: 'none', background: listening ? color.danger : color.accent,
            cursor: disabled ? 'default' : 'pointer',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            opacity: disabled ? 0.5 : 1, color: color.paper,
            transition: `background ${motion.messageIn.duration} ${motion.messageIn.easing}`,
          }}
        >
          {listening ? <MicIcon size={15} /> : (has ? <SendIcon size={15.5} /> : <MicIcon size={15} />)}
        </button>
      </div>
    </div>
  );
}
