import { type ReactNode, useEffect } from "react";
import { Blob } from "./Blob.js";
import { Dock, type DockItem } from "./Dock.js";
import type { FixtureBot } from "./fixtures.js";
import "./shell.css";

/**
 * The app: a floating window on a pale ground, with the glass dock beside it.
 *
 * **Navigation has exactly one model**, and it is the founder's, after the
 * version that had none: *"you click on app, then you click on settings, we
 * got two screens, one up the other… there's zero zero logic of navigation…
 * that x thing needs to GO… it's like a skin over a skin."*
 *
 * So, five rules, and they are structural rather than agreed:
 *
 * 1. **One screen at a time.** `screen` is a single value, not a stack, so two
 *    cannot be open at once. That is the whole fix; the rest follows from it.
 * 2. **A screen takes the whole window.** Create and Apps do not sit in a pane
 *    with the conversation list beside them — *"have the + open in full
 *    without the chat left side bar. what i did there is dumb. thats on me.
 *    same for apps."*
 * 3. **Back is the conversation, always.** Never the screen before. Go from
 *    Create to Settings and back, and you are in the chat, because the chat is
 *    the main thing.
 * 4. **There is no X.** One back bar, and Escape is the keyboard's back.
 * 5. **The dock switches screens directly.** Nobody backs out to move between
 *    them.
 */

export const Screen = {
  /** The conversation. Home, and the only place back ever goes. */
  Chat: "chat",
  Routines: "routines",
  Create: "create",
  Apps: "apps",
  Settings: "settings",
} as const;
export type Screen = (typeof Screen)[keyof typeof Screen];

/** Which dock button is lit for a screen. Settings belongs to the person. */
const DOCK_OF: Record<Screen, DockItem> = {
  chat: "home",
  routines: "routines",
  create: "create",
  apps: "apps",
  settings: "you",
};

/** A screen that takes the whole window, and what its back bar says it is. */
const FULL_WIDTH: Partial<Record<Screen, string>> = {
  create: "New agent",
  apps: "Apps",
  settings: "Settings",
};

export function Shell({
  bots,
  openId,
  screen,
  accountName,
  onGo,
  children,
}: {
  bots: readonly FixtureBot[];
  openId: string;
  screen: Screen;
  accountName: string;
  onGo: (screen: Screen) => void;
  children: ReactNode;
}) {
  const full = FULL_WIDTH[screen];

  // Escape is the keyboard's back, and it goes where the bar goes.
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape" && screen !== Screen.Chat) onGo(Screen.Chat);
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [screen, onGo]);

  return (
    <div className="frame">
      <Dock
        active={DOCK_OF[screen]}
        accountName={accountName}
        onGo={(item) => onGo(SCREEN_OF[item])}
      />
      <div className="window">
        {full ? (
          <>
            <BackBar title={full} onBack={() => onGo(Screen.Chat)} />
            <section className="pane pane--full">{children}</section>
          </>
        ) : (
          <>
            <Conversations bots={bots} openId={openId} />
            <section className="pane">{children}</section>
          </>
        )}
      </div>
    </div>
  );
}

const SCREEN_OF: Record<DockItem, Screen> = {
  home: Screen.Chat,
  routines: Screen.Routines,
  create: Screen.Create,
  apps: Screen.Apps,
  you: Screen.Settings,
};

/**
 * The one back bar. It says where it goes, because "x" told nobody anything:
 * *"that 'x' thing too that i need remove and make it a back button."*
 */
function BackBar({ title, onBack }: { title: string; onBack: () => void }) {
  return (
    <header className="backbar">
      <button type="button" className="backbar__back" onClick={onBack}>
        <svg
          width="15"
          height="15"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth={1.8}
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden
          focusable="false"
        >
          <path d="M15 5l-7 7 7 7" />
        </svg>
        Chat
      </button>
      <span className="backbar__title">{title}</span>
    </header>
  );
}

/**
 * The conversation list: one per agent, which is what the app is.
 *
 * Nothing sits at the bottom. Apps and the account row moved to the dock when
 * it arrived, and the sidebar's own "+" with them, so this is a list and
 * nothing else.
 */
function Conversations({ bots, openId }: { bots: readonly FixtureBot[]; openId: string }) {
  return (
    <aside className="sidebar">
      <div className="sidebar__head">
        <span className="sidebar__title">Messages</span>
        <button type="button" className="sidebar__icon" aria-label="Search">
          <svg
            width="16"
            height="16"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth={1.8}
            strokeLinecap="round"
            aria-hidden
            focusable="false"
          >
            <circle cx="11" cy="11" r="6.5" />
            <path d="M16 16l4 4" />
          </svg>
        </button>
      </div>
      <div className="sidebar__list">
        {bots.map((bot) => (
          <button
            type="button"
            key={bot.id}
            className={`convo ${bot.id === openId ? "convo--open" : ""}`}
          >
            <Blob seed={bot.id} size={34} />
            <span className="convo__stack">
              <span className="convo__top">
                <span className="convo__name">{bot.name}</span>
                <span className="convo__when">{bot.when}</span>
              </span>
              <span className="convo__last">
                {bot.working ? <span className="convo__working">Working · </span> : null}
                {bot.last}
              </span>
            </span>
            {bot.unread ? <span className="convo__unread" role="img" aria-label="Unread" /> : null}
          </button>
        ))}
      </div>
    </aside>
  );
}
