import type { SelectOption, SettingsGroup, SettingsInput, SettingsRow } from "@rakazo/core";
import { SETTINGS_TABS, SettingsRowKind, SettingsTab, settingsFor } from "@rakazo/core";
import type { ReactElement, ReactNode } from "react";
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Switch } from "./Switch.js";
import "./settings.css";

/**
 * Settings.
 *
 * A 236px rail of four tabs and a column of grouped rows, which is the canvas's
 * shape down to the numbers, read out of
 * `desktop/src/renderer/design/settings/Settings.tsx`. It replaces upstream's
 * thirteen tabs: providers, API keys, skins, IM platforms, a growth tour, all
 * of it in Chinese first.
 *
 * It is not a sheet over a scrim but the screen itself: white, filling its
 * container, the rail in the window's grey, the groups in the same grey with no
 * border. No glass — in this canvas glass is the dock and the voice orb and
 * nothing else.
 *
 * Rows come in five kinds and no sixth, the same discipline the thread has.
 * Which rows exist is decided in `@rakazo/core`'s `caisra-settings` and tested
 * there; this draws them.
 */
export function Settings({
  input,
  initialTab,
  onPick,
  onToggle,
  onPress,
}: {
  input: SettingsInput;
  /** The tab to open on, when a link named a row. */
  initialTab?: SettingsTab;
  onPick?: (rowId: string, value: string) => void;
  onToggle?: (rowId: string, on: boolean) => void;
  onPress?: (rowId: string) => void;
}) {
  const [tab, setTab] = useState<SettingsTab>(initialTab ?? SettingsTab.General);
  const groups = settingsFor(tab, input);

  return (
    <div className="settings">
      <nav className="settings__rail" aria-label="Settings">
        {SETTINGS_TABS.map((one) => (
          <button
            key={one}
            type="button"
            className={`settings__tab ${one === tab ? "settings__tab--on" : ""}`}
            aria-pressed={one === tab}
            onClick={() => setTab(one)}
          >
            <span className="settings__tabmark">{TAB_ICON[one]}</span>
            <span className="settings__tabname">{one}</span>
          </button>
        ))}
      </nav>

      <div className="settings__body">
        <div className="settings__head">
          <h1 className="settings__title">{tab}</h1>
          {/* The X is gone: the shell's back bar is the way out of every
              screen, and one door beats four. */}
        </div>
        <div className="settings__list">
          {groups.map((group) => (
            <Group
              key={group.title}
              group={group}
              {...(onPick ? { onPick } : {})}
              {...(onToggle ? { onToggle } : {})}
              {...(onPress ? { onPress } : {})}
            />
          ))}
        </div>
      </div>
    </div>
  );
}

function Group({
  group,
  onPick,
  onToggle,
  onPress,
}: {
  group: SettingsGroup;
  onPick?: (rowId: string, value: string) => void;
  onToggle?: (rowId: string, on: boolean) => void;
  onPress?: (rowId: string) => void;
}) {
  return (
    <section className="group">
      <div className="group__title">{group.title}</div>
      <div className="group__card">
        {group.rows.map((row, index) => (
          <div
            key={row.id}
            className={`srow ${index === 0 ? "srow--first" : ""} ${
              row.kind === SettingsRowKind.Meter ? "srow--stacked" : ""
            }`}
          >
            <div className="srow__stack">
              <div className="srow__label">{row.label}</div>
              {row.kind !== SettingsRowKind.Meter && row.desc ? (
                <div className="srow__desc">{row.desc}</div>
              ) : null}
            </div>
            <Control
              row={row}
              {...(onPick ? { onPick } : {})}
              {...(onToggle ? { onToggle } : {})}
              {...(onPress ? { onPress } : {})}
            />
          </div>
        ))}
      </div>
    </section>
  );
}

