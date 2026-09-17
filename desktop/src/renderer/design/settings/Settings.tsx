import { type CSSProperties, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

import {
  type SelectOption,
  SETTINGS_TABS,
  settingsFor,
  type SettingsGroup,
  type SettingsInput,
  type SettingsRow,
  SettingsRowKind,
  SettingsTab,
} from '../../../shared/settings/rows';
import { CloseIcon, ComputerIcon, GearIcon, UsageIcon } from '../icons';
import {
  CONFIRM_WINDOW_MS,
  confirmLabel,
  ConfirmState,
  pressConfirm,
} from '../shell/confirm';
import { color, font, line, motion, radius, shadow, text, tracking } from '../tokens';

/**
 * Settings.
 *
 * A 236px rail of four tabs and a column of grouped rows, which is the
 * canvas's shape down to the numbers. It replaces upstream's thirteen
 * tabs, which is what the account menu opened until now — providers, API
 * keys, skins, IM platforms, a growth tour, all of it in Chinese first.
 *
 * Since the 17 September canvas it is not a sheet over a scrim but the
 * pane itself: a white overlay filling its container, the rail in the
 * window's grey, the groups in the same grey with no border. No glass —
 * in this canvas glass is the dock and the voice orb and nothing else.
 *
 * Rows come in five kinds and no sixth, the same discipline the thread
 * has. Which rows exist is decided in `rows.ts` and tested there; this
 * draws them.
 */

export interface SettingsProps extends SettingsInput {
  onClose: () => void;
  /** The tab to open on, when a link in the thread named a row. */
  initialTab?: SettingsTab;
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

/** The pointer over a control, for the canvas's `style-hover` states. */
function useHover(): [boolean, { onMouseEnter: () => void; onMouseLeave: () => void }] {
  const [over, setOver] = useState(false);
  return [over, { onMouseEnter: () => setOver(true), onMouseLeave: () => setOver(false) }];
}

/** The 26px round X the canvas puts on a screen's title row. */
function CloseButton({ onClose }: { onClose: () => void }): JSX.Element {
  const [over, hover] = useHover();
  return (
    <button
      type="button"
      onClick={onClose}
      aria-label="Close"
      {...hover}
      style={{
        width: 26, height: 26, flex: '0 0 auto', border: 'none',
        background: over ? color.fill : 'transparent', borderRadius: '50%', cursor: 'pointer',
        color: over ? color.ink : color.muted,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}
    >
      <CloseIcon size={13} />
    </button>
  );
}

export function Settings(props: SettingsProps): JSX.Element {
  const { onClose, initialTab, ...input } = props;
  const [tab, setTab] = useState<SettingsTab>(initialTab ?? SettingsTab.General);
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
        background: color.paper,
        // The canvas: `animation:msgIn .18s ease-out both` (template.html:343).
        animation: `fsr-message-in .18s ${motion.messageIn.easing} both`,
      }}
    >
      <div
        style={{
          width: '100%', height: '100%', boxSizing: 'border-box',
          display: 'grid', gridTemplateColumns: '236px minmax(0,1fr)',
          overflow: 'hidden', background: color.paper,
        }}
      >
        <div
          style={{
            display: 'flex', flexDirection: 'column', gap: 4, padding: '17px 11px',
            borderRight: `1px solid ${line.hairline}`, background: color.window,
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
                  display: 'flex', alignItems: 'center', gap: 10, height: 36,
                  padding: '0 11px', border: 'none', borderRadius: radius.field, cursor: 'pointer',
                  font: 'inherit', fontSize: text.body, whiteSpace: 'nowrap',
                  // The canvas: `transition:background .14s` (template.html:2127).
                  transition: 'background .14s',
                  background: on ? color.divider : 'transparent',
                  color: on ? color.ink : color.muted,
                  fontWeight: on ? 500 : 400,
                }}
              >
                <span
                  style={{
                    width: 18, height: 18, flex: '0 0 auto',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    color: 'currentColor',
                  }}
                >
                  {ICONS[one](15)}
                </span>
                <span style={{ flex: '1 1 auto', textAlign: 'left' }}>{one}</span>
              </button>
            );
          })}
        </div>

        <div style={{ position: 'relative', minWidth: 0, minHeight: 0, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
          <div style={{ flex: '0 0 auto', display: 'flex', alignItems: 'center', gap: 11, padding: '21px 24px 12px' }}>
            <div style={{ flex: '1 1 auto', fontSize: text.screenTitle, fontWeight: 500, letterSpacing: tracking.screenTitle, color: color.ink }}>
              {tab}
            </div>
            <CloseButton onClose={onClose} />
          </div>

          <div
            style={{
              flex: '1 1 auto', minHeight: 0, overflowY: 'auto', overflowX: 'hidden',
              padding: '5px 24px 28px', display: 'flex', flexDirection: 'column', gap: 23,
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
    <div style={{ flex: '0 0 auto', display: 'flex', flexDirection: 'column', gap: 9 }}>
      <div style={{ fontSize: text.caption, color: color.muted, paddingLeft: 3 }}>{group.title}</div>
      <div
        style={{
          borderRadius: radius.card, background: color.window,
          border: 'none', overflow: 'hidden',
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
  gap: stacked ? 11 : 17,
  padding: '15px 17px',
  background: 'transparent',
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
      return <ActionButton row={row} />;
    case SettingsRowKind.Field:
      return <Field row={row} />;
    case SettingsRowKind.Meter:
      return (
        <span style={{ flex: '1 1 auto', display: 'flex', flexDirection: 'column', gap: 8, minWidth: 0 }}>
          <span style={{ height: 7, borderRadius: radius.pill, background: color.paper, overflow: 'hidden', display: 'flex' }}>
            <span
              style={{
                width: `${Math.round(Math.min(1, Math.max(0, row.fraction)) * 100)}%`,
                background: color.accent, borderRadius: radius.pill, display: 'block',
              }}
            />
          </span>
          <span style={{ display: 'flex', alignItems: 'baseline', gap: 9 }}>
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


/**
 * A row's button, and the second press a destructive one asks for.
 *
 * A dangerous control does not open a dialog. It changes what it says and
 * waits — `grok-bot-app-ui.md`'s "Click Again to Confirm", and the same
 * behaviour as deleting a conversation in the sidebar, so there is one
 * way this works in the app rather than two.
 *
 * Only `danger` rows ask. Making every button confirm would train people
 * to press twice without reading, which is exactly the habit that makes
 * the confirmation worthless on the one row that needed it.
 */
function ActionButton({ row }: { row: Extract<SettingsRow, { kind: 'button' }> }): JSX.Element {
  const [armedAt, setArmedAt] = useState<number | undefined>();
  const asking = armedAt !== undefined;

  useEffect(() => {
    if (!asking) return undefined;
    const timer = window.setTimeout(() => setArmedAt(undefined), CONFIRM_WINDOW_MS);
    return () => window.clearTimeout(timer);
  }, [asking, armedAt]);

  const press = (): void => {
    if (row.tone !== 'danger') {
      row.onPress();
      return;
    }
    const step = pressConfirm(
      asking ? ConfirmState.Armed : ConfirmState.Ready,
      armedAt,
      Date.now(),
    );
    if (step.act) {
      setArmedAt(undefined);
      row.onPress();
      return;
    }
    setArmedAt(Date.now());
  };

  return (
    <button
      type="button"
      onClick={press}
      disabled={row.busy}
      style={{
        flex: '0 0 auto', height: 32, padding: '0 15px', borderRadius: radius.pill,
        cursor: row.busy ? 'default' : 'pointer', font: 'inherit', fontSize: text.body,
        whiteSpace: 'nowrap',
        opacity: row.busy ? 0.6 : 1,
        ...(row.tone === 'primary'
          ? { background: color.accent, color: color.paper, border: 'none', fontWeight: 500 }
          : row.tone === 'danger'
            ? { background: color.danger, color: color.paper, border: 'none', fontWeight: 500 }
            : { background: color.fill, color: color.ink, border: `1px solid ${line.field}`, fontWeight: 400 }),
      }}
    >
      {row.tone === 'danger' ? confirmLabel(
        asking ? ConfirmState.Armed : ConfirmState.Ready,
        row.action,
      ) : row.action}
    </button>
  );
}

/**
 * The grey pill beside a field: the canvas's Save, and the Show/Hide a
 * secret field adds. Muted at rest, ink under the pointer.
 */
function FieldButton(
  { label, onClick, disabled, pressed }: {
    label: string;
    onClick: () => void;
    disabled?: boolean;
    pressed?: boolean;
  },
): JSX.Element {
  const [over, hover] = useHover();
  const live = !disabled;
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      {...(pressed === undefined ? {} : { 'aria-pressed': pressed })}
      {...hover}
      style={{
        height: 29, padding: '0 13px', borderRadius: radius.pill, border: 'none',
        background: over && live ? color.window : color.fill,
        color: over && live ? color.ink : color.muted,
        font: 'inherit', fontSize: text.body,
        cursor: live ? 'pointer' : 'default',
      }}
    >
      {label}
    </button>
  );
}

function Field({ row }: { row: Extract<SettingsRow, { kind: 'field' }> }): JSX.Element {
  const [draft, setDraft] = useState(row.value);
  const [shown, setShown] = useState(false);
  const dirty = draft !== row.value;

  // The row can keep its id and change its value underneath — the models
  // key field is one row whose provider changes above it. Without this the
  // field would still be showing the previous provider's key.
  useEffect(() => {
    setDraft(row.value);
    setShown(false);
  }, [row.value]);

  const box: CSSProperties = {
    width: 204, height: 29, padding: '0 10px', borderRadius: radius.small,
    border: `1px solid ${line.field}`, background: color.window,
    fontSize: text.body, boxSizing: 'border-box',
  };

  if (row.readOnly) {
    return (
      <span
        style={{
          ...box, flex: '0 0 auto', display: 'flex', alignItems: 'center',
          color: color.muted, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
        }}
        title={row.value}
      >
        {row.value}
      </span>
    );
  }

  return (
    <span style={{ display: 'flex', alignItems: 'center', gap: 6, flex: '0 0 auto' }}>
      <input
        value={draft}
        onChange={event => setDraft(event.target.value)}
        onKeyDown={event => { if (event.key === 'Enter' && dirty) row.onSave?.(draft); }}
        aria-label={row.label}
        type={row.secret && !shown ? 'password' : 'text'}
        {...(row.placeholder ? { placeholder: row.placeholder } : {})}
        autoComplete="off"
        spellCheck={false}
        style={{
          ...box, outline: 'none', font: 'inherit', fontSize: text.body, color: color.ink,
          ...(row.secret ? { fontFamily: font.mono, letterSpacing: '.02em' } : {}),
        }}
      />
      {row.secret && (
        <FieldButton label={shown ? 'Hide' : 'Show'} onClick={() => setShown(one => !one)} pressed={shown} />
      )}
      <FieldButton label="Save" onClick={() => row.onSave?.(draft)} disabled={!dirty} />
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

/** The open menu's width and its gap below the control. */
const SELECT_MENU_WIDTH = 320;
const SELECT_MENU_GAP = 6;

/**
 * The canvas draws a select as a value and a chevron and never opens it.
 * A real one has to open, so this is the app's popover — white, the
 * menu radius, the popover shadow, the same Escape-and-click-outside as
 * the account menu.
 *
 * The menu is rendered at the document's root, not inside the row. Every
 * group card clips its contents (`overflow: hidden`, which is what rounds
 * its corners) and the column scrolls, so a menu positioned inside the
 * row was cut off at the card's edge: the founder saw "every dropdown in
 * settings opens inside the box". A portal puts it above everything and
 * `position: fixed` places it under the control from the control's own
 * rectangle, measured when it opens.
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
  const [place, setPlace] = useState<{ top: number; right: number }>();
  const [over, hover] = useHover();
  const ref = useRef<HTMLSpanElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const current = options.find(one => one.value === value);

  // Measure on open, and again when the window changes size under it.
  useLayoutEffect(() => {
    if (!open) { setPlace(undefined); return undefined; }
    const measure = (): void => {
      const box = ref.current?.getBoundingClientRect();
      if (!box) return;
      setPlace({
        top: box.bottom + SELECT_MENU_GAP,
        right: Math.max(8, window.innerWidth - box.right),
      });
    };
    measure();
    window.addEventListener('resize', measure);
    return () => window.removeEventListener('resize', measure);
  }, [open]);

  useEffect(() => {
    if (!open) return undefined;
    const onKey = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') { event.stopPropagation(); setOpen(false); }
    };
    const onDown = (event: MouseEvent): void => {
      const target = event.target as Node;
      if (!ref.current?.contains(target) && !menuRef.current?.contains(target)) setOpen(false);
    };
    document.addEventListener('keydown', onKey, true);
    const timer = window.setTimeout(() => document.addEventListener('mousedown', onDown), 0);
    return () => {
      document.removeEventListener('keydown', onKey, true);
      document.removeEventListener('mousedown', onDown);
      window.clearTimeout(timer);
    };
  }, [open]);

  const menu = open && place ? createPortal(
    <div
      ref={menuRef}
      role="menu"
      style={{
        position: 'fixed', top: place.top, right: place.right, zIndex: 120,
        width: SELECT_MENU_WIDTH, padding: 6, boxSizing: 'border-box',
        // A list taller than what is left below the control scrolls
        // inside itself rather than running off the bottom of the window.
        maxHeight: `calc(100vh - ${place.top + 12}px)`, overflowY: 'auto',
        borderRadius: radius.menu, background: color.paper,
        border: `1px solid ${line.field}`,
        boxShadow: shadow.popover,
        display: 'flex', flexDirection: 'column', gap: 2,
        animation: `fsr-message-in ${motion.messageIn.duration} ${motion.messageIn.easing} both`,
      }}
    >
      {options.map(option => (
        <MenuRow
          key={option.value}
          option={option}
          current={option.value === value}
          onPick={() => { setOpen(false); onPick(option.value); }}
        />
      ))}
    </div>,
    document.body,
  ) : null;

  return (
    <span ref={ref} style={{ position: 'relative', flex: '0 0 auto', display: 'flex' }}>
      {menu}
      <button
        type="button"
        onClick={() => setOpen(current => !current)}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={label}
        {...hover}
        style={{
          display: 'flex', alignItems: 'center', gap: 6, height: 29,
          padding: '0 11px 0 14px', borderRadius: radius.pill,
          border: 'none', background: over ? color.window : color.fill, cursor: 'pointer',
          font: 'inherit', fontSize: text.body, color: color.ink, whiteSpace: 'nowrap',
        }}
      >
        <span>{current?.label ?? value}</span>
        <svg width="11.5" height="11.5" viewBox="0 0 24 24" fill="none" stroke={color.chevron} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden focusable="false">
          <path d="M5 9l7 7 7-7" />
        </svg>
      </button>
    </span>
  );
}

/** A row of the select's menu: 36px, the input radius, the fill under the pointer. */
function MenuRow(
  { option, current, onPick }: { option: SelectOption; current: boolean; onPick: () => void },
): JSX.Element {
  const [over, hover] = useHover();
  return (
    <button
      type="button"
      onClick={onPick}
      aria-current={current}
      {...hover}
      style={{
        display: 'flex', flexDirection: 'column', gap: 3, alignItems: 'flex-start',
        justifyContent: 'center', textAlign: 'left', minHeight: 36, boxSizing: 'border-box',
        padding: option.hint ? '8px 12px' : '0 12px', borderRadius: radius.input,
        border: 'none', cursor: 'pointer', font: 'inherit', width: '100%',
        background: over || current ? color.fill : 'transparent',
      }}
    >
      <span style={{ fontSize: text.body, color: color.ink }}>{option.label}</span>
      {option.hint && (
        <span style={{ fontSize: text.caption, color: color.muted, lineHeight: 1.4 }}>
          {option.hint}
        </span>
      )}
    </button>
  );
}
