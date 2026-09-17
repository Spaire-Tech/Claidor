import { caisraRowsFromBlocks } from "@rakazo/core";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import {
  bots,
  everythingElse,
  expenses,
  type FixtureMessage,
  morning,
  names,
  routines,
  runs,
  startingUp,
  yodo,
} from "./fixtures.js";
import { Routines } from "./Routines.js";
import { Shell } from "./Shell.js";
import { Thread, type ThreadRow } from "./Thread.js";
import "./tokens.css";

/**
 * Every screen, drawn from real data.
 *
 * The rows come out of `caisraRowsFromBlocks` and the routines are real
 * `Routine` records, so a screenshot from here is evidence the real mapping
 * draws the real thing. A bubble needs to know who is speaking, which belongs
 * to the message and not to the block, so that is the one thing added on the
 * way past.
 */
function rowsOf(messages: FixtureMessage[]): ThreadRow[] {
  return messages.flatMap((message) =>
    caisraRowsFromBlocks(message.blocks, { nameFor: (id) => names[id] }).map(
      (row): ThreadRow => (row.kind === "text" ? { ...row, from: message.role } : row),
    ),
  );
}

const screen = new URLSearchParams(window.location.search).get("screen") ?? "morning";

function Screen() {
  if (screen === "routines" || screen === "routines-menu") {
    return (
      <Shell bots={bots} openId={yodo.id} tab="routines">
        <Routines
          agentId={yodo.id}
          agentName={yodo.name}
          routines={routines}
          openId={screen === "routines-menu" ? "rt_3" : "rt_1"}
          runs={screen === "routines-menu" ? [] : runs}
          menuOpen={screen === "routines-menu"}
          slackAvailable
        />
      </Shell>
    );
  }

  const shown =
    screen === "starting-up"
      ? { bot: yodo, rows: rowsOf(startingUp) }
      : screen === "everything"
        ? { bot: expenses, rows: rowsOf(everythingElse) }
        : { bot: yodo, rows: rowsOf(morning) };

  return (
    <Shell bots={bots} openId={shown.bot.id} tab="chat">
      <Thread
        title={shown.bot.name}
        subtitle={shown.bot.title}
        seed={shown.bot.id}
        rows={shown.rows}
      />
    </Shell>
  );
}

createRoot(document.getElementById("root") as HTMLElement).render(
  <StrictMode>
    <Screen />
  </StrictMode>,
);
