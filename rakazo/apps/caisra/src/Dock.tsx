import "./dock.css";

/**
 * The dock: the glass pill beside the window, from the 17 September canvas.
 *
 * Five round buttons, top to bottom: Messages, Routines, Create, Apps, and the
 * person. What used to sit at the bottom of the sidebar — Apps and the account
 * row — and the sidebar's "+" all live here, which is why the sidebar has
 * none of them.
 *
 * Every path is the canvas's own, copied from `desktop/.../icons.tsx`
 * unchanged: same geometry, same 1.7 stroke, same 24×24 box. The canvas lights
 * the pressed one white with a soft ring and colours its glyph the accent; the
 * others are grey on the glass.
 *
 * **The dock switches screens directly.** Nobody goes back first to move
 * between them, which was the complaint that produced the navigation model
 * this shell is built on.
 *
 * Routines is live here. In the desktop build the button was drawn and did
 * nothing — *"i added a section for routine. you can skip that until we do
 * it."* We have the screen now, so it goes somewhere.
 */

export const DockItem = {
  Home: "home",
  Routines: "routines",
  Create: "create",
  Apps: "apps",
  You: "you",
} as const;
export type DockItem = (typeof DockItem)[keyof typeof DockItem];

const GLYPHS: Record<Exclude<DockItem, "you">, string> = {
  home: "M4 11.5L12 5l8 6.5V20h-5v-5h-6v5H4z",
  routines:
    "M4.8 12a7.2 7.2 0 0112.3-5.1M19.2 12a7.2 7.2 0 01-12.3 5.1M17.1 3.6v3.3h-3.3M6.9 20.4v-3.3h3.3",
  create: "M12 5v14M5 12h14",
  apps: "M4 4h6v6H4zM14 4h6v6h-6zM4 14h6v6H4zM14 14h6v6h-6z",
};

const LABELS: Record<DockItem, string> = {
  home: "Messages",
  routines: "Routines",
  create: "New",
  apps: "Apps",
  you: "You",
};

export function Dock({
  active,
  accountName,
  onGo,
  accountMenu,
}: {
  /** Which one is lit, if any. Settings lights none of them. */
  active?: DockItem;
  accountName: string;
  onGo: (item: DockItem) => void;
  /** The account menu when it is open, anchored beside the last button. */
  accountMenu?: React.ReactNode;
}) {
  return (
    <nav className="dock" aria-label="Caisra">
      {(["home", "routines", "create", "apps"] as const).map((item) => (
        <button
          key={item}
          type="button"
          className={`dock__button ${active === item ? "dock__button--on" : ""}`}
          aria-label={LABELS[item]}
          aria-current={active === item ? "page" : undefined}
          onClick={() => onGo(item)}
        >
          <svg
            width="22"
            height="22"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth={1.7}
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden
            focusable="false"
          >
            <path d={GLYPHS[item]} />
          </svg>
        </button>
      ))}
      <button
        type="button"
        className={`dock__button ${active === "you" ? "dock__button--on" : ""}`}
        aria-label={accountName}
        aria-current={active === "you" ? "page" : undefined}
        onClick={() => onGo("you")}
      >
        <span className={`dock__you ${active === "you" ? "dock__you--on" : ""}`}>
          {(accountName.trim()[0] ?? "?").toUpperCase()}
        </span>
      </button>
      {accountMenu}
    </nav>
  );
}
