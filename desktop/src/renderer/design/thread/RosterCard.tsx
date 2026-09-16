import { type CSSProperties, useState } from 'react';

import type { RosterOption } from '../../../shared/staffing/roster';
import { color, line, motion, radius, shadow, text, tracking } from '../tokens';
import { addThird, canStandUp, justTwo, spareAlternates, swapRow } from './rosterCards';
import type { RosterItem } from './types';

/**
 * "Your starter team": the roster card of step two.
 *
 * The founder's page, 16 September, §5 beat B, to the word: one
 * multi-select card proposing exactly two or three of the twenty-three,
 * each with a short name, a one-line job and a one-line anti-job; Swap
 * one, with three or four alternates for that lane; Something else, one
 * free-text line; Just two / Add a third; and the primary Stand them up.
 *
 * Drawn like the question card (the same fill, the same paper list),
 * because it is the same kind of thing: a decision put to the person in
 * the thread. It holds its own working state until it is answered, and
 * answers once.
 */

export interface RosterHandlers {
  /** Stand them up: the rows checked at that moment, by slug. */
  onStandUp: (itemId: string, slugs: readonly string[]) => void;
  /** Something else: the line they typed. */
  onSomethingElse: (itemId: string, text: string) => void;
  /** Not now. */
  onDecline: (itemId: string) => void;
}

const enter = `fsr-message-in ${motion.messageIn.longer} ${motion.messageIn.easing} both`;

const pill = (primary: boolean, enabled = true): CSSProperties => ({
  height: 36, padding: primary ? '0 17px' : '0 14px', borderRadius: radius.pill,
  border: primary ? 'none' : `1px solid ${line.field}`,
  background: primary ? (enabled ? color.ink : color.fill) : color.fill,
  color: primary ? (enabled ? color.paper : color.faint) : color.ink,
  font: 'inherit', fontSize: text.body, fontWeight: 400,
  cursor: enabled ? 'pointer' : 'default',
});

const quiet: CSSProperties = {
  height: 30, padding: '0 10px', border: 'none', background: 'transparent',
  font: 'inherit', fontSize: text.small, color: color.muted, cursor: 'pointer',
  borderRadius: radius.chip, whiteSpace: 'nowrap', flex: '0 0 auto',
};

function Check({ on }: { on: boolean }): JSX.Element {
  return (
    <span
      aria-hidden
      style={{
        width: 21, height: 21, flex: '0 0 auto', marginTop: 1, borderRadius: radius.key,
        background: on ? color.ink : color.fill,
        border: `1px solid ${on ? color.ink : line.field}`,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        transition: `background ${motion.hover.duration} ${motion.hover.easing}`,
      }}
    >
      {on && (
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke={color.paper} strokeWidth={2.6} strokeLinecap="round" strokeLinejoin="round" focusable="false">
          <path d="M5 12.5l4.5 4.5L19 7.5" />
        </svg>
      )}
    </span>
  );
}

