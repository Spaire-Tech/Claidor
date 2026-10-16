/**
 * The phone's whole computer (15 October 2026, `ios/Simeon/ComputerZoom.swift`):
 * the phone's own gestures reach the computer as the mouse, through the
 * screen page's `simeonClick`, `simeonWheel` and `simeonPointer`
 * (`LiveScreen.page`, `ios/Simeon/Computer.swift`) and the bundled noVNC.
 * Here the real page, built from the app's own template with the bundled
 * noVNC, runs in Chromium at a phone's size (the computer's 1280 by 800
 * fitted to 390 points) against a small VNC server, which records the
 * pointer events the computer would get. Checked by hand the same day
 * against x11vnc on Xvfb: the same clicks, wheel turns and drag arrived as
 * X button events at the same pixels.
 */
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { createServer } from "node:http";
import { createRequire } from "node:module";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const chromiumPath = process.env.SIMEON_CHROMIUM ?? "/opt/pw-browsers/chromium-1194/chrome-linux/chrome";

/** The page as `LiveScreen.page(socket:viewOnly: false)` writes it: the Swift template, its interpolations filled in. */
function phonePage(socketUrl) {
  const swift = readFileSync(path.join(repoRoot, "ios/Simeon/Computer.swift"), "utf8");
  const start = swift.indexOf('    return """\n    <!doctype html>');
  assert.ok(start > 0, "the page template is in Computer.swift");
  let body = swift.slice(start + '    return """\n'.length);
  body = body.slice(0, body.indexOf('\n    """\n'));
  body = body.split("\n").map((line) => (line.startsWith("    ") ? line.slice(4) : line)).join("\n");
  const client = readFileSync(path.join(repoRoot, "ios/Simeon/Computer/novnc-rfb.js"), "utf8");
  body = body
    .replace("\\(client)", "@@CLIENT@@")
    .replace("\\(address)", JSON.stringify([socketUrl]))
    .replace('\\(viewOnly ? "true" : "false")', "false")
    .replace('\\(focusOnClick ? "true" : "false")', "false")
    .replace('\\(interactive ? "true" : "false")', "false");
  assert.ok(!body.includes("\\("), "every interpolation is filled in");
  return body.replaceAll("\\\\", "\\").replace("@@CLIENT@@", () => client);
}

/** A VNC server of 1280 by 800 that answers the handshake and keeps every pointer event: [buttons, x, y]. */
function startVncServer(port) {
  const { WebSocketServer } = require("ws");
  const pointer = [];
  const server = new WebSocketServer({ port, host: "127.0.0.1" });
  server.on("connection", (socket) => {
    let buffer = Buffer.alloc(0);
    let stage = "version";
    socket.send(Buffer.from("RFB 003.008\n"));
    socket.on("message", (data) => {
      buffer = Buffer.concat([buffer, Buffer.from(data)]);
      for (;;) {
        if (stage === "version") {
          if (buffer.length < 12) return;
          buffer = buffer.subarray(12);
          socket.send(Buffer.from([1, 1]));
          stage = "security";
        } else if (stage === "security") {
          if (buffer.length < 1) return;
          buffer = buffer.subarray(1);
          socket.send(Buffer.alloc(4));
          stage = "init";
        } else if (stage === "init") {
          if (buffer.length < 1) return;
          buffer = buffer.subarray(1);
          const name = Buffer.from("box");
          const init = Buffer.alloc(24 + name.length);
          init.writeUInt16BE(1280, 0);
          init.writeUInt16BE(800, 2);
          Buffer.from([32, 24, 0, 1, 0, 255, 0, 255, 0, 255, 16, 8, 0, 0, 0, 0]).copy(init, 4);
          init.writeUInt32BE(name.length, 20);
          name.copy(init, 24);
          socket.send(init);
          stage = "normal";
        } else {
          if (buffer.length < 1) return;
          const kind = buffer[0];
          const size = kind === 0 ? 20 : kind === 2 ? (buffer.length >= 4 ? 4 + 4 * buffer.readUInt16BE(2) : Infinity) : kind === 3 ? 10 : kind === 4 ? 8 : kind === 5 ? 6 : kind === 6 ? (buffer.length >= 8 ? 8 + buffer.readUInt32BE(4) : Infinity) : -1;
          if (size === -1) { buffer = Buffer.alloc(0); return; }
          if (buffer.length < size) return;
          if (kind === 5) pointer.push([buffer[1], buffer.readUInt16BE(2), buffer.readUInt16BE(4)]);
          buffer = buffer.subarray(size);
        }
      }
    });
  });
  return {
    pointer,
    close: () => new Promise((resolve) => {
      for (const client of server.clients) client.terminate();
      server.close(() => resolve());
    }),
  };
}

