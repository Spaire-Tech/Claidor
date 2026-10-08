/**
 * What the web view keeps and what leaves it (`mobile/src/core/routing.ts`).
 * Only the window's own pages load in it: they are the only pages the
 * injected pair is for, and Google refuses sign-ins in embedded web views.
 */
import assert from "node:assert/strict";
import test from "node:test";

import { loadModule } from "./lib/bundle.mjs";

const context = { app: "https://app.simeonlabs.com/app", api: "https://api.simeonlabs.com" };

test("top-level navigations: the window loads, the website's login is the app's sign-in, sign-ins go to the sheet, links to Safari", async (t) => {
  const { module, dispose } = await loadModule("mobile/src/core/routing.ts", "routing-top");
  t.after(dispose);
  const route = (url, isTopFrame = true) => module.routeNavigation({ url, isTopFrame }, context);
  // The window's own pages.
  assert.deepEqual(route("https://app.simeonlabs.com/app"), { kind: "load" });
  assert.deepEqual(route("https://app.simeonlabs.com/app?api=https://api.simeonlabs.com"), { kind: "load" });
  assert.deepEqual(route("https://app.simeonlabs.com/app/connected.html?code=c&state=s"), { kind: "load" });
  assert.deepEqual(route("about:blank"), { kind: "load" });
  // The website's login means the session is gone.
  assert.deepEqual(route("https://app.simeonlabs.com/login?return_to=%2Fapp"), { kind: "sign-in" });
  assert.deepEqual(route("https://app.simeonlabs.com/signup"), { kind: "sign-in" });
  // Sign-ins: the system's sheet.
  for (const url of [
    "https://accounts.google.com/o/oauth2/v2/auth?client_id=x&redirect_uri=y",
    "https://accounts.google.com/signin",
    "https://login.microsoftonline.com/common/oauth2/v2.0/authorize",
    "https://mcp.notion.com/authorize?response_type=code&client_id=c&state=s&redirect_uri=https%3A%2F%2Fapi.simeonlabs.com%2Fdesktop%2Fmcp-oauth%2Fcallback",
    "https://linear.app/oauth/authorize?client_id=c&state=s",
    "https://slack.com/oauth/v2/authorize?client_id=c",
    "https://api.simeonlabs.com/integrations/google/login/authorize?return_to=x",
    "https://api.simeonlabs.com/desktop/api/apps/gmail/connect",
  ]) assert.deepEqual(route(url), { kind: "auth-session", url }, url);
  // Everything else on the web: Safari's sheet.
  for (const url of ["https://simeonlabs.com/", "https://app.simeonlabs.com/billing", "https://en.wikipedia.org/wiki/Butterfly", "http://example.com/a?b=c"]) {
    assert.deepEqual(route(url), { kind: "browser", url }, url);
  }
  // Mail, phone and messages go to their apps; other schemes stay out.
  assert.deepEqual(route("mailto:bass@simeonlabs.com"), { kind: "system", url: "mailto:bass@simeonlabs.com" });
  assert.deepEqual(route("tel:+15555550100"), { kind: "system", url: "tel:+15555550100" });
  assert.deepEqual(route("simeon://app/v1/open"), { kind: "block" }, "the Mac's scheme means nothing here");
  assert.deepEqual(route("javascript:alert(1)"), { kind: "block" });
  assert.deepEqual(route("blob:https://app.simeonlabs.com/1234"), { kind: "block" }, "a blob in the top frame would replace the window");
  assert.deepEqual(route("data:text/html,hi"), { kind: "block" });
  assert.deepEqual(route("not a url"), { kind: "block" });
});

test("frames inside the window load as they ask: the computer panel is the box's screen through the API", async (t) => {
  const { module, dispose } = await loadModule("mobile/src/core/routing.ts", "routing-frames");
  t.after(dispose);
  assert.deepEqual(module.routeNavigation({ url: "https://api.simeonlabs.com/sand-box/b/p/6080/vnc.html?network_token=n", isTopFrame: false }, context), { kind: "load" });
});

test("new windows never open in the web view; a sign-in the page names is a sign-in whatever it looks like", async (t) => {
  const { module, dispose } = await loadModule("mobile/src/core/routing.ts", "routing-windows");
  t.after(dispose);
  const open = (url, purpose) => module.routeNewWindow({ url, ...(purpose ? { purpose } : {}) }, context);
  assert.deepEqual(open("https://app.simeonlabs.com/app/connected.html"), { kind: "browser", url: "https://app.simeonlabs.com/app/connected.html" });
  assert.deepEqual(open("https://vendor.example/consent", "sign-in"), { kind: "auth-session", url: "https://vendor.example/consent" });
  assert.deepEqual(open("https://docs.example.com/page", "link"), { kind: "browser", url: "https://docs.example.com/page" });
  assert.deepEqual(open("https://accounts.google.com/o/oauth2/auth?redirect_uri=x", "link"), { kind: "auth-session", url: "https://accounts.google.com/o/oauth2/auth?redirect_uri=x" });
  assert.deepEqual(open("about:blank"), { kind: "block" });
  assert.deepEqual(open("javascript:void(0)", "sign-in"), { kind: "block" });
});

test("a development build against the stand-in on the Mac keeps its own pages", async (t) => {
  const { module, dispose } = await loadModule("mobile/src/core/routing.ts", "routing-dev");
  t.after(dispose);
  const dev = { app: "http://127.0.0.1:4174/app", api: "http://127.0.0.1:4174" };
  assert.deepEqual(module.routeNavigation({ url: "http://127.0.0.1:4174/app?api=http://127.0.0.1:4174", isTopFrame: true }, dev), { kind: "load" });
  assert.deepEqual(module.routeNavigation({ url: "http://127.0.0.1:4174/vendor/authorize?client_id=simeon&redirect_uri=x&state=s", isTopFrame: true }, dev).kind, "auth-session");
});
