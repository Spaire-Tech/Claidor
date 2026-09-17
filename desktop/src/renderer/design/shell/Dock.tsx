import { DockAppsIcon, HomeIcon, PlusIcon, RoutineIcon } from '../icons';
import { color, glass, radius, shadow, text } from '../tokens';
import { DOCK_WIDTH } from './layout';

/**
 * The dock: the glass pill beside the window, from the 17 September
 * canvas (`ornaments`). Five round buttons, top to bottom: Home,
 * Routines, Create, Apps, and the person.
 *
 * What used to live at the bottom of the sidebar — Apps and the account
 * row — and its "+" at the top now live here, which is why the sidebar
 * has neither. The canvas lights the pressed one white with a soft ring
 * and colours its glyph the accent; the others are grey on the glass.
 *
 * **Routines** is drawn and does nothing yet. The founder: "i added a
 * section for routine. you can skip that until we do it." The button is
 * in the design, so it is in the dock; the screen behind it is not
 * built, so pressing it goes nowhere and it is never lit.
 */

export const DockItem = {
  Home: 'home',
  Routines: 'routines',
  Create: 'create',
  Apps: 'apps',
  You: 'you',
} as const;
export type DockItem = typeof DockItem[keyof typeof DockItem];

export interface DockProps {
  /** Which one is lit. */
  active: DockItem;
  /** The signed-in person's name, for the initial on the last button. */
  accountName: string;
  onHome: () => void;
  onCreate: () => void;
  onApps: () => void;
  onYou: () => void;
  /** The account menu, when open: anchored beside the last button. */
  accountMenu?: React.ReactNode;
}

const BUTTON = 52;

export function Dock({ active, accountName, onHome, onCreate, onApps, onYou, accountMenu }: DockProps): JSX.Element {
  const button = (
    item: DockItem,
    label: string,
    glyph: JSX.Element,
    onClick: (() => void) | undefined,
  ): JSX.Element => {
    const on = active === item;
    return (
      <button
        key={item}
        type="button"
        onClick={onClick}
        aria-label={label}
        aria-current={on ? 'page' : undefined}
        style={{
          width: BUTTON, height: BUTTON, borderRadius: '50%', border: 'none', padding: 0,
          cursor: onClick ? 'pointer' : 'default',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          background: on ? color.paper : 'transparent',
          boxShadow: on ? shadow.dockActive : 'none',
          color: on ? color.accent : color.faint,
          transition: 'background .16s, box-shadow .16s',
        }}
      >
        {glyph}
      </button>
    );
  };

  return (
    <div
      style={{
        position: 'relative', zIndex: 30, flex: '0 0 auto', width: DOCK_WIDTH, boxSizing: 'border-box',
        display: 'flex', flexDirection: 'column', gap: 14, padding: 11,
        borderRadius: radius.pill,
        background: glass.dock, backdropFilter: glass.dockBlur, WebkitBackdropFilter: glass.dockBlur,
        border: `1px solid ${glass.border}`, boxShadow: shadow.dock,
        WebkitAppRegion: 'no-drag',
      } as React.CSSProperties}
    >
      {button(DockItem.Home, 'Messages', <HomeIcon size={22} />, onHome)}
      {button(DockItem.Routines, 'Routines', <RoutineIcon size={22} />, undefined)}
      {button(DockItem.Create, 'New', <PlusIcon size={22} />, onCreate)}
      {button(DockItem.Apps, 'Apps', <DockAppsIcon size={22} />, onApps)}
      {button(
        DockItem.You,
        accountName,
        <span
          style={{
            width: 32, height: 32, borderRadius: '50%',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: text.message, fontWeight: 500, color: color.paper,
            background: active === DockItem.You ? color.ink : color.faint,
          }}
        >
          {(accountName.trim()[0] ?? '?').toUpperCase()}
        </span>,
        onYou,
      )}
      {accountMenu}
    </div>
  );
}
