import { frameWindowWidth, SidebarMode, shellLayout } from "@rakazo/core";
import { type ReactNode, useEffect, useMemo, useState } from "react";
import { Blob } from "./Blob.js";
import { Dock, type DockItem } from "./Dock.js";
import type { FixtureBot } from "./fixtures.js";
import "./shell.css";

/**
 * The app: a floating window on a pale ground, with the glass dock beside it.
 *
 * **Every measurement here is the founder's**, read out of
 * `desktop/src/renderer/design/shell/MessagesShell.tsx` and `Sidebar.tsx`
 * rather than chosen: the window's 40px radius and its hairline border, the
 * conversation pane inset into it by 8px with a 28px radius of its own, the
 * sidebar flush to the window's left edge, its title at 18px and its search as
 * a field rather than an icon, 59px rows at a 16px radius with the open one
 * lifted onto paper.
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
 * 2. **A screen takes the whole window**, the list of agents included —
 *    *"have the + open in full without the chat left side bar. what i did
 *    there is dumb. thats on me. same for apps."*
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
  create: "New message",
  apps: "Apps",
  settings: "Settings",
};

/**
 * The display's width, kept current.
 *
 * The desktop shell's own note on why this exists: the old layout never re-read
 * it, which is why leaving full screen changed nothing on screen. This is the
 * piece that makes the shell reconsider rather than merely stretch.
 */
function useViewportWidth(): number {
  const [width, setWidth] = useState(() =>
    typeof window === "undefined" ? 1440 : window.innerWidth,
  );
  useEffect(() => {
    const read = () => setWidth(window.innerWidth);
    read();
    window.addEventListener("resize", read);
    return () => window.removeEventListener("resize", read);
  }, []);
  return width;
}

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

  // How the window is divided right now, decided on the window's width and not
  // the display's: the frame around it is fixed, so the window is what gets
  // narrower. Below 900 the list becomes a rail of faces.
  const viewport = useViewportWidth();
  const layout = useMemo(() => shellLayout(frameWindowWidth(viewport)), [viewport]);

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
      <div
        className="window"
        style={{ gridTemplateColumns: `${layout.sidebarWidth}px minmax(0,1fr)` }}
      >
        <Conversations bots={bots} openId={openId} rail={layout.sidebar === SidebarMode.Rail} />
        {/* Routines keeps the list beside it: it is a thing an agent has, so
            you pick the agent the way you always do. Create, Apps and Settings
            are errands and take the window. */}
        <section className="pane">{full ? null : children}</section>

        {/*
          One screen at a time, over the whole window, with one way back. It is
          laid over rather than swapped into the grid so the conversation keeps
          its place while an errand is open.
        */}
        {full ? (
          <div className="screen">
            <BackBar title={full} onBack={() => onGo(Screen.Chat)} />
            <div className="screen__body">{children}</div>
          </div>
        ) : null}
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
        <span className="backbar__chevron">
          <Chevron />
        </span>
        Chat
      </button>
      <span className="backbar__title">{title}</span>
    </header>
  );
}

/** The canvas's chevron, turned to point back. */
function Chevron() {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
      focusable="false"
      style={{ transform: "rotate(180deg)" }}
    >
      <path d="M9 5l7 7-7 7" />
    </svg>
  );
}

/**
 * The list of agents: the window's left column.
 *
 * It is a conversation list, not a navigation tree: one row per agent, a face,
 * the last message, a timestamp, an unread dot. The search filters by name
 * only — searching message content is a different feature with a different
 * screen, and pretending otherwise in a filter box is how a search box becomes
 * untrustworthy.
 *
 * Nothing at the bottom and no "+" at the top: those went to the dock.
 */
function Conversations({
  bots,
  openId,
  rail,
}: {
  bots: readonly FixtureBot[];
  openId: string;
  rail: boolean;
}) {
  const [query, setQuery] = useState("");
  const shown = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) return bots;
    return bots.filter((bot) => bot.name.toLowerCase().includes(needle));
  }, [bots, query]);

  return (
    <aside className={`sidebar ${rail ? "sidebar--rail" : ""}`}>
      {/* No title and no search on the rail. A 76px field is a box you cannot
          read what you typed into, and the rail exists because there is no
          room; pretending otherwise spends the room twice. */}
      {rail ? null : (
        <>
          <div className="sidebar__head">
            <span className="sidebar__title">Messages</span>
          </div>
          <div className="sidebar__find">
            <label className="sidebar__findbox">
              <Search />
              <input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Search"
                aria-label="Search agents"
              />
            </label>
          </div>
        </>
      )}

      <div className="sidebar__list">
        {shown.map((bot) => {
          const open = bot.id === openId;
          return (
            <button
              type="button"
              key={bot.id}
              className={`convo ${open ? "convo--open" : ""}`}
              aria-current={open ? "true" : undefined}
              {...(rail ? { title: bot.name, "aria-label": bot.name } : {})}
            >
              <Blob seed={bot.id} size={33} />
              {rail ? (
                bot.unread ? (
                  <span
                    className="convo__unread convo__unread--rail"
                    role="img"
                    aria-label="Unread"
                  />
                ) : null
              ) : (
                <>
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
                  {/* The dot keeps its width read or unread, so no name shifts
                      sideways when a conversation is caught up. */}
                  <span
                    className={`convo__unread ${bot.unread ? "" : "convo__unread--off"}`}
                    {...(bot.unread ? { role: "img", "aria-label": "Unread" } : {})}
                  />
                </>
              )}
            </button>
          );
        })}
      </div>
    </aside>
  );
}

/** The canvas's search glyph, at the size the sidebar's field uses. */
function Search() {
  return (
    <svg
      width="13"
      height="13"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
      focusable="false"
      style={{ flex: "0 0 auto", display: "block" }}
    >
      <circle cx="11" cy="11" r="7" />
      <path d="M20 20l-4-4" />
    </svg>
  );
}
