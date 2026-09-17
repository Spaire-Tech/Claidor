import { caisraRowsFromBlocks } from "@rakazo/core";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { type FixtureMessage, morning, names, startingUp } from "./fixtures.js";
import { Thread, type ThreadRow } from "./Thread.js";
import "./tokens.css";

/**
 * The thread, drawn from real message blocks.
 *
 * Every row on screen comes out of `caisraRowsFromBlocks`, so what is drawn
 * here is what a real conversation would draw. A bubble needs to know who is
 * speaking, which is a property of the message rather than the block, so that
 * is the one thing added on the way past.
 */
function rowsOf(messages: FixtureMessage[]): ThreadRow[] {
  return messages.flatMap((message) =>
    caisraRowsFromBlocks(message.blocks, { nameFor: (id) => names[id] }).map(
      (row): ThreadRow => (row.kind === "text" ? { ...row, from: message.role } : row),
    ),
  );
}

const screen = new URLSearchParams(window.location.search).get("screen") ?? "morning";
const shown =
  screen === "starting-up"
    ? { title: "Yodo", rows: rowsOf(startingUp) }
    : { title: "Yodo", rows: rowsOf(morning) };

createRoot(document.getElementById("root") as HTMLElement).render(
  <StrictMode>
    <Thread title={shown.title} rows={shown.rows} />
  </StrictMode>,
);