function Control({
  row,
  onPick,
  onToggle,
  onPress,
}: {
  row: SettingsRow;
  onPick?: (rowId: string, value: string) => void;
  onToggle?: (rowId: string, on: boolean) => void;
  onPress?: (rowId: string) => void;
}) {
  switch (row.kind) {
    case SettingsRowKind.Select:
      return (
        <Select
          value={row.value}
          options={row.options}
          label={row.label}
          onPick={(value) => onPick?.(row.id, value)}
        />
      );
    case SettingsRowKind.Toggle:
      return <Switch on={row.on} label={row.label} onToggle={() => onToggle?.(row.id, !row.on)} />;
    case SettingsRowKind.Button:
      return (
        <ActionButton
          action={row.action}
          {...(row.tone ? { tone: row.tone } : {})}
          {...(row.busy ? { busy: row.busy } : {})}
          onPress={() => onPress?.(row.id)}
        />
      );
    case SettingsRowKind.Field:
      return <Field value={row.value} label={row.label} readOnly={row.readOnly ?? false} />;
    case SettingsRowKind.Meter:
      return (
        <span className="meter">
          <span className="meter__track">
            <span
              className="meter__fill"
              style={{ width: `${Math.round(Math.min(1, Math.max(0, row.fraction)) * 100)}%` }}
            />
          </span>
          <span className="meter__line">
            <span className="meter__desc">{row.desc}</span>
            <span className="meter__value">{row.value}</span>
          </span>
        </span>
      );
    default:
      // Five kinds and no sixth. A new one is a decision, made here.
      return null;
  }
}

/** How long a destructive button stays armed after the first press. */
const CONFIRM_WINDOW_MS = 4000;

/**
 * A row's button, and the second press a destructive one asks for.
 *
 * A dangerous control does not open a dialog. It changes what it says and
 * waits, which is the same behaviour as deleting a conversation, so there is
 * one way this works in the app rather than two.
 *
 * Only `danger` rows ask. Making every button confirm would train people to
 * press twice without reading, which is exactly the habit that makes the
 * confirmation worthless on the one row that needed it.
 */
function ActionButton({
  action,
  tone,
  busy,
  onPress,
}: {
  action: string;
  tone?: "primary" | "danger";
  busy?: boolean;
  onPress: () => void;
}) {
  const [armed, setArmed] = useState(false);

  useEffect(() => {
    if (!armed) return;
    const timer = window.setTimeout(() => setArmed(false), CONFIRM_WINDOW_MS);
    return () => window.clearTimeout(timer);
  }, [armed]);

  const press = () => {
    if (tone !== "danger") {
      onPress();
      return;
    }
    if (armed) {
      setArmed(false);
      onPress();
      return;
    }
    setArmed(true);
  };

  return (
    <button
      type="button"
      className={`action ${tone ? `action--${tone}` : ""}`}
      disabled={busy ?? false}
      onClick={press}
    >
      {tone === "danger" && armed ? "Click again to confirm" : action}
    </button>
  );
}

function Field({ value, label, readOnly }: { value: string; label: string; readOnly: boolean }) {
  const [draft, setDraft] = useState(value);
  // The row can keep its id and change its value underneath, so the draft
  // follows it rather than showing what was there before.
  useEffect(() => setDraft(value), [value]);

  if (readOnly) {
    return (
      <span className="field field--read" title={value}>
        {value}
      </span>
    );
  }
  return (
    <span className="field__row">
      <input
        className="field"
        value={draft}
        aria-label={label}
        autoComplete="off"
        spellCheck={false}
        onChange={(event) => setDraft(event.target.value)}
      />
      <button type="button" className="fieldbutton" disabled={draft === value}>
        Save
      </button>
    </span>
  );
}

/** The open menu's width and its gap below the control. */
const SELECT_MENU_WIDTH = 320;
const SELECT_MENU_GAP = 6;

/**
 * The canvas draws a select as a value and a chevron and never opens it. A real
 * one has to open, so this is the app's popover, with the same Escape and
 * click-outside as every other menu.
 *
 * **The menu is rendered at the document's root, not inside the row.** Every
 * group card clips its contents (`overflow: hidden`, which is what rounds its
 * corners) and the column scrolls, so a menu positioned inside the row was cut
 * off at the card's edge: the founder saw *"every dropdown in settings opens
 * inside the box"*. A portal puts it above everything, and `position: fixed`
 * places it under the control from the control's own rectangle, measured when
 * it opens.
 */
