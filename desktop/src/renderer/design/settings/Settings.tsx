import { type CSSProperties, useEffect, useRef, useState } from 'react';

import { CloseIcon, ComputerIcon, GearIcon, UsageIcon } from '../icons';
import { color, glass, line, motion, radius, shadow, text, tracking } from '../tokens';
import {
  type SelectOption,
  SETTINGS_TABS,
  settingsFor,
  type SettingsGroup,
  type SettingsInput,
  type SettingsRow,
  SettingsRowKind,
  SettingsTab,
} from './rows';

/**
 * Settings.
 *
 * A 236px rail of four tabs and a column of grouped rows, which is the
 * canvas's shape down to the numbers. It replaces NetEase's thirteen
 * tabs, which is what the account menu opened until now — providers, API
 * keys, skins, IM platforms, a growth tour, all of it in Chinese first.
 *
 * Rows come in five kinds and no sixth, the same discipline the thread
 * has. Which rows exist is decided in `rows.ts` and tested there; this
 * draws them.
 */

export interface SettingsProps extends SettingsInput {
  onClose: () => void;
}

const ICONS: Record<SettingsTab, (size: number) => JSX.Element> = {
  [SettingsTab.General]: size => <GearIcon size={size} />,
  [SettingsTab.Computer]: size => <ComputerIcon size={size} />,
  [SettingsTab.Usage]: size => <UsageIcon size={size} />,
  // The canvas's download arrow into a tray, which is the shape the
  // share button uses the other way up.
  [SettingsTab.Updates]: size => (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.7} strokeLinecap="round" strokeLinejoin="round" aria-hidden focusable="false">
      <path d="M12 4v10" />
      <path d="M8 10l4 4 4-4" />
      <path d="M4 17v2a2 2 0 002 2h12a2 2 0 002-2v-2" />
    </svg>
  ),
};

export function Settings(props: SettingsProps): JSX.Element {
  const { onClose, ...input } = props;
  const [tab, setTab] = useState<SettingsTab>(SettingsTab.General);
  const groups = settingsFor(tab, input);

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
        position: 'absolute', inset: 0, zIndex: 80, display: 'flex',
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
          margin: 'auto', width: 'calc(100% - 48px)', maxWidth: 1080,
          height: 'calc(100% - 48px)', boxSizing: 'border-box',
          display: 'grid', gridTemplateColumns: '236px minmax(0,1fr)',
          borderRadius: radius.modal, overflow: 'hidden',
          background: glass.background, backdropFilter: glass.blur,
          border: `1px solid ${glass.border}`,
          boxShadow: `${shadow.modal}, ${shadow.glassInset}`,
        }}
      >
        <div
          style={{
            display: 'flex', flexDirection: 'column', gap: 2, padding: '20px 12px',
            borderRight: `1px solid ${line.hairline}`, background: 'rgba(249,250,252,.86)',
          }}
        >
          {SETTINGS_TABS.map(one => {
            const on = one === tab;
            return (
              <button
                key={one}
                type="button"
                onClick={() => setTab(one)}
                aria-pressed={on}
                style={{
                  display: 'flex', alignItems: 'center', gap: 11, height: 44,
                  padding: '0 12px', borderRadius: radius.input, cursor: 'pointer',
                  font: 'inherit', fontSize: text.body, color: color.ink,
                  background: on ? color.fillStrong : 'transparent',
                  border: on ? `1px solid ${line.hairline}` : '1px solid transparent',
                  fontWeight: on ? 500 : 400,
                }}
              >
                <span
                  style={{
                    width: 18, height: 18, flex: '0 0 auto',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    color: on ? color.ink : color.muted,
                  }}
                >
                  {ICONS[one](16)}
                </span>
                <span style={{ flex: '1 1 auto', textAlign: 'left' }}>{one}</span>
              </button>
            );
          })}
        </div>

        <div style={{ position: 'relative', minWidth: 0, minHeight: 0, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
          <div style={{ flex: '0 0 auto', display: 'flex', alignItems: 'center', gap: 12, padding: '24px 28px 14px' }}>
            <div style={{ flex: '1 1 auto', fontSize: text.screenTitle, fontWeight: 500, letterSpacing: tracking.screenTitle, color: color.ink }}>
              {tab}
            </div>
            <button
              type="button"
              onClick={onClose}
              aria-label="Close"
              style={{
                width: 32, height: 32, flex: '0 0 auto', border: 'none',
                background: 'transparent', borderRadius: '50%', cursor: 'pointer',
                color: color.muted,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
              }}
            >
              <CloseIcon size={14} />
            </button>
          </div>

          <div
            style={{
              flex: '1 1 auto', minHeight: 0, overflowY: 'auto',
              padding: '6px 28px 32px', display: 'flex', flexDirection: 'column', gap: 26,
            }}
          >
            {groups.map(group => <Group key={group.title} group={group} />)}
          </div>
        </div>
      </div>
    </div>
  );
}

