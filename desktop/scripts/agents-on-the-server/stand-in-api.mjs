// Step 0 of docs/agents-on-the-server/README.md: a stand-in for Simeon's API.
// It writes down each call's path, so a run of the engine outside a computer
// shows what it asks of the server. Reaches nothing real.
//
// It answers two calls; everything else gets 404:
// - the model credential (`/sand-box/inference-credential`), with a stand-in
//   token;
// - the model (`/desktop/api/proxy/v1/responses`, the Responses stream the
//   engine reads). The stand-in model asks for one Shell command
//   (PROBE_COMMAND), then tells the person what came back. That way a turn
//   runs end to end without a real model.
//
// Usage: node stand-in-api.mjs <port> <log file>
import { appendFileSync } from "node:fs";
import http from "node:http";

const [port, logFile] = [Number(process.argv[2] ?? 41400), process.argv[3] ?? "/tmp/stand-in-api.log"];
const PROBE_COMMAND = process.env.PROBE_COMMAND ?? "echo hello-from-the-hands; hostname; pwd; echo probe > probe-file.txt; ls -la probe-file.txt";
let turn = 0;

function sse(res, events) {
  res.writeHead(200, { "content-type": "text/event-stream", "cache-control": "no-cache" });
  for (const event of events) res.write(`data: ${JSON.stringify(event)}\n\n`);
  res.end();
}

// Only the newest item decides, so a chat that already holds an earlier
// turn's command still gets a new one:
// - the person's message: run PROBE_COMMAND with Shell;
// - Shell's result: say what came back with SendMessage (the agent's voice);
// - anything else (SendMessage's receipt, a side call): end in plain words.
function modelAnswer(body) {
  const tools = Array.isArray(body.tools) ? body.tools.map((tool) => tool.name).filter(Boolean) : [];
  const input = Array.isArray(body.input) ? body.input : [];
  const last = input.at(-1);
  const calls = new Map(input.filter((item) => item?.type === "function_call").map((item) => [item.call_id, item.name]));
  const usage = { input_tokens: 10, output_tokens: 5 };
  const created = { type: "response.created", response: { id: `resp_${++turn}`, created_at: Math.floor(Date.now() / 1000), model: String(body.model ?? "stand-in") } };
  const call = (name, args) => {
    const item = { type: "function_call", id: `fc_${turn}`, call_id: `call_${turn}`, name, arguments: JSON.stringify(args) };
    return [
      created,
      { type: "response.output_item.added", output_index: 0, item: { ...item, arguments: "" } },
      { type: "response.function_call_arguments.delta", item_id: item.id, output_index: 0, delta: item.arguments },
      { type: "response.output_item.done", output_index: 0, item: { ...item, status: "completed" } },
      { type: "response.completed", response: { usage } },
    ];
  };
  if (last?.role === "user" && tools.includes("Shell")) return { tools, kind: "shell", events: call("Shell", { command: PROBE_COMMAND }) };
  if (last?.type === "function_call_output" && calls.get(last.call_id) === "Shell" && tools.includes("SendMessage")) {
    return { tools, kind: "send-message", output: String(last.output ?? "").slice(0, 2000), events: call("SendMessage", { type: "text", content: `The computer said: ${String(last.output ?? "").slice(0, 400)}` }) };
  }
  const text = "Done.";
  return { tools, kind: "text", events: [
    created,
    { type: "response.output_item.added", output_index: 0, item: { type: "message" } },
    { type: "response.output_text.delta", delta: text },
    { type: "response.output_item.done", output_index: 0, item: { type: "message" } },
    { type: "response.completed", response: { usage } },
  ] };
}

http.createServer((req, res) => {
  const chunks = [];
  req.on("data", (chunk) => { chunks.push(chunk); });
  req.on("end", () => {
    const raw = Buffer.concat(chunks);
    const path = (req.url ?? "").split("?")[0];
    const line = { at: Date.now(), method: req.method, path, bytes: raw.length };
    if (req.method === "POST" && path === "/sand-box/inference-credential") {
      appendFileSync(logFile, `${JSON.stringify(line)}\n`);
      res.writeHead(200, { "content-type": "application/json" });
      return res.end(JSON.stringify({ accessToken: "stand-in", expiresAtMs: Date.now() + 60 * 60 * 1000 }));
    }
    if (req.method === "POST" && path.endsWith("/desktop/api/proxy/v1/responses")) {
      let body = {};
      try { body = JSON.parse(raw.toString("utf8")); } catch {}
      const answer = modelAnswer(body);
      appendFileSync(logFile, `${JSON.stringify({ ...line, model: body.model, answer: answer.kind, tools: answer.tools.length, ...(answer.output == null ? {} : { shellOutput: answer.output }) })}\n`);
      return sse(res, answer.events);
    }
    appendFileSync(logFile, `${JSON.stringify(line)}\n`);
    res.writeHead(404, { "content-type": "application/json" });
    res.end(JSON.stringify({ code: "not_found", message: "stand-in" }));
  });
}).listen(port, "127.0.0.1", () => console.log(`stand-in API on ${port}`));
