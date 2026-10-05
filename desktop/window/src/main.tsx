import { StrictMode } from "react";
import { createRoot } from "react-dom/client";

import { readDoors } from "./bridge/desktop.js";
import { WindowStore } from "./state/store.js";
import { App } from "./ui/App.js";
import "./styles/tokens.css";
import "./styles/app.css";

const root = document.getElementById("root");
if (root == null) throw new Error("no #root element");

try {
  const { desktop, coordinator } = readDoors();
  const store = new WindowStore(desktop, coordinator);
  void store.boot();
  createRoot(root).render(
    <StrictMode>
      <App store={store} />
    </StrictMode>,
  );
} catch (error) {
  root.textContent = error instanceof Error ? error.message : String(error);
  root.className = "fatal";
}
