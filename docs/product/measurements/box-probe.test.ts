/**
 * BOX PROBE — measurement, not a feature.
 *
 * Registers a non-Docker sandbox backend ("box") that stands in for an E2B pod,
 * drives the engine's real sandbox paths against it, and counts round trips.
 * Every remote call goes through `hop()`, which charges an injectable RTT so we
 * can read the cost shape of driving a pod from the other side of the internet.
 */
import { spawn } from "node:child_process";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import type { OpenClawConfig } from "../../config/config.js";
import { registerSandboxBackend } from "./backend.js";
import type {
  SandboxBackendCommandParams,
  SandboxBackendCommandResult,
  SandboxBackendHandle,
} from "./backend-handle.types.js";
import { resolveSandboxContext } from "./context.js";
import { createRemoteShellSandboxFsBridge } from "./remote-fs-bridge.js";

vi.mock("./registry.js", () => ({ updateRegistry: vi.fn() }));
vi.mock("../../skills/loading/workspace.js", () => ({
  syncSkillsToWorkspace: vi.fn(async () => undefined),
}));
vi.mock("../../skills/runtime/remote.js", () => ({
  getRemoteSkillEligibility: vi.fn(() => ({ note: "box-probe" })),
}));
vi.mock("./exec-defaults.js", () => ({ canExecRequestNode: vi.fn(() => false) }));

/** Every trip the host makes to the pod, charged at `rttMs`. */
type Trip = { kind: "exec-spec" | "shell"; script: string; ms: number };

let rttMs = 0;
let trips: Trip[] = [];

async function hop<T>(kind: Trip["kind"], script: string, run: () => Promise<T>): Promise<T> {
  const started = performance.now();
  if (rttMs > 0) {
    await new Promise((resolve) => setTimeout(resolve, rttMs));
  }
  const out = await run();
  trips.push({ kind, script, ms: performance.now() - started });
  return out;
}

function runLocally(params: SandboxBackendCommandParams): Promise<SandboxBackendCommandResult> {
  return new Promise((resolve, reject) => {
    const child = spawn("sh", ["-c", params.script, "openclaw-sandbox-fs", ...(params.args ?? [])], {
      stdio: ["pipe", "pipe", "pipe"],
    });
    const out: Buffer[] = [];
    const err: Buffer[] = [];
    child.stdout?.on("data", (c) => out.push(Buffer.from(c)));
    child.stderr?.on("data", (c) => err.push(Buffer.from(c)));
    child.on("error", reject);
    child.on("close", (code) => {
      const result = { stdout: Buffer.concat(out), stderr: Buffer.concat(err), code: code ?? 0 };
      if (result.code !== 0 && !params.allowFailure) {
        reject(new Error(result.stderr.toString("utf8").trim() || `shell exited ${result.code}`));
        return;
      }
      resolve(result);
    });
    child.stdin?.end(params.stdin);
  });
}

let fixtureRoot = "";

beforeAll(async () => {
  fixtureRoot = await fs.realpath(await fs.mkdtemp(path.join(os.tmpdir(), "box-probe-")));
  registerSandboxBackend("box", {
    factory: async ({ workspaceDir, cfg }): Promise<SandboxBackendHandle> => ({
      id: "box",
      runtimeId: "box-pod-probe",
      runtimeLabel: "box-pod-probe",
      workdir: workspaceDir,
      env: cfg.docker.env,
      configLabel: "e2b:probe-template",
      configLabelKind: "Template",
      buildExecSpec: async ({ command, env }) =>
        await hop("exec-spec", command, async () => ({
          argv: ["sh", "-c", command],
          env,
          stdinMode: "pipe-closed" as const,
        })),
      runShellCommand: async (params) =>
        await hop("shell", params.script, async () => await runLocally(params)),
    }),
  });
  registerSandboxBackend("box-remote", {
    factory: async ({ workspaceDir, cfg }): Promise<SandboxBackendHandle> => {
      const runRemoteShellScript = async (params: SandboxBackendCommandParams) =>
        await hop("shell", params.script, async () => await runLocally(params));
      const handle: SandboxBackendHandle = {
        id: "box-remote",
        runtimeId: "box-pod-remote",
        runtimeLabel: "box-pod-remote",
        workdir: workspaceDir,
        env: cfg.docker.env,
        configLabel: "e2b:probe-template",
        configLabelKind: "Template",
        buildExecSpec: async ({ command, env }) =>
          await hop("exec-spec", command, async () => ({
            argv: ["sh", "-c", command],
            env,
            stdinMode: "pipe-closed" as const,
          })),
        runShellCommand: runRemoteShellScript,
        createFsBridge: ({ sandbox }) =>
          createRemoteShellSandboxFsBridge({
            sandbox,
            runtime: {
              remoteWorkspaceDir: workspaceDir,
              remoteAgentWorkspaceDir: workspaceDir,
              runRemoteShellScript,
            },
          }),
      };
      return handle;
    },
  });
});

afterAll(async () => {
  await fs.rm(fixtureRoot, { recursive: true, force: true });
});

async function openBox(name: string, backend = "box") {
  const workspaceDir = path.join(fixtureRoot, name);
  await fs.mkdir(workspaceDir, { recursive: true });
  const config: OpenClawConfig = {
    agents: {
      defaults: {
        sandbox: {
          mode: "all",
          backend,
          scope: "shared",
          workspaceAccess: "rw",
          prune: { idleHours: 0, maxAgeDays: 0 },
        },
      },
      list: [{ id: "main" }],
    },
  } as OpenClawConfig;
  return await resolveSandboxContext({
    config,
    sessionKey: "agent:main:probe",
    workspaceDir,
  });
}

