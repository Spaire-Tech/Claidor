#!/usr/bin/env node
/**
 * Which wallpaper tone it is now, and how long until the next change.
 *
 *   node sand-wallpaper-tone.mjs <settings.json>        → "a 14400"
 *   node sand-wallpaper-tone.mjs zone <settings.json>   → "Europe/Paris" (exit 1: none)
 *
 * The host parses the first form as "<tone> <seconds>" (box-wallpaper-
 * commands.ts, parseTonePlan). The zone is the person's, from the host's
 * settings file (userTimeZoneOverride, then userTimeZone), else UTC.
 * Schedule, local time: b from 04:00, a from 08:00, b from 16:00, c from
 * 20:00. The sleep is clamped to [30 s, 13 h].
 */
import { readFileSync } from "node:fs";

const BOUNDARIES = [[4, "b"], [8, "a"], [16, "b"], [20, "c"]];
const MIN_SLEEP_S = 30;
const MAX_SLEEP_S = 46_800;

function readZone(settingsPath) {
  let settings;
  try { settings = JSON.parse(readFileSync(settingsPath, "utf8")); } catch { return undefined; }
  for (const key of ["userTimeZoneOverride", "userTimeZone"]) {
    const value = settings?.[key];
    if (typeof value !== "string" || value.trim().length === 0) continue;
    try { return new Intl.DateTimeFormat("en-US", { timeZone: value.trim() }).resolvedOptions().timeZone; } catch {}
  }
  return undefined;
}

function localParts(date, zone) {
  const parts = new Intl.DateTimeFormat("en-US", { timeZone: zone, hour12: false, hour: "2-digit", minute: "2-digit", second: "2-digit" }).formatToParts(date);
  const get = type => Number.parseInt(parts.find(part => part.type === type)?.value ?? "0", 10) % 24;
  return { hour: get("hour"), minute: Number.parseInt(parts.find(part => part.type === "minute")?.value ?? "0", 10), second: Number.parseInt(parts.find(part => part.type === "second")?.value ?? "0", 10) };
}

function plan(now, zone) {
  const { hour, minute, second } = localParts(now, zone);
  const secondOfDay = hour * 3600 + minute * 60 + second;
  let tone = "c";
  let nextBoundary = BOUNDARIES[0][0] * 3600 + 86_400;
  for (const [startHour, startTone] of BOUNDARIES) {
    const start = startHour * 3600;
    if (secondOfDay >= start) tone = startTone;
    else { nextBoundary = start; break; }
  }
  const sleep = Math.min(MAX_SLEEP_S, Math.max(MIN_SLEEP_S, nextBoundary - secondOfDay));
  return { tone, sleep };
}

const args = process.argv.slice(2);
if (args[0] === "zone") {
  const zone = readZone(args[1] ?? "");
  if (zone == null || /^(UTC|Etc\/UTC|GMT|Etc\/GMT)$/.test(zone)) process.exit(1);
  process.stdout.write(`${zone}\n`);
} else {
  const zone = readZone(args[0] ?? "") ?? "UTC";
  const { tone, sleep } = plan(new Date(), zone);
  process.stdout.write(`${tone} ${sleep}\n`);
}