function Row(
  { option, checked, onToggle, onSwap, swapping, spares, onPick }: {
    option: RosterOption;
    checked: boolean;
    onToggle: () => void;
    onSwap: () => void;
    swapping: boolean;
    spares: readonly RosterOption[];
    onPick: (replacement: RosterOption) => void;
  },
): JSX.Element {
  return (
    <div style={{ display: 'flex', flexDirection: 'column' }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12, padding: '13px 12px 13px 15px' }}>
        <button
          type="button"
          role="checkbox"
          aria-checked={checked}
          aria-label={option.name}
          onClick={onToggle}
          style={{ display: 'flex', alignItems: 'flex-start', gap: 12, flex: '1 1 auto', minWidth: 0, padding: 0, border: 'none', background: 'transparent', font: 'inherit', textAlign: 'left', cursor: 'pointer' }}
        >
          <Check on={checked} />
          <span style={{ flex: '1 1 auto', minWidth: 0, display: 'flex', flexDirection: 'column', gap: 3 }}>
            <span style={{ fontSize: text.emphasis, color: color.ink, lineHeight: 1.3 }}>
              {option.name}
              <span style={{ color: color.muted }}> · {option.label}</span>
            </span>
            <span style={{ fontSize: text.small, color: color.ink, lineHeight: 1.4, textWrap: 'pretty' }}>{option.job}</span>
            <span style={{ fontSize: text.small, color: color.muted, lineHeight: 1.4 }}>{option.antiJob}</span>
          </span>
        </button>
        {spares.length > 0 && (
          <button type="button" onClick={onSwap} aria-expanded={swapping} style={quiet}>
            {swapping ? 'Keep' : 'Swap one'}
          </button>
        )}
      </div>
      {swapping && (
        <div style={{ display: 'flex', flexDirection: 'column', padding: '0 12px 12px 48px', gap: 6 }}>
          {spares.map(one => (
            <button
              key={one.slug}
              type="button"
              onClick={() => onPick(one)}
              style={{
                display: 'flex', flexDirection: 'column', gap: 2, padding: '9px 12px', textAlign: 'left',
                borderRadius: radius.small, border: `1px solid ${line.hairline}`, background: color.fillRaised,
                font: 'inherit', cursor: 'pointer',
              }}
            >
              <span style={{ fontSize: text.body, color: color.ink }}>
                {one.name}
                <span style={{ color: color.muted }}> · {one.label}</span>
              </span>
              <span style={{ fontSize: text.caption, color: color.muted, lineHeight: 1.35 }}>{one.job}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

export function RosterCard({ item, handlers }: { item: RosterItem; handlers: RosterHandlers }): JSX.Element {
  const [rows, setRows] = useState<readonly RosterOption[]>(item.team);
  const [checked, setChecked] = useState<ReadonlySet<string>>(() => new Set(item.team.map(one => one.slug)));
  const [swapping, setSwapping] = useState<string | null>(null);
  const [otherOpen, setOtherOpen] = useState(false);
  const [other, setOther] = useState('');

  const spares = spareAlternates(rows, item.alternates);
  const ready = canStandUp(checked);
  const otherReady = other.trim().length > 0;

  const toggle = (slug: string): void => {
    setChecked(current => {
      const next = new Set(current);
      if (next.has(slug)) next.delete(slug);
      else next.add(slug);
      return next;
    });
  };

  const pick = (slug: string, replacement: RosterOption): void => {
    setRows(current => swapRow(current, slug, replacement));
    setChecked(current => {
      const next = new Set(current);
      const was = next.has(slug);
      next.delete(slug);
      if (was) next.add(replacement.slug);
      return next;
    });
    setSwapping(null);
  };

  const trim = (): void => {
    const next = justTwo(rows, checked);
    setRows(next);
    setChecked(current => new Set([...current].filter(slug => next.some(one => one.slug === slug))));
    setSwapping(null);
  };

  const grow = (): void => {
    const next = addThird(rows, item.alternates);
    const added = next.find(one => !rows.some(row => row.slug === one.slug));
    setRows(next);
    if (added) setChecked(current => new Set([...current, added.slug]));
    setSwapping(null);
  };

  return (
    <div
      style={{
        maxWidth: 'min(72%, 560px)', padding: 15, borderRadius: radius.panel,
        background: color.fill, border: `1px solid ${line.hairline}`,
        display: 'flex', flexDirection: 'column', gap: 12, marginTop: 6, animation: enter,
      }}
    >
      <div style={{ padding: '0 2px', display: 'flex', flexDirection: 'column', gap: 4 }}>
        <div style={{ fontSize: text.emphasis, fontWeight: 500, lineHeight: 1.35, letterSpacing: tracking.body }}>
          Your starter team
        </div>
        <div style={{ fontSize: text.body, color: color.muted, lineHeight: 1.4 }}>
          Picked for {item.workType}. Two or three; swap any of them.
        </div>
      </div>

      <div
        style={{
          display: 'flex', flexDirection: 'column', borderRadius: radius.row, background: color.paper,
          border: `1px solid ${line.hairline}`, overflow: 'hidden', boxShadow: shadow.flat,
        }}
      >
        {rows.map((option, i) => (
          <div key={option.slug} style={i === 0 ? {} : { borderTop: `1px solid ${line.hairline}` }}>
            <Row
              option={option}
              checked={checked.has(option.slug)}
              onToggle={() => toggle(option.slug)}
              onSwap={() => setSwapping(current => (current === option.slug ? null : option.slug))}
              swapping={swapping === option.slug}
              spares={spares}
              onPick={replacement => pick(option.slug, replacement)}
            />
          </div>
        ))}
      </div>

      <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 8 }}>
        {rows.length > 2 && (
          <button type="button" onClick={trim} style={pill(false)}>Just two</button>
        )}
        {rows.length < 3 && spares.length > 0 && (
          <button type="button" onClick={grow} style={pill(false)}>Add a third</button>
        )}
        {!otherOpen && (
          <button
            type="button"
            onClick={() => setOtherOpen(true)}
            style={{ ...pill(false), background: 'transparent', border: `1px dashed ${line.button}`, color: color.muted }}
          >
            Something else
          </button>
        )}
      </div>

      {otherOpen && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <input
            value={other}
            onChange={event => setOther(event.target.value)}
            onKeyDown={event => {
              if (event.key === 'Enter' && otherReady) handlers.onSomethingElse(item.id, other.trim());
              if (event.key === 'Escape') { setOtherOpen(false); setOther(''); }
            }}
            placeholder="What would you rather have on the team?"
            aria-label="Something else"
            autoFocus
            style={{
              flex: '1 1 auto', minWidth: 0, height: 38, padding: '0 12px', borderRadius: radius.small,
              border: `1px solid ${line.field}`, background: color.paper, outline: 'none',
              font: 'inherit', fontSize: text.body, color: color.ink,
            }}
          />
          <button
            type="button"
            disabled={!otherReady}
            onClick={() => handlers.onSomethingElse(item.id, other.trim())}
            style={pill(true, otherReady)}
          >
            Tell him
          </button>
          <button type="button" onClick={() => { setOtherOpen(false); setOther(''); }} style={quiet}>Back</button>
        </div>
      )}

      <div style={{ display: 'flex', gap: 9 }}>
        <button
          type="button"
          disabled={!ready}
          onClick={() => handlers.onStandUp(item.id, rows.filter(one => checked.has(one.slug)).map(one => one.slug))}
          style={pill(true, ready)}
        >
          Stand them up
        </button>
        <button type="button" onClick={() => handlers.onDecline(item.id)} style={pill(false)}>Not now</button>
      </div>
    </div>
  );
}
