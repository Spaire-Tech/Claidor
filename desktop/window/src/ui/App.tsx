import { useEffect } from "react";

import { useWindowState, type WindowStore } from "../state/store.js";
import { Shell } from "./Shell.js";
import { SignIn } from "./SignIn.js";

export function App({ store }: { readonly store: WindowStore }) {
  const state = useWindowState(store);
  useEffect(() => {
    document.documentElement.dataset.theme = state.theme.resolved;
  }, [state.theme.resolved]);
  if (state.fatal != null) return <div className="fatal">{state.fatal}</div>;
  if (!state.booted) return <div className="boot" aria-busy="true" />;
  if (state.auth.kind !== "logged-in") return <SignIn store={store} auth={state.auth} />;
  return <Shell store={store} state={state} />;
}