function Group({ group }: { group: SettingsGroup }): JSX.Element {
  return (
    <div style={{ flex: '0 0 auto', display: 'flex', flexDirection: 'column', gap: 10 }}>
      <div style={{ fontSize: text.caption, color: color.muted, paddingLeft: 4 }}>{group.title}</div>
      <div
        style={{
          borderRadius: radius.card, background: color.fillRaised,
          border: `1px solid ${line.hairline}`, overflow: 'hidden',
          display: 'flex', flexDirection: 'column',
        }}
      >
        {group.rows.map((row, index) => (
          <Row key={row.id} row={row} first={index === 0} />
        ))}
      </div>
    </div>
  );
}

const rowStyle = (first: boolean, stacked: boolean): CSSProperties => ({
  display: 'flex',
  alignItems: stacked ? 'stretch' : 'center',
  flexDirection: stacked ? 'column' : 'row',
  gap: stacked ? 12 : 20,
  padding: '18px 20px',
  ...(first ? {} : { borderTop: `1px solid ${line.hairline}` }),
});

function Row({ row, first }: { row: SettingsRow; first: boolean }): JSX.Element {
  const stacked = row.kind === SettingsRowKind.Meter;
  return (
    <div style={rowStyle(first, stacked)}>
      <div style={{ flex: '1 1 auto', minWidth: 0, display: 'flex', flexDirection: 'column', gap: 4 }}>
        <div style={{ fontSize: text.emphasis, fontWeight: 400, color: color.ink, lineHeight: 1.3 }}>
          {row.label}
        </div>
        {row.kind !== SettingsRowKind.Meter && row.desc && (
          <div style={{ fontSize: text.small, color: color.muted, lineHeight: 1.45, textWrap: 'pretty' }}>
            {row.desc}
          </div>
        )}
      </div>
      <Control row={row} />
    </div>
  );
}

function Control({ row }: { row: SettingsRow }): JSX.Element | null {
  switch (row.kind) {
    case SettingsRowKind.Select:
      return <Select value={row.value} options={row.options} onPick={row.onPick} label={row.label} />;
    case SettingsRowKind.Toggle:
      return <Toggle on={row.on} onToggle={row.onToggle} label={row.label} />;
    case SettingsRowKind.Button:
      return (
        <button
          type="button"
          onClick={row.onPress}
          disabled={row.busy}
          style={{
            flex: '0 0 auto', height: 38, padding: '0 18px', borderRadius: radius.field,
            cursor: row.busy ? 'default' : 'pointer', font: 'inherit', fontSize: text.body,
            fontWeight: row.tone ? 500 : 400, whiteSpace: 'nowrap',
            opacity: row.busy ? 0.6 : 1,
            ...(row.tone === 'primary'
              ? { background: color.ink, color: color.paper, border: 'none' }
              : row.tone === 'danger'
                ? { background: color.danger, color: color.paper, border: 'none' }
                : { background: color.fill, color: color.ink, border: `1px solid ${line.field}` }),
          }}
        >
          {row.action}
        </button>
      );
    case SettingsRowKind.Field:
      return <Field row={row} />;
    case SettingsRowKind.Meter:
      return (
        <span style={{ flex: '1 1 auto', display: 'flex', flexDirection: 'column', gap: 9, minWidth: 0 }}>
          <span style={{ height: 7, borderRadius: radius.pill, background: '#d7dde6', overflow: 'hidden', display: 'flex' }}>
            <span
              style={{
                width: `${Math.round(Math.min(1, Math.max(0, row.fraction)) * 100)}%`,
                background: color.accent, borderRadius: radius.pill, display: 'block',
              }}
            />
          </span>
          <span style={{ display: 'flex', alignItems: 'baseline', gap: 10 }}>
            <span style={{ flex: '1 1 auto', fontSize: text.small, color: color.muted }}>{row.desc}</span>
            <span style={{ fontSize: text.small, color: color.muted }}>{row.value}</span>
          </span>
        </span>
      );
    default:
      // Five kinds and no sixth. A new one is a decision, made here.
      return null;
  }
}

