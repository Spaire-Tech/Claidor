import { caisraRowsFromBlocks } from "@rakazo/core";
import { StrictMode, useState } from "react";
import { createRoot } from "react-dom/client";
import { Apps } from "./Apps.js";
import {
  bots,
  cardScreens,
  catalog,
  everythingElse,
  expenses,
  type FixtureMessage,
  morning,
  names,
  proactive,
  routines,
  runs,
  startingUp,
  yodo,
} from "./fixtures.js";
import { Routines } from "./Routines.js";
import { Screen, Shell } from "./Shell.js";
import { Thread, type ThreadRow } from "./Thread.js";
import "./tokens.css";

/**
 * Every screen, drawn from real data.
 *
 * The rows come out of `caisraRowsFromBlocks`, the routines are real `Routine`
 * records, and the apps are real `ConnectionCatalogItem`s run through the
 * fork's own featured-connector functions. A screenshot from here is evidence
 * that the real mapping draws the real thing.
 *
 * A bubble needs to know who is speaking, which belongs to the message rather
 * than to the block, so that is the one thing added on the way past.
 */
function rowsOf(messages: FixtureMessage[]): ThreadRow[] {
  return messages.flatMap((message) =>
    caisraRowsFromBlocks(message.blocks, { nameFor: (id) => names[id] }).map(
      (row): ThreadRow => (row.kind === "text" ? { ...row, from: message.role } : row),
    ),
  );
}

const asked = new URLSearchParams(window.location.search).get("screen") ?? "morning";

/**
 * Where a card's pictures come from: OpenUI's own rule, a seeded picsum
 * address. Always resolves, always the same picture for the same seed.
 */
const photo = (name: string) => `https://picsum.photos/seed/${name}/800/500`;
const cards: Record<string, FixtureMessage[]> = {
  ...cardScreens(photo),
  proactive: proactive(photo),
};

/** Which screen a harness name opens on. Everything else is a conversation. */
const SCREEN_OF: Record<string, Screen> = {
  routines: Screen.Routines,
  "routines-menu": Screen.Routines,
  apps: Screen.Apps,
};

function App() {
  // One value, not a stack. Two screens cannot be open at once because there
  // is nowhere to put the second one.
  const [screen, setScreen] = useState<Screen>(SCREEN_OF[asked] ?? Screen.Chat);

  const conversation = cards[asked];
  const open =
    asked === "starting-up"
      ? { bot: yodo, rows: rowsOf(startingUp) }
      : asked === "everything"
        ? { bot: expenses, rows: rowsOf(everythingElse) }
        : conversation
          ? { bot: yodo, rows: rowsOf(conversation) }
          : { bot: yodo, rows: rowsOf(morning) };

  return (
    <Shell bots={bots} openId={open.bot.id} screen={screen} accountName="Bass" onGo={setScreen}>
      {screen === Screen.Routines ? (
        <Routines
          agentId={yodo.id}
          agentName={yodo.name}
          routines={routines}
          openId={asked === "routines-menu" ? "rt_3" : "rt_1"}
          runs={asked === "routines-menu" ? [] : runs}
          menuOpen={asked === "routines-menu"}
          slackAvailable
        />
      ) : screen === Screen.Apps ? (
        <Apps catalog={catalog} />
      ) : (
        <Thread
          title={open.bot.name}
          subtitle={open.bot.title}
          seed={open.bot.id}
          rows={open.rows}
        />
      )}
    </Shell>
  );
}

createRoot(document.getElementById("root") as HTMLElement).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
