// 1Password's command-line tool on the agent's computer (28 October 2026),
// for the 1Password fill card. The computer's image has none, so the engine
// fetches one pinned version from 1Password's own server the first time it is
// needed, checks the archive against the checksums below (taken from archives
// whose `op` carried a good signature from 1Password's code-signing key,
// fingerprint 3FEF 9748 469A DBE1 5DA7 CA80 AC2D 6274 2012 EA22), and keeps
// the tool in the engine's own folder. It is run only by the engine, with the
// person's read-only service-account key in its environment; never through
// the agent's shell, and nothing it prints is logged.

import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import { chmodSync, existsSync, mkdirSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { inflateRawSync } from "node:zlib";

export const OP_CLI_VERSION = "2.40.0";

const ARCHIVE_BASE = `https://cache.agilebits.com/dist/1P/op2/pkg/v${OP_CLI_VERSION}`;

/** The archive for each processor the computer may have, and its SHA-256. */
export const OP_CLI_ARCHIVES: Readonly<Record<string, { readonly url: string; readonly sha256: string }>> = {
  x64: { url: `${ARCHIVE_BASE}/op_linux_amd64_v${OP_CLI_VERSION}.zip`, sha256: "74277219e8da60958c00f9aee9d2023225e98fdda8bfd2156a5d9e85e0edaab3" },
  arm64: { url: `${ARCHIVE_BASE}/op_linux_arm64_v${OP_CLI_VERSION}.zip`, sha256: "0e8ac99ee93d661aa725dc24a5ef8bf344741d224064a5dfb469dc689faec86a" },
};

const MAX_ARCHIVE_BYTES = 64 * 1024 * 1024;
const MAX_EXECUTABLE_BYTES = 128 * 1024 * 1024;

export class OpCliError extends Error {
  override readonly name = "OpCliError";
}

interface ZipEntry { readonly name: string; readonly compression: number; readonly compressedSize: number; readonly size: number; readonly externalAttributes: number; readonly localOffset: number }

function zipEntries(bytes: Buffer): ZipEntry[] {
  let end = -1;
  for (let offset = Math.max(0, bytes.length - 65_557); offset <= bytes.length - 22; offset += 1) if (bytes.readUInt32LE(offset) === 0x06054b50) end = offset;
  if (end < 0) throw new OpCliError("1Password's archive is not a zip.");
  const count = bytes.readUInt16LE(end + 10), centralSize = bytes.readUInt32LE(end + 12), centralOffset = bytes.readUInt32LE(end + 16);
  if (centralOffset + centralSize > bytes.length || count > 16) throw new OpCliError("1Password's archive is damaged.");
  const entries: ZipEntry[] = [];
  let offset = centralOffset;
  for (let index = 0; index < count; index += 1) {
    if (bytes.readUInt32LE(offset) !== 0x02014b50) throw new OpCliError("1Password's archive is damaged.");
    const nameLength = bytes.readUInt16LE(offset + 28), extraLength = bytes.readUInt16LE(offset + 30), commentLength = bytes.readUInt16LE(offset + 32);
    entries.push({
      name: bytes.subarray(offset + 46, offset + 46 + nameLength).toString("utf8"),
      compression: bytes.readUInt16LE(offset + 10),
      compressedSize: bytes.readUInt32LE(offset + 20),
      size: bytes.readUInt32LE(offset + 24),
      externalAttributes: bytes.readUInt32LE(offset + 38),
      localOffset: bytes.readUInt32LE(offset + 42),
    });
    offset += 46 + nameLength + extraLength + commentLength;
  }
  return entries;
}

/** The `op` executable from 1Password's archive, which holds `op` and its signature and nothing else. */
export function opFromArchive(archive: Uint8Array): Buffer {
  if (archive.byteLength === 0 || archive.byteLength > MAX_ARCHIVE_BYTES) throw new OpCliError("1Password's archive is not the expected size.");
  const bytes = Buffer.from(archive.buffer, archive.byteOffset, archive.byteLength);
  const entries = zipEntries(bytes);
  const names = entries.map((entry) => entry.name).sort();
  if (names.join(",") !== "op,op.sig") throw new OpCliError("1Password's archive holds something unexpected.");
  const op = entries.find((entry) => entry.name === "op") as ZipEntry;
  if (op.size <= 0 || op.size > MAX_EXECUTABLE_BYTES || ((op.externalAttributes >>> 16) & 0xf000) === 0xa000) throw new OpCliError("1Password's archive holds no usable op.");
  const at = op.localOffset;
  if (bytes.readUInt32LE(at) !== 0x04034b50) throw new OpCliError("1Password's archive is damaged.");
  const start = at + 30 + bytes.readUInt16LE(at + 26) + bytes.readUInt16LE(at + 28);
  const packed = bytes.subarray(start, start + op.compressedSize);
  const data = op.compression === 0 ? Buffer.from(packed) : op.compression === 8 ? inflateRawSync(packed) : undefined;
  if (data == null || data.length !== op.size) throw new OpCliError("1Password's archive is damaged.");
  return data;
}

const installing = new Map<string, Promise<string>>();

/**
 * The path of the pinned `op` in `dir`, fetched and checked the first time.
 * A download whose checksum differs is refused and nothing is written.
 */
export function ensureOpCli(dir: string, options: { readonly fetchImpl?: typeof fetch; readonly arch?: string } = {}): Promise<string> {
  const folder = join(dir, `op-${OP_CLI_VERSION}`);
  const path = join(folder, "op");
  if (existsSync(path)) return Promise.resolve(path);
  const pending = installing.get(path);
  if (pending != null) return pending;
  const work = (async () => {
    const archive = OP_CLI_ARCHIVES[options.arch ?? process.arch];
    if (archive == null) throw new OpCliError(`1Password's tool isn't made for this computer's processor (${options.arch ?? process.arch}).`);
    const response = await (options.fetchImpl ?? fetch)(archive.url, { signal: AbortSignal.timeout(90_000), redirect: "follow" });
    if (!response.ok) throw new OpCliError(`1Password's server answered ${response.status} for its tool.`);
    const bytes = new Uint8Array(await response.arrayBuffer());
    const digest = createHash("sha256").update(bytes).digest("hex");
    if (digest !== archive.sha256) throw new OpCliError("1Password's tool didn't match its checksum, so it wasn't installed.");
    const op = opFromArchive(bytes);
    mkdirSync(folder, { recursive: true, mode: 0o700 });
    const partial = `${path}.partial-${process.pid}`;
    writeFileSync(partial, op, { mode: 0o700 });
    chmodSync(partial, 0o700);
    renameSync(partial, path);
    return path;
  })().finally(() => installing.delete(path));
  installing.set(path, work);
  return work;
}

export type OpResult = { readonly ok: true; readonly stdout: string } | { readonly ok: false; readonly message: string };

/** 1Password's own sentence from what `op` printed on failure, without its "[ERROR] date time" prefix. */
export function opMessage(stderr: string): string {
  const line = stderr.split("\n").map((part) => part.replace(/^\[ERROR\]\s*\S+\s+\S+\s*/, "").trim()).find((part) => part.length > 0) ?? "";
  return line.length > 0 ? line.slice(0, 300) : "1Password didn't answer.";
}

/**
 * Runs `op` with the service-account key in its environment and nothing
 * else of the engine's: no shell, a private home for its settings, its
 * output returned to the caller only.
 */
export function runOp(opPath: string, args: readonly string[], options: { readonly token: string; readonly home: string; readonly timeoutMs?: number }): Promise<OpResult> {
  mkdirSync(options.home, { recursive: true, mode: 0o700 });
  const env: NodeJS.ProcessEnv = {
    PATH: "/usr/local/bin:/usr/bin:/bin",
    HOME: options.home,
    XDG_CONFIG_HOME: join(options.home, ".config"),
    OP_SERVICE_ACCOUNT_TOKEN: options.token,
    OP_CACHE: "false",
    OP_DISABLE_PROMPTS: "true",
  };
  return new Promise((resolve) => {
    execFile(opPath, [...args], { env, timeout: options.timeoutMs ?? 30_000, maxBuffer: 4 * 1024 * 1024, windowsHide: true }, (error, stdout, stderr) => {
      if (error == null) resolve({ ok: true, stdout: String(stdout) });
      else resolve({ ok: false, message: (error as { killed?: boolean }).killed === true ? "1Password took too long to answer." : opMessage(String(stderr)) });
    });
  });
}

/** Leaves no partly written tool behind (a test's folder). */
export function removeOpCli(dir: string): void {
  rmSync(join(dir, `op-${OP_CLI_VERSION}`), { recursive: true, force: true });
}
