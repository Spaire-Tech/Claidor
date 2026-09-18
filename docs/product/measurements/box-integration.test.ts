/**
 * Does the engine hold a session on the REAL box backend?
 *
 * The earlier probe used a stub. This one imports the actual plugin code from
 * `desktop/openclaw-extensions/box` and drives the engine's own
 * `resolveSandboxContext` against it, with the broker replaced by a fake fetch.
 * Nothing here contacts E2B or the Caisra server.
 */
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import type { OpenClawConfig } from "../../config/config.js";
import { registerSandboxBackend } from "./backend.js";
import { resolveSandboxContext } from "./context.js";

import {
  createBoxSandboxBackendFactory,
  createBoxSandboxBackendManager,
} from "../../../box-plugin/backend.js";

vi.mock("./registry.js", () => ({ updateRegistry: vi.fn() }));
vi.mock("../../skills/loading/workspace.js", () => ({
  syncSkillsToWorkspace: vi.fn(async () => undefined),
}));
vi.mock("../../skills/runtime/remote.js", () => ({
  getRemoteSkillEligibility: vi.fn(() => ({ note: "box-integration" })),
}));
vi.mock("./exec-defaults.js", () => ({ canExecRequestNode: vi.fn(() => false) }));

type Call = { url: string; init: RequestInit };
let calls: Call[] = [];
const files = new Map<string, string>();

/**
 * Run one script the way a pod would: a real child process with a real stdin
 * that actually closes. `execFile` has no `input` option, and a script like
 * `cat` waits forever without one.
 */
async function runInFakePod(
  script: string,
  args: string[],
  stdinBase64: string | undefined,
  cwd: string,
): Promise<{ stdoutBase64: string; stderrBase64: string; exitCode: number }> {
  const { spawn } = await import("node:child_process");
  return await new Promise((resolve, reject) => {
    const child = spawn("sh", ["-c", script, "openclaw-sandbox-fs", ...args], {
      cwd,
      stdio: ["pipe", "pipe", "pipe"],
    });
    const out: Buffer[] = [];
    const err: Buffer[] = [];
    child.stdout.on("data", (c) => out.push(Buffer.from(c)));
    child.stderr.on("data", (c) => err.push(Buffer.from(c)));
    child.on("error", reject);
    child.on("close", (code) => {
      resolve({
        stdoutBase64: Buffer.concat(out).toString("base64"),
        stderrBase64: Buffer.concat(err).toString("base64"),
        exitCode: code ?? 0,
      });
    });
    child.stdin.end(stdinBase64 ? Buffer.from(stdinBase64, "base64") : undefined);
  });
}

/** A broker that runs the box's shell scripts in a local temp dir. */
function brokerFetch(boxRoot: string): typeof fetch {
  return (async (url: string | URL, init: RequestInit = {}) => {
    const href = String(url);
    calls.push({ url: href, init });
    const body = init.body ? JSON.parse(String(init.body)) : {};
    const json = (value: unknown) => ({
      ok: true,
      status: 200,
      json: async () => value,
      text: async () => "",
    });

    if (href.endsWith("/api/box/sandboxes") && init.method === "POST") {
      // A real broker knows where its template keeps things and says so.
      return json({
        boxId: "box_integration",
        running: true,
        template: "caisra-box-base",
        workspaceDir: path.join(boxRoot, "workspace"),
        agentWorkspaceDir: path.join(boxRoot, "agent"),
      });
    }
    if (href.includes("/shell")) {
      const result = await runInFakePod(body.script, body.args ?? [], body.stdinBase64, boxRoot);
      return json(result);
    }
    if (href.includes("/sandboxes/") && init.method === "DELETE") {
      files.clear();
      return json({});
    }
    if (href.includes("/sandboxes/")) {
      return json({ boxId: "box_integration", running: true, template: "caisra-box-base" });
    }
    return json({});
  }) as unknown as typeof fetch;
}

const config = {
  brokerBaseUrl: "https://broker.test",
  accessToken: "integration-token",
  template: "caisra-box-base",
};

let fixtureRoot = "";
let boxRoot = "";

beforeAll(async () => {
  fixtureRoot = await fs.realpath(await fs.mkdtemp(path.join(os.tmpdir(), "box-integration-")));
  // The "box" filesystem: a directory that is emphatically NOT the workspace
  // the engine thinks it has on this machine.
  boxRoot = path.join(fixtureRoot, "pod");
  await fs.mkdir(path.join(boxRoot, "workspace"), { recursive: true });
  await fs.mkdir(path.join(boxRoot, "agent"), { recursive: true });
  registerSandboxBackend("box", {
    factory: createBoxSandboxBackendFactory({ config, fetchImpl: brokerFetch(boxRoot) }),
    manager: createBoxSandboxBackendManager({ config, fetchImpl: brokerFetch(boxRoot) }),
  });
});

