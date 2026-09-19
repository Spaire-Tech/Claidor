"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.PlaywrightDriver = void 0;
exports.parseDevToolsActivePort = parseDevToolsActivePort;
exports.readDevToolsEndpoint = readDevToolsEndpoint;
const fs_1 = __importDefault(require("fs"));
const path_1 = __importDefault(require("path"));
const playwright_core_1 = require("playwright-core");
/** Parse Chromium's `DevToolsActivePort`: a port on line one, a ws path on line two. */
function parseDevToolsActivePort(contents) {
    const [portLine, pathLine] = contents.trim().split(/\r?\n/);
    const port = Number(portLine);
    if (!Number.isInteger(port) || port <= 0 || port > 65_535)
        return null;
    const wsPath = (pathLine ?? '').trim();
    if (!wsPath.startsWith('/'))
        return null;
    return { port, wsPath };
}
function readDevToolsEndpoint(userDataDir) {
    const file = path_1.default.join(userDataDir, 'DevToolsActivePort');
    try {
        return parseDevToolsActivePort(fs_1.default.readFileSync(file, 'utf8'));
    }
    catch {
        return null;
    }
}
/** The one selector engine that turns a snapshot ref into an element. */
const refSelector = (ref) => `aria-ref=${ref}`;
const REF_PATTERN = /^e\d+$/;
class PlaywrightDriver {
    cdpUrl;
    browser = null;
    byTarget = new Map();
    targetOf = new WeakMap();
    constructor(cdpUrl) {
        this.cdpUrl = cdpUrl;
    }
    /** Connect over the app's own debugging port, or null when there is none. */
    static async connect(userDataDir) {
        const endpoint = readDevToolsEndpoint(userDataDir);
        if (!endpoint)
            return null;
        const driver = new PlaywrightDriver(`http://127.0.0.1:${endpoint.port}`);
        await driver.open();
        return driver;
    }
    get endpoint() {
        return this.cdpUrl;
    }
    async open() {
        if (this.browser)
            return;
        const browser = await playwright_core_1.chromium.connectOverCDP(this.cdpUrl, { timeout: 10_000 });
        this.browser = browser;
        browser.once('disconnected', () => {
            if (this.browser === browser)
                this.browser = null;
            this.byTarget.clear();
        });
    }
    async close() {
        const browser = this.browser;
        this.browser = null;
        this.byTarget.clear();
        // Disconnect from the app's own Chromium; never close it.
        await browser?.close().catch(() => undefined);
    }
    /**
     * The Playwright page for one of the host's views, by its DevTools
     * target id. Pages the host did not open are never returned.
     */
    async pageFor(targetId) {
        const cached = this.byTarget.get(targetId);
        if (cached && !cached.isClosed())
            return cached;
        if (!this.browser)
            await this.open();
        for (const context of this.browser.contexts()) {
            for (const page of context.pages()) {
                if (page.isClosed())
                    continue;
                const known = this.targetOf.get(page) ?? await this.readTargetId(context, page);
                if (known === targetId) {
                    this.byTarget.set(targetId, page);
                    return page;
                }
            }
        }
        throw new Error('The in-app browser page is not reachable through Playwright; take a new snapshot.');
    }
    /** The reference-tagged tree the agent reads. Refs look like `e12`. */
    async snapshot(page) {
        return page.locator('body').ariaSnapshot({ mode: 'ai' });
    }
    async click(page, ref, doubleClick) {
        const locator = page.locator(refSelector(requireRef(ref)));
        if (doubleClick)
            await locator.dblclick({ timeout: 10_000 });
        else
            await locator.click({ timeout: 10_000 });
    }
    async fill(page, ref, value) {
        await page.locator(refSelector(requireRef(ref))).fill(value, { timeout: 10_000 });
    }
    async hover(page, ref) {
        await page.locator(refSelector(requireRef(ref))).hover({ timeout: 10_000 });
    }
    async press(page, key) {
        await page.keyboard.press(key);
    }
    async type(page, text) {
        await page.keyboard.type(text);
    }
    async drag(page, fromRef, toRef) {
        await page.locator(refSelector(requireRef(fromRef)))
            .dragTo(page.locator(refSelector(requireRef(toRef))), { timeout: 10_000 });
    }
    async uploadFile(page, ref, filePath) {
        await page.locator(refSelector(requireRef(ref))).setInputFiles(filePath, { timeout: 10_000 });
    }
    async waitForText(page, text, timeoutMs) {
        await page.getByText(text).first().waitFor({ state: 'visible', timeout: timeoutMs });
    }
    /** The element's box, for a cropped screenshot. */
    async boundingBox(page, ref) {
        const box = await page.locator(refSelector(requireRef(ref))).boundingBox({ timeout: 10_000 });
        if (!box)
            throw new Error(`Browser element ${ref} has no visible box.`);
        return box;
    }
    async readTargetId(context, page) {
        try {
            const session = await context.newCDPSession(page);
            const info = await session.send('Target.getTargetInfo');
            await session.detach().catch(() => undefined);
            const targetId = info.targetInfo?.targetId;
            if (targetId)
                this.targetOf.set(page, targetId);
            return targetId;
        }
        catch {
            return undefined;
        }
    }
}
exports.PlaywrightDriver = PlaywrightDriver;
function requireRef(ref) {
    const trimmed = ref.trim();
    if (!REF_PATTERN.test(trimmed)) {
        throw new Error(`Browser element reference "${ref}" is not from the current snapshot. Take a new snapshot and use its refs (e12).`);
    }
    return trimmed;
}
//# sourceMappingURL=agentBrowserPlaywright.js.map