function Field({ row }: { row: Extract<SettingsRow, { kind: 'field' }> }): JSX.Element {
  const [draft, setDraft] = useState(row.value);
  const dirty = draft !== row.value;

  if (row.readOnly) {
    return (
      <span
        style={{
          flex: '0 0 auto', maxWidth: 260, height: 36, display: 'flex', alignItems: 'center',
          padding: '0 12px', borderRadius: radius.small, background: color.paper,
          border: `1px solid ${line.field}`, fontSize: text.body, color: color.muted,
          whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
        }}
        title={row.value}
      >
        {row.value}
      </span>
    );
  }

  return (
    <span style={{ display: 'flex', alignItems: 'center', gap: 8, flex: '0 0 auto' }}>
      <input
        value={draft}
        onChange={event => setDraft(event.target.value)}
        aria-label={row.label}
        style={{
          width: 220, height: 36, padding: '0 12px', borderRadius: radius.small,
          border: `1px solid ${line.field}`, background: color.paper, outline: 'none',
          font: 'inherit', fontSize: text.body, color: color.ink,
        }}
      />
      <button
        type="button"
        onClick={() => row.onSave?.(draft)}
        disabled={!dirty}
        style={{
          height: 36, padding: '0 14px', borderRadius: radius.small,
          border: `1px solid ${line.field}`, background: color.fill,
          color: dirty ? color.ink : color.faint, font: 'inherit', fontSize: text.body,
          cursor: dirty ? 'pointer' : 'default',
        }}
      >
        Save
      </button>
    </span>
  );
}

function Toggle(
  { on, onToggle, label }: { on: boolean; onToggle: () => void; label: string },
): JSX.Element {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      aria-label={label}
      onClick={onToggle}
      style={{
        width: 48, height: 28, flex: '0 0 auto', border: 'none', borderRadius: radius.pill,
        cursor: 'pointer', display: 'flex', alignItems: 'center',
        justifyContent: on ? 'flex-end' : 'flex-start', padding: '0 3px',
        transition: 'background .18s',
        background: on ? color.ink : '#c4ccd8',
      }}
    >
      <span
        style={{
          width: 22, height: 22, borderRadius: '50%', background: color.paper,
          boxShadow: '0 1px 3px rgba(16,22,35,.25)', display: 'block',
        }}
      />
    </button>
  );
}

/**
 * The canvas draws a select as a value and a chevron and never opens it.
 * A real one has to open, so this is the app's popover — the same glass,
 * the same radius, the same Escape-and-click-outside as the account menu.
 */
function Select(
  { value, options, onPick, label }: {
    value: string;
    options: readonly SelectOption[];
    onPick: (value: string) => void;
    label: string;
  },
): JSX.Element {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLSpanElement>(null);
  const current = options.find(one => one.value === value);

  useEffect(() => {
    if (!open) return undefined;
    const onKey = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') { event.stopPropagation(); setOpen(false); }
    };
    const onDown = (event: MouseEvent): void => {
      if (!ref.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener('keydown', onKey, true);
    const timer = window.setTimeout(() => document.addEventListener('mousedown', onDown), 0);
    return () => {
      document.removeEventListener('keydown', onKey, true);
      document.removeEventListener('mousedown', onDown);
      window.clearTimeout(timer);
    };
  }, [open]);

  return (
    <span ref={ref} style={{ position: 'relative', flex: '0 0 auto', display: 'flex' }}>
      {open && (
        <div
          role="menu"
          style={{
            position: 'absolute', right: 0, top: 42, zIndex: 90, width: 320, padding: 8,
            borderRadius: radius.menu, background: glass.background, backdropFilter: glass.blur,
            border: `1px solid ${glass.border}`,
            boxShadow: `${shadow.popover}, ${shadow.glassInset}`,
            display: 'flex', flexDirection: 'column', gap: 1,
            animation: `fsr-message-in ${motion.messageIn.duration} ${motion.messageIn.easing} both`,
          }}
        >
          {options.map(option => (
            <button
              key={option.value}
              type="button"
              onClick={() => { setOpen(false); onPick(option.value); }}
              aria-current={option.value === value}
              style={{
                display: 'flex', flexDirection: 'column', gap: 3, alignItems: 'flex-start',
                textAlign: 'left', padding: '11px 12px', borderRadius: radius.input,
                border: 'none', cursor: 'pointer', font: 'inherit', width: '100%',
                background: option.value === value ? color.fillStrong : 'transparent',
              }}
            >
              <span style={{ fontSize: text.body, color: color.ink }}>{option.label}</span>
              {option.hint && (
                <span style={{ fontSize: text.caption, color: color.muted, lineHeight: 1.4 }}>
                  {option.hint}
                </span>
              )}
            </button>
          ))}
        </div>
      )}
      <button
        type="button"
        onClick={() => setOpen(current => !current)}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={label}
        style={{
          display: 'flex', alignItems: 'center', gap: 8, height: 36,
          padding: '0 12px 0 14px', borderRadius: radius.small,
          border: `1px solid ${line.field}`, background: color.paper, cursor: 'pointer',
          font: 'inherit', fontSize: text.body, color: color.ink, whiteSpace: 'nowrap',
        }}
      >
        <span>{current?.label ?? value}</span>
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke={color.faint} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden focusable="false">
          <path d="M5 9l7 7 7-7" />
        </svg>
      </button>
    </span>
  );
}
