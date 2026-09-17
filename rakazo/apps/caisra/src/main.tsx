import type { SettingsInput } from "@rakazo/core";
import { caisraRowsFromBlocks, ExecPolicy, SettingsTab } from "@rakazo/core";
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
import { Settings } from "./Settings.js";
import { Screen, Shell } from "./Shell.js";
import { Thread, ThreadMode, type ThreadRow } from "./Thread.js";
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
  settings: Screen.Settings,
  "settings-computer": Screen.Settings,
};

/**
 * What Settings is looking at. Real values rather than placeholders, so a
 * screenshot from here shows what somebody would actually read.
 */
const account: SettingsInput = {
  accountName: "Bass Fall",
  accountEmail: "bass@caisra.com",
  computerName: "Bass\u2019s MacBook Pro",
  workingDirectory: "~/Work/Caisra",
  execPolicy: ExecPolicy.Auto,
  memoryEnabled: true,
  usage: { fraction: 0.74, value: "74%", desc: "Renews in 9 days" },
  version: "2026.9.17",
  updateNote: "You\u2019re up to date",
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
    <Shell
      bots={bots}
      openId={open.bot.id}
      screen={screen}
      accountName="Bass"
      quota={{ planName: "Caisra", creditsLimit: 1000, creditsUsed: 740 }}
      {...(asked === "account" ? { initialAccountOpen: true } : {})}
      onGo={setScreen}
      // What an errand shows. The conversation below it is never taken down,
      // so pressing back lands where you left off rather than at the top.
      errand={
        screen === Screen.Routines ? (
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
        ) : screen === Screen.Settings ? (
          <Settings
            input={account}
            {...(asked === "settings-computer" ? { initialTab: SettingsTab.Computer } : {})}
          />
        ) : null
      }
    >
      <Thread
        title={open.bot.name}
        seed={open.bot.id}
        rows={open.rows}
        mode={asked === "voice" ? ThreadMode.Voice : ThreadMode.Text}
      />
    </Shell>
  );
}

createRoot(document.getElementById("root") as HTMLElement).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