describe("box probe: will the engine hold a session on a non-Docker backend?", () => {
  it("resolves a live sandbox context on a backend the engine has never heard of", async () => {
    trips = [];
    rttMs = 0;
    const ctx = await openBox("hold");
    expect(ctx).not.toBeNull();
    expect(ctx?.enabled).toBe(true);
    expect(ctx?.backendId).toBe("box");
    expect(ctx?.runtimeId).toBe("box-pod-probe");
    // The engine hands back a usable fs bridge built from our runShellCommand.
    expect(ctx?.fsBridge).toBeTruthy();
    // No Docker was contacted.
    console.log(`[probe] context held: backendId=${ctx?.backendId} runtime=${ctx?.runtimeLabel}`);
  }, 30_000);

  it("counts round trips for the exec path and the fs bridge", async () => {
    const ctx = await openBox("count");
    expect(ctx).not.toBeNull();
    const bridge = ctx!.fsBridge!;

    const measure = async (label: string, run: () => Promise<unknown>) => {
      trips = [];
      const started = performance.now();
      await run();
      const wall = performance.now() - started;
      console.log(
        `[probe] ${label}: trips=${trips.length} wall=${wall.toFixed(1)}ms ` +
          `kinds=${trips.map((t) => t.kind).join(",")}`,
      );
      return { count: trips.length, wall };
    };

    const results: Record<string, { count: number; wall: number }> = {};
    results.execSpec = await measure("Shell tool call (buildExecSpec)", async () => {
      await ctx!.backend!.buildExecSpec({
        command: "echo hello",
        env: {},
        usePty: false,
      });
    });
    results.writeFile = await measure("fsBridge.writeFile", async () => {
      await bridge.writeFile({ filePath: "a/b/hello.txt", data: "hi" });
    });
    results.readFile = await measure("fsBridge.readFile", async () => {
      await bridge.readFile({ filePath: "a/b/hello.txt" });
    });
    results.stat = await measure("fsBridge.stat", async () => {
      await bridge.stat({ filePath: "a/b/hello.txt" });
    });
    results.mkdirp = await measure("fsBridge.mkdirp", async () => {
      await bridge.mkdirp({ filePath: "c/d" });
    });
    results.rename = await measure("fsBridge.rename", async () => {
      await bridge.rename({ from: "a/b/hello.txt", to: "a/b/moved.txt" });
    });
    results.remove = await measure("fsBridge.remove", async () => {
      await bridge.remove({ filePath: "a/b/moved.txt" });
    });

    console.log(`[probe] ROUND TRIP TABLE ${JSON.stringify(results, null, 2)}`);
    // THE FINDING: readFile costs zero trips because the default bridge reads the
    // file off the HOST filesystem (fs.readFileSync on a host fd) — it assumes the
    // workspace is bind-mounted, which is true for Docker and false for a pod.
    expect(results.readFile.count).toBe(0);
    // Every mutating op does go through the backend.
    expect(results.writeFile.count).toBeGreaterThan(0);
    expect(results.execSpec.count).toBe(1);
  }, 60_000);

  it("shows what an injected RTT costs per operation", async () => {
    const ctx = await openBox("latency");
    const bridge = ctx!.fsBridge!;
    for (const rtt of [0, 40, 120]) {
      rttMs = rtt;
      trips = [];
      const started = performance.now();
      await bridge.writeFile({ filePath: `rtt-${rtt}.txt`, data: "x" });
      await bridge.readFile({ filePath: `rtt-${rtt}.txt` });
      await ctx!.backend!.buildExecSpec({ command: "ls", env: {}, usePty: false });
      const wall = performance.now() - started;
      console.log(
        `[probe] RTT=${rtt}ms -> write+read+exec trips=${trips.length} wall=${wall.toFixed(1)}ms`,
      );
    }
    rttMs = 0;
  }, 60_000);
});

describe("box probe: the remote fs bridge, which is the path an E2B backend must take", () => {
  it("counts round trips when the workspace is NOT on the host disk", async () => {
    const ctx = await openBox("remote", "box-remote");
    expect(ctx).not.toBeNull();
    expect(ctx?.backendId).toBe("box-remote");
    const bridge = ctx!.fsBridge!;

    const measure = async (label: string, run: () => Promise<unknown>) => {
      trips = [];
      await run();
      console.log(`[probe-remote] ${label}: trips=${trips.length}`);
      return trips.length;
    };

    const results: Record<string, number> = {};
    results.writeFile = await measure("writeFile", () =>
      bridge.writeFile({ filePath: "r/hello.txt", data: "hi" }),
    );
    results.readFile = await measure("readFile", () =>
      bridge.readFile({ filePath: "r/hello.txt" }),
    );
    results.stat = await measure("stat", () => bridge.stat({ filePath: "r/hello.txt" }));
    results.mkdirp = await measure("mkdirp", () => bridge.mkdirp({ filePath: "r/sub" }));
    results.rename = await measure("rename", () =>
      bridge.rename({ from: "r/hello.txt", to: "r/moved.txt" }),
    );
    results.remove = await measure("remove", () => bridge.remove({ filePath: "r/moved.txt" }));

    console.log(`[probe-remote] REMOTE ROUND TRIP TABLE ${JSON.stringify(results)}`);
    // The whole point: with no bind mount, even a read is a round trip.
    expect(results.readFile).toBeGreaterThan(0);
  }, 60_000);
});
