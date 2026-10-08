/**
 * Notifications on the phone (`mobile/src/core/notifications.ts`): the
 * registration contract with the server, and a tap opening its agent once
 * the window listens, through the same event the Mac's notification click
 * pushes.
 */
import assert from "node:assert/strict";
import test from "node:test";

import { loadModule, runInPage } from "./lib/bundle.mjs";

test("the registration is the contract: POST and DELETE on /desktop/push-devices with the bearer", async (t) => {
  const { module, dispose } = await loadModule("mobile/src/core/notifications.ts", "push-contract");
  t.after(dispose);
  const register = module.registerDeviceRequest("https://api.simeonlabs.com", "simeon_da_a", "ExponentPushToken[xyz]");
  assert.equal(register.url, "https://api.simeonlabs.com/desktop/push-devices");
  assert.equal(register.init.method, "POST");
  assert.equal(register.init.headers.authorization, "Bearer simeon_da_a");
  assert.equal(register.init.headers["content-type"], "application/json");
  assert.deepEqual(JSON.parse(register.init.body), { expo_push_token: "ExponentPushToken[xyz]", platform: "ios" });
  const unregister = module.unregisterDeviceRequest("https://api.simeonlabs.com", "simeon_da_a", "ExponentPushToken[xyz]");
  assert.equal(unregister.url, "https://api.simeonlabs.com/desktop/push-devices");
  assert.equal(unregister.init.method, "DELETE");
  assert.equal(unregister.init.headers.authorization, "Bearer simeon_da_a");
  assert.deepEqual(JSON.parse(unregister.init.body), { expo_push_token: "ExponentPushToken[xyz]" });
});

test("a notification's data names its agent; anything else opens nothing", async (t) => {
  const { module, dispose } = await loadModule("mobile/src/core/notifications.ts", "push-data");
  t.after(dispose);
  assert.deepEqual(module.agentOfNotification({ agentId: "agent-7", kind: "agent-done" }), { agentId: "agent-7", kind: "agent-done" });
  assert.deepEqual(module.agentOfNotification({ agentId: "agent-7", kind: "agent-needs-input" }), { agentId: "agent-7", kind: "agent-needs-input" });
  assert.deepEqual(module.agentOfNotification({ agentId: "agent-7", kind: "agent-something-new" }), { agentId: "agent-7", kind: "agent-done" }, "a kind from a newer server still opens its agent");
  assert.equal(module.agentOfNotification({ kind: "agent-done" }), null);
  assert.equal(module.agentOfNotification({ agentId: "  " }), null);
  assert.equal(module.agentOfNotification({ agentId: 7 }), null);
  assert.equal(module.agentOfNotification(null), null);
  assert.equal(module.agentOfNotification("agent-7"), null);
});

test("a tap opens its agent once the window listens, once per notification, the last one winning", async (t) => {
  const { module, dispose } = await loadModule("mobile/src/core/notifications.ts", "push-queue");
  t.after(dispose);
  const opened = [];
  const queue = new module.AgentOpenQueue((agentId) => opened.push(agentId));
  // The tap that launched the app arrives before the window is up, twice (the launch response and the listener).
  queue.tapped("n-1", { agentId: "agent-1", kind: "agent-done" });
  queue.tapped("n-1", { agentId: "agent-1", kind: "agent-done" });
  queue.tapped("n-2", { agentId: "agent-2", kind: "agent-needs-input" });
  assert.deepEqual(opened, []);
  assert.equal(queue.waiting, "agent-2");
  queue.windowReady();
  assert.deepEqual(opened, ["agent-2"], "the last tap wins; nothing opens twice");
  // While the window is up, a tap opens at once.
  queue.tapped("n-3", { agentId: "agent-3", kind: "agent-done" });
  assert.deepEqual(opened, ["agent-2", "agent-3"]);
  queue.tapped("n-3", { agentId: "agent-3", kind: "agent-done" });
  assert.equal(opened.length, 2);
  // A reload: taps wait again.
  queue.windowGone();
  queue.tapped("n-4", { agentId: "agent-4" });
  assert.equal(opened.length, 2);
  queue.windowReady();
  assert.deepEqual(opened.at(-1), "agent-4");
  queue.tapped("n-5", { nothing: true });
  assert.equal(opened.length, 3);
});

test("the open is the bridge's `__simeonNative.openAgent`, and a page without the bridge is left alone", async (t) => {
  const { module, dispose } = await loadModule("mobile/src/core/notifications.ts", "push-script");
  t.after(dispose);
  const asked = [];
  const window = { __simeonNative: { openAgent: (id) => asked.push(id) } };
  runInPage(module.openAgentScript('agent-"quoted"</script>'), window);
  assert.deepEqual(asked, ['agent-"quoted"</script>'], "the id goes in as a string, whatever it holds");
  assert.doesNotThrow(() => runInPage(module.openAgentScript("agent-1"), {}));
});
