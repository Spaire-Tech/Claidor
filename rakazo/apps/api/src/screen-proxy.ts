import { timingSafeEqual } from "node:crypto";
import { hasActiveComputerControl } from "@rakazo/adapters";
import type { ScreenCapabilityScope } from "@rakazo/core/node/screen-capability";
import {
  openScreenCapability,
  SCREEN_TARGET_ENDPOINT,
  sealScreenCapability,
} from "@rakazo/core/node/screen-capability";
import type { PrismaClient } from "@rakazo/db";
import { getLogger } from "@rakazo/logging";
import type { Hono } from "hono";
import { requestBodyLimit } from "./request-body-limit.js";

export function addScreenProxyCapability(
  url: string,
  secret: string,
  origin: string,
  scope: ScreenCapabilityScope,
  now = Date.now(),
) {
  // Local/desktop providers return non-http schemes (e.g. desktop://). Those never
  // traverse the web proxy, so seal only http(s) upstream URLs.
  const protocol = new URL(url).protocol;
  if (protocol !== "http:" && protocol !== "https:") return url;
  return sealScreenCapability(url, secret, origin, scope, now);
}

/**
 * Every refusal here is an empty 403, which is right on the wire and useless in
 * a log. The web proxy rechecks an open stream every `SCREEN_RECHECK_MS`, so a
 * screen that stops working produces one indistinguishable 403 per second per
 * stream, and six different causes look identical.
 *
 * So each refusal names itself, once, at warn level. No secret, no sealed path,
 * no upstream URL — only which branch refused and the scope ids needed to look
 * the row up. `stale_capability` and `computer_not_running` in particular have
 * the same shape from outside and completely different fixes.
 */
function refuse(reason: string, fields: Record<string, unknown> = {}) {
  getLogger().warn("screen target refused", { reason, ...fields });
}

export function mountScreenTarget(app: Hono, prisma: PrismaClient, secret: string) {
  app.post(SCREEN_TARGET_ENDPOINT, requestBodyLimit(16 * 1024), async (c) => {
    c.header("cache-control", "no-store");
    const supplied = Buffer.from(c.req.header("authorization") ?? "");
    const expected = Buffer.from(`Bearer ${secret}`);
    if (!secret || supplied.length !== expected.length || !timingSafeEqual(supplied, expected)) {
      // Configuration, not state: the web service and the API disagree about
      // SCREEN_PROXY_SECRET, or one of them has none.
      refuse(secret ? "bad_proxy_secret" : "no_proxy_secret_configured");
      return c.body(null, 403);
    }
    const body = await c.req.json().catch(() => null);
    if (typeof body?.path !== "string") {
      refuse("malformed_request");
      return c.body(null, 403);
    }
    const capability = openScreenCapability(body.path, secret);
    if (!capability) {
      // Sealed with a different secret, tampered with, or simply older than
      // SCREEN_PROXY_TTL_MS. A screen left open past that hour lands here, and
      // reloading the page mints a fresh one.
      refuse("stale_capability");
      return c.body(null, 403);
    }
    const { scope, target } = capability;
    const bot = await prisma.bot.findFirst({
      where: {
        id: scope.botId,
        computerId: scope.computerId,
        archivedAt: null,
        screenGeneration: scope.botGeneration,
      },
      select: {
        computer: {
          select: {
            screenGeneration: true,
            providerRef: true,
            state: true,
            controlHolder: true,
            controlLeaseId: true,
            controlBotId: true,
            controlLeaseExpiresAt: true,
          },
        },
      },
    });
    const computer = bot?.computer;
    // Split from one boolean into named causes. The condition is unchanged —
    // same checks, same order, same refusal — but a screen that dies because
    // the sandbox went away no longer reads like one that died because a
    // control lease lapsed.
    const denial = !computer
      ? "bot_or_computer_missing"
      : computer.screenGeneration !== scope.computerGeneration
        ? "computer_generation_changed"
        : !computer.providerRef
          ? "computer_not_provisioned"
          : !["running", "booting"].includes(computer.state)
            ? "computer_not_running"
            : target.interactive &&
                (!hasActiveComputerControl(computer) ||
                  !scope.controlLeaseId ||
                  computer.controlLeaseId !== scope.controlLeaseId ||
                  computer.controlBotId !== scope.botId)
              ? "control_lease_not_held"
              : null;
    if (denial) {
      refuse(denial, {
        botId: scope.botId,
        computerId: scope.computerId,
        computerState: computer?.state,
        interactive: target.interactive,
      });
      return c.body(null, 403);
    }
    return c.json(target);
  });
}