function Select({
  value,
  options,
  label,
  onPick,
}: {
  value: string;
  options: readonly SelectOption[];
  label: string;
  onPick: (value: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [place, setPlace] = useState<{ top: number; right: number }>();
  const ref = useRef<HTMLSpanElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const current = options.find((one) => one.value === value);

  // Measured on open, and again when the window changes size under it.
  useLayoutEffect(() => {
    if (!open) {
      setPlace(undefined);
      return;
    }
    const measure = () => {
      const box = ref.current?.getBoundingClientRect();
      if (!box) return;
      setPlace({
        top: box.bottom + SELECT_MENU_GAP,
        right: Math.max(8, window.innerWidth - box.right),
      });
    };
    measure();
    window.addEventListener("resize", measure);
    return () => window.removeEventListener("resize", measure);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      // Stopped here, or Escape would also take the whole screen back to the
      // chat while a menu was the only thing the person meant to close.
      if (event.key === "Escape") {
        event.stopPropagation();
        setOpen(false);
      }
    };
    const onDown = (event: MouseEvent) => {
      const target = event.target as Node;
      if (!ref.current?.contains(target) && !menuRef.current?.contains(target)) setOpen(false);
    };
    document.addEventListener("keydown", onKey, true);
    const timer = window.setTimeout(() => document.addEventListener("mousedown", onDown), 0);
    return () => {
      document.removeEventListener("keydown", onKey, true);
      document.removeEventListener("mousedown", onDown);
      window.clearTimeout(timer);
    };
  }, [open]);

  return (
    <span className="select" ref={ref}>
      {open && place
        ? createPortal(
            <div
              ref={menuRef}
              className="selectmenu"
              // Placed from the control's measured rectangle, so it cannot be
              // expressed in the stylesheet.
              style={{
                top: place.top,
                right: place.right,
                width: SELECT_MENU_WIDTH,
                maxHeight: `calc(100vh - ${place.top + 12}px)`,
              }}
            >
              {options.map((option) => (
                <button
                  key={option.value}
                  type="button"
                  className={`selectmenu__row ${
                    option.value === value ? "selectmenu__row--on" : ""
                  }`}
                  onClick={() => {
                    setOpen(false);
                    onPick(option.value);
                  }}
                >
                  <span className="selectmenu__label">{option.label}</span>
                  {option.hint ? <span className="selectmenu__hint">{option.hint}</span> : null}
                </button>
              ))}
            </div>,
            document.body,
          )
        : null}
      <button
        type="button"
        className="select__button"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={label}
        onClick={() => setOpen((one) => !one)}
      >
        <span>{current?.label ?? value}</span>
        <svg
          width="11.5"
          height="11.5"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth={2}
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden
          focusable="false"
          className="select__chevron"
        >
          <path d="M5 9l7 7 7-7" />
        </svg>
      </button>
    </span>
  );
}

/** The canvas's glyph for each tab, at the size the rail draws it. */
const TAB_ICON: Record<SettingsTab, ReactElement> = {
  [SettingsTab.General]: (
    <Glyph>
      <circle cx="12" cy="12" r="3.2" />
      <path d="M12 3.5v2.2M12 18.3v2.2M4.6 7.8l1.9 1.1M17.5 15.1l1.9 1.1M4.6 16.2l1.9-1.1M17.5 8.9l1.9-1.1" />
    </Glyph>
  ),
  [SettingsTab.Computer]: (
    <Glyph>
      <rect x="3" y="4" width="18" height="12" rx="2.5" />
      <path d="M9 20h6M12 16v4" />
    </Glyph>
  ),
  [SettingsTab.Usage]: (
    <Glyph>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 12l4-3" />
    </Glyph>
  ),
  [SettingsTab.Updates]: (
    <Glyph>
      <path d="M12 4v10" />
      <path d="M8 10l4 4 4-4" />
      <path d="M4 17v2a2 2 0 002 2h12a2 2 0 002-2v-2" />
    </Glyph>
  ),
};

function Glyph({ children }: { children: ReactNode }) {
  return (
    <svg
      width="15"
      height="15"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.7}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
      focusable="false"
    >
      {children}
    </svg>
  );
}
