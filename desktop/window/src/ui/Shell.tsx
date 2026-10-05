import { useEffect } from "react";

import type { WindowStateSnapshot, WindowStore } from "../state/store.js";
import { Conversation } from "./Conversation.js";
import { Sidebar } from "./Sidebar.js";

export function Shell({ store, state }: { readonly store: WindowStore; readonly state: WindowStateSnapshot }) {
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && !event.shiftKey && event.key.toLowerCase() === "b") { event.preventDefault(); store.toggleSidebar(); }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [store]);
  const active = state.agents.find(agent => agent.id === state.activeAgentId) ?? null;
  return (
    <div className={`shell${state.sidebarCollapsed ? " shell--rail" : ""}`} data-screen="shell" data-platform={store.desktop.platform}>
      <Sidebar store={store} state={state} />
      <main className="stage">
        {active == null
          ? <EmptyStage count={state.agents.length} />
          : <Conversation key={active.id} store={store} state={state} agent={active} />}
      </main>
    </div>
  );
}

function EmptyStage({ count }: { readonly count: number }) {
  return (
    <div className="stage__empty">
      <p>{count === 0 ? "No agents yet. Make your first one with the + above." : "Pick an agent to talk to."}</p>
    </div>
  );
}
