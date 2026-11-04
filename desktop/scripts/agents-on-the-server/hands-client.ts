// The engine's own client for the hands program, run from another process at
// a non-loopback address (step 0 of docs/agents-on-the-server/README.md):
// a ping, commands, a file written and read back, a wrong token. Prints one
// JSON line of what it measured.
import { productionBoxGeneratedPorts } from "../../source/host/box/generated-production.js";
import { createBoxTransport, createBoxRemoteResourceAccessorFromTransport, pingBoxTransportClassified } from "../../source/host/box/box-remote-accessor.js";
import { buildHostShellArgs } from "../../source/host/box/box-shell-command.js";
import { shellExecutorResource } from "../../source/packages/agent-exec/shell.js";
import { writeExecutorResource } from "../../source/packages/agent-exec/write.js";
import { readExecutorResource } from "../../source/packages/agent-exec/read.js";
import { createContext } from "../../source/packages/context/core.js";
import { WriteArgs } from "../../source/packages/proto/generated/agent/v1/write_exec_pb.js";
import { ReadArgs } from "../../source/packages/proto/generated/agent/v1/read_exec_pb.js";

const host = process.env.PROBE_HOST ?? "127.0.0.1";
const port = Number.parseInt(process.env.PROBE_PORT ?? "1337", 10);
const token = process.env.PROBE_TOKEN ?? "";
const workspace = process.env.PROBE_WORKSPACE ?? "/tmp/probe-workspace";
const generated = productionBoxGeneratedPorts as any;
const ctx = createContext();
const out: Record<string, unknown> = { host, port };
const ms = async <T>(work: () => Promise<T>) => { const started = performance.now(); const value = await work(); return { value, ms: Math.round((performance.now() - started) * 10) / 10 }; };
const median = (values: number[]) => [...values].sort((a, b) => a - b)[Math.floor(values.length / 2)];

const transport = createBoxTransport({ host, port, authToken: token }, generated.createTransport);
const ping = await ms(() => pingBoxTransportClassified(ctx, transport, generated.createControlClient));
out.ping = { outcome: (ping.value as any).outcome, ms: ping.ms };

const accessor: any = createBoxRemoteResourceAccessorFromTransport(transport, generated);
const shell = accessor.get(shellExecutorResource);
const run = (command: string) => shell.execute(ctx, buildHostShellArgs({ command, name: "probe", workingDirectory: workspace, toolCallId: "probe" }));
const first = await ms(() => run("echo hello-from-the-hands; uname -s"));
const result = (first.value as any).result;
out.shell = { case: result.case, exitCode: result.value?.exitCode, stdout: String(result.value?.stdout ?? "").trim(), firstMs: first.ms };
const times: number[] = [];
for (let i = 0; i < 20; i += 1) times.push((await ms(() => run("true"))).ms);
out.shellMedianMs = median(times);

const bytes = new Uint8Array(100_000).map((_, i) => i % 251);
try {
  const write = await ms(() => accessor.get(writeExecutorResource).execute(ctx, new WriteArgs({ path: `${workspace}/probe.bin`, fileBytes: bytes, toolCallId: "probe" })));
  out.write = { case: (write.value as any).result.case, ms: write.ms, bytes: bytes.length };
} catch (error) {
  out.write = { error: error instanceof Error ? error.message : String(error) };
  // The same bytes through a command, as a fallback would send them.
  // One command can't carry 100 KB (spawn E2BIG): the bytes go in 30 KB pieces.
  const viaShell = await ms(async () => {
    await run(`: > ${workspace}/probe.bin`);
    let last: any;
    for (let at = 0; at < bytes.length; at += 30_000) {
      const piece = Buffer.from(bytes.subarray(at, at + 30_000)).toString("base64");
      last = await run(`printf %s '${piece}' | base64 -d >> ${workspace}/probe.bin`);
    }
    return last;
  });
  out.writeViaShell = { case: (viaShell.value as any).result.case, ms: viaShell.ms, pieces: Math.ceil(bytes.length / 30_000) };
}
const back = await ms(() => run(`wc -c < ${workspace}/probe.bin`));
out.writtenSize = Number.parseInt(String((back.value as any).result.value?.stdout ?? "0").trim(), 10);
await run(`printf 'line one\\nline two\\n' > ${workspace}/probe.txt`);
const read = await ms(() => accessor.get(readExecutorResource).execute(ctx, new ReadArgs({ path: `${workspace}/probe.txt`, toolCallId: "probe" })));
const readResult = (read.value as any).result;
out.read = { case: readResult.case, ms: read.ms, content: readResult.case === "success" && readResult.value.output.case === "content" ? readResult.value.output.value : null };

const wrong = createBoxTransport({ host, port, authToken: "wrong" }, generated.createTransport);
const refused = await pingBoxTransportClassified(ctx, wrong, generated.createControlClient);
out.wrongToken = (refused as any).outcome;
process.stdout.write(`${JSON.stringify(out)}\n`);
process.exit(0);