test("a tap clicks, a drag turns the wheel, and a held press drags, at the computer's pixels", { skip: !existsSync(chromiumPath) && "no Chromium on this machine (set SIMEON_CHROMIUM)" }, async (t) => {
  const vncPort = 9800 + Math.floor(Math.random() * 100);
  const vnc = startVncServer(vncPort);
  const html = phonePage(`ws://127.0.0.1:${vncPort}/`);
  const http = createServer((_request, response) => { response.writeHead(200, { "content-type": "text/html" }); response.end(html); });
  await new Promise((resolve) => http.listen(0, "127.0.0.1", resolve));
  const playwright = require("playwright-core");
  const browser = await playwright.chromium.launch({ executablePath: chromiumPath, args: ["--no-sandbox"] });
  // The browser first, then what it was connected to.
  t.after(async () => {
    await browser.close();
    http.closeAllConnections();
    http.close();
    await vnc.close();
  });
  // The phone's web view: 1280 by 800 fitted to 390 points wide.
  const page = await browser.newPage({ viewport: { width: 390, height: 244 } });
  await page.goto(`http://127.0.0.1:${http.address().port}/`);
  await page.waitForFunction(() => document.querySelector("#screen canvas")?.width === 1280, null, { timeout: 15_000 });
  const run = async (script) => { await page.evaluate(script); await page.waitForTimeout(150); };
  const near = (event, buttons, x, y) => event[0] === buttons && Math.abs(event[1] - x) <= 2 && Math.abs(event[2] - y) <= 2;

  await run("window.simeonClick(195, 122)");
  const presses = vnc.pointer.filter((event) => event[0] === 1);
  assert.equal(presses.length, 1, JSON.stringify(vnc.pointer));
  assert.ok(near(presses[0], 1, 640, 400), `the middle of the phone's picture is the middle of the computer: ${presses[0]}`);
  assert.ok(near(vnc.pointer.at(-1), 0, 640, 400), "and the button is let go there");

  vnc.pointer.length = 0;
  await run("window.simeonWheel(195, 122, 0, 100)");
  assert.equal(vnc.pointer.filter((event) => event[0] === 16).length, 2, `100 pixels down is two turns of the wheel down: ${JSON.stringify(vnc.pointer)}`);
  vnc.pointer.length = 0;
  await run("window.simeonWheel(195, 122, 0, -150)");
  assert.equal(vnc.pointer.filter((event) => event[0] === 8).length, 3, "150 up is three turns up");

  vnc.pointer.length = 0;
  await run('window.simeonPointer("down", 100, 100)');
  await run('window.simeonPointer("move", 200, 150)');
  await run('window.simeonPointer("up", 200, 150)');
  assert.ok(near(vnc.pointer.find((event) => event[0] === 1), 1, 328, 328), `held at (100, 100) on the phone: ${JSON.stringify(vnc.pointer)}`);
  assert.ok(vnc.pointer.some((event) => near(event, 1, 656, 492)), "dragged with the button down");
  assert.ok(near(vnc.pointer.at(-1), 0, 656, 492), "let go where the finger lifted");

  vnc.pointer.length = 0;
  await run("window.simeonClick(300, 200)");
  assert.ok(vnc.pointer.some((event) => near(event, 1, 984, 656)), "a tap after the drag still clicks");
});
