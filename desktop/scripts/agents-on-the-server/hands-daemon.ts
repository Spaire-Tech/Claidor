// The computer's hands program (box-exec-daemon) started by itself, listening
// beyond loopback with a real token, as a stand-in computer for step 0 of
// docs/agents-on-the-server/README.md.
import { startBoxExecDaemon } from "../../source/box-exec-daemon/server.js";

const handle = await startBoxExecDaemon({
  host: "0.0.0.0",
  port: Number.parseInt(process.env.PROBE_PORT ?? "0", 10),
  authToken: process.env.PROBE_TOKEN ?? "",
  workspaceRoot: process.env.PROBE_WORKSPACE ?? "/tmp/probe-workspace",
  computerUse: false,
});
process.stdout.write(`${JSON.stringify({ ready: true, url: handle.url })}\n`);
process.on("SIGTERM", () => { void handle.stop().then(() => process.exit(0)); });