afterAll(async () => {
  await fs.rm(fixtureRoot, { recursive: true, force: true });
});

async function openBox(name: string) {
  const workspaceDir = path.join(fixtureRoot, name);
  await fs.mkdir(workspaceDir, { recursive: true });
  const cfg: OpenClawConfig = {
    agents: {
      defaults: {
        sandbox: {
          mode: "all",
          backend: "box",
          scope: "shared",
          workspaceAccess: "rw",
          prune: { idleHours: 0, maxAgeDays: 0 },
        },
      },
      list: [{ id: "main" }],
    },
  } as OpenClawConfig;
  return await resolveSandboxContext({ config: cfg, sessionKey: "agent:main:box", workspaceDir });
}

describe("the real box backend, inside the engine", () => {
  it("holds a session and reports the broker's box id as the runtime", async () => {
    calls = [];
    const ctx = await openBox("hold");
    expect(ctx?.enabled).toBe(true);
    expect(ctx?.backendId).toBe("box");
    // Not a name we invented: the id the broker gave us, which is the only
    // handle removeRuntime will get later.
    expect(ctx?.runtimeId).toBe("box_integration");
    expect(ctx?.runtimeLabel).toBe("caisra-box-shared");
    // The engine asked the broker for a box exactly once to open the session.
    expect(calls.filter((c) => c.url.endsWith("/api/box/sandboxes")).length).toBe(1);
  }, 30_000);

  it("takes its workdir from the broker, not from a hardcoded guess", async () => {
    const ctx = await openBox("workdir");
    expect(ctx?.containerWorkdir).toBe(path.join(boxRoot, "workspace"));
  }, 30_000);

  it("falls back to the box default when the broker says nothing", async () => {
    const { resolveBoxRuntimePaths, BOX_WORKSPACE_ROOT } = await import(
      "../../../box-plugin/backendSpec.js"
    );
    expect(resolveBoxRuntimePaths("shared", {}).remoteWorkspaceDir).toBe(BOX_WORKSPACE_ROOT);
    // A relative path is not a decision the broker gets to leave open.
    expect(
      resolveBoxRuntimePaths("shared", { workspaceDir: "relative/path" }).remoteWorkspaceDir,
    ).toBe(BOX_WORKSPACE_ROOT);
  }, 30_000);

  it("does not claim a browser it cannot serve", async () => {
    const ctx = await openBox("browser");
    expect(ctx?.backend?.capabilities?.browser).toBe(false);
  }, 30_000);

  it("reads and writes through the box, never the host disk", async () => {
    const ctx = await openBox("files");
    const bridge = ctx!.fsBridge!;
    await bridge.writeFile({ filePath: "note.txt", data: "written in the box" });

    // The bytes are in the fake pod...
    const inBox = await fs.readFile(path.join(boxRoot, "workspace", "note.txt"), "utf8");
    expect(inBox).toBe("written in the box");

    // ...and NOT in the workspace directory on this machine. This is the
    // failure the default fs bridge would have produced.
    await expect(
      fs.readFile(path.join(fixtureRoot, "files", "note.txt"), "utf8"),
    ).rejects.toThrow();

    const read = await bridge.readFile({ filePath: "note.txt" });
    expect(read.toString("utf8")).toBe("written in the box");
  }, 30_000);

  it("builds an exec spec that runs the bridge, with the token out of argv", async () => {
    const ctx = await openBox("exec");
    const spec = await ctx!.backend!.buildExecSpec({
      command: "echo hello",
      env: {},
      usePty: false,
    });
    expect(spec.argv[0]).toBe(process.execPath);
    expect(spec.argv[1]).toMatch(/execBridge\.mjs$/);
    expect(spec.argv.join(" ")).not.toContain("integration-token");
    expect(spec.env.CAISRA_BOX_ID).toBe("box_integration");
    expect(spec.env.CAISRA_BOX_TOKEN).toBe("integration-token");
  }, 30_000);

  it("refuses bind mounts rather than silently reading the wrong disk", async () => {
    const workspaceDir = path.join(fixtureRoot, "binds");
    await fs.mkdir(workspaceDir, { recursive: true });
    const cfg: OpenClawConfig = {
      agents: {
        defaults: {
          sandbox: {
            mode: "all",
            backend: "box",
            scope: "shared",
            docker: { binds: ["/Users/me/docs:/data"] },
            prune: { idleHours: 0, maxAgeDays: 0 },
          },
        },
        list: [{ id: "main" }],
      },
    } as OpenClawConfig;
    await expect(
      resolveSandboxContext({ config: cfg, sessionKey: "agent:main:box", workspaceDir }),
    ).rejects.toThrow(/does not support sandbox.docker.binds/);
  }, 30_000);
});
