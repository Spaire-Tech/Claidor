import type { ReactNode } from "react";
import { Blob } from "./Blob.js";
import type { FixtureBot } from "./fixtures.js";
import "./shell.css";

/**
 * The app.
 *
 * Messages, and each conversation is an agent — the founder's direction of 13
 * September, which is why this is a list of faces and last lines rather than a
 * dashboard of agents with status chips. The right side is whatever is open:
 * a thread, or the routines of the agent whose thread is open.
 *
 * There is no "new chat". A conversation is an agent, so starting one means
 * standing an agent up, and that happens in the conversation with Yodo.
 */

export function Shell({
  bots,
  openId,
  tab,
  tall,
  children,
}: {
  bots: readonly FixtureBot[];
  openId: string;
  /** Which of the open agent's screens is showing. */
  tab: "chat" | "routines";
  /** A thread holding one long answer grows rather than scrolling it away. */
  tall?: boolean;
  children: ReactNode;
}) {
  return (
    // The routines screen is as tall as it needs to be; a thread is a fixed
    // window with its composer pinned to the bottom of it.
    <div className={`app ${tab === "routines" || tall ? "app--tall" : ""}`}>
      <aside className="sidebar">
        <div className="sidebar__head">
          <span className="sidebar__title">Caisra</span>
          <button type="button" className="sidebar__icon" aria-label="Search">
            ⌕
          </button>
        </div>
        <div className="sidebar__list">
          {bots.map((bot) => {
            const open = bot.id === openId;
            return (
              <button type="button" key={bot.id} className={`convo ${open ? "convo--open" : ""}`}>
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
                {bot.unread ? (
                  <span className="convo__unread" role="img" aria-label="Unread" />
                ) : null}
              </button>
            );
          })}
        </div>
        <div className="sidebar__foot">
          <span className="sidebar__you">You</span>
          <button type="button" className="sidebar__icon" aria-label="Settings">
            ⚙
          </button>
        </div>
      </aside>
      <section className={`pane ${tab === "routines" ? "pane--flat" : ""}`}>{children}</section>
    </div>
  );
}
