"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.resolveInitialAppWindowState = exports.normalizeAppWindowState = exports.MIN_APP_WINDOW_HEIGHT = exports.MIN_APP_WINDOW_WIDTH = exports.DEFAULT_APP_WINDOW_HEIGHT = exports.DEFAULT_APP_WINDOW_WIDTH = exports.AppWindowStoreKey = void 0;
exports.AppWindowStoreKey = {
    State: 'app_window_state',
};
exports.DEFAULT_APP_WINDOW_WIDTH = 1280;
exports.DEFAULT_APP_WINDOW_HEIGHT = 800;
/**
 * The narrowest the window may be dragged.
 *
 * 560, not 800. The founder's complaint was that other apps go genuinely
 * thin and this one does not, and 800 was never a considered number — it
 * was the width at which the old fixed three-column layout stopped being
 * *completely* unusable, which is not the same thing.
 *
 * What makes 560 safe is `renderer/design/shell/layout.ts`: below 900 the
 * sidebar collapses to a 76px rail, and the panel covers the conversation
 * rather than splitting it. That leaves the thread 484px at this width,
 * above its 460px floor. Lowering this without those rules would put the
 * conversation back at one character per line.
 */
exports.MIN_APP_WINDOW_WIDTH = 560;
exports.MIN_APP_WINDOW_HEIGHT = 600;
const DEFAULT_WINDOW_SCREEN_MARGIN = 24;
const FALLBACK_WORK_AREA = {
    x: 0,
    y: 0,
    width: exports.DEFAULT_APP_WINDOW_WIDTH,
    height: exports.DEFAULT_APP_WINDOW_HEIGHT,
};
const toFiniteNumber = (value) => {
    return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
};
const clamp = (value, min, max) => {
    if (max < min)
        return min;
    return Math.min(Math.max(value, min), max);
};
const normalizeWorkAreas = (workAreas) => {
    const normalized = workAreas
        .map((area) => ({
        x: Math.round(area.x),
        y: Math.round(area.y),
        width: Math.round(area.width),
        height: Math.round(area.height),
    }))
        .filter((area) => area.width > 0 && area.height > 0);
    return normalized.length > 0 ? normalized : [FALLBACK_WORK_AREA];
};
const normalizeAppWindowState = (value) => {
    if (!value || typeof value !== 'object')
        return undefined;
    const candidate = value;
    const width = toFiniteNumber(candidate.width);
    const height = toFiniteNumber(candidate.height);
    if (!width || !height || width <= 0 || height <= 0)
        return undefined;
    const x = toFiniteNumber(candidate.x);
    const y = toFiniteNumber(candidate.y);
    return {
        ...(x === undefined ? {} : { x: Math.round(x) }),
        ...(y === undefined ? {} : { y: Math.round(y) }),
        width: Math.round(width),
        height: Math.round(height),
        isMaximized: candidate.isMaximized === true,
    };
};
exports.normalizeAppWindowState = normalizeAppWindowState;
const centerBounds = (size, workArea) => ({
    x: workArea.x + Math.round((workArea.width - size.width) / 2),
    y: workArea.y + Math.round((workArea.height - size.height) / 2),
    width: size.width,
    height: size.height,
});
const resolveDefaultBounds = (workArea) => {
    const maxWidth = Math.max(exports.MIN_APP_WINDOW_WIDTH, workArea.width - DEFAULT_WINDOW_SCREEN_MARGIN * 2);
    const maxHeight = Math.max(exports.MIN_APP_WINDOW_HEIGHT, workArea.height - DEFAULT_WINDOW_SCREEN_MARGIN * 2);
    const scale = Math.min(1, maxWidth / exports.DEFAULT_APP_WINDOW_WIDTH, maxHeight / exports.DEFAULT_APP_WINDOW_HEIGHT);
    const size = {
        width: Math.max(exports.MIN_APP_WINDOW_WIDTH, Math.round(exports.DEFAULT_APP_WINDOW_WIDTH * scale)),
        height: Math.max(exports.MIN_APP_WINDOW_HEIGHT, Math.round(exports.DEFAULT_APP_WINDOW_HEIGHT * scale)),
    };
    return centerBounds(size, workArea);
};
const containsPoint = (area, point) => (point.x >= area.x
    && point.x <= area.x + area.width
    && point.y >= area.y
    && point.y <= area.y + area.height);
const intersects = (a, b) => (a.x < b.x + b.width
    && a.x + a.width > b.x
    && a.y < b.y + b.height
    && a.y + a.height > b.y);
const selectWorkArea = (stored, workAreas) => {
    if (typeof stored.x === 'number' && typeof stored.y === 'number') {
        const storedBounds = {
            x: stored.x,
            y: stored.y,
            width: stored.width,
            height: stored.height,
        };
        const center = {
            x: stored.x + stored.width / 2,
            y: stored.y + stored.height / 2,
        };
        return workAreas.find((area) => containsPoint(area, center))
            ?? workAreas.find((area) => intersects(area, storedBounds))
            ?? workAreas[0];
    }
    return workAreas[0];
};
const fitStoredBounds = (stored, workArea) => {
    const originalBounds = {
        x: stored.x ?? workArea.x,
        y: stored.y ?? workArea.y,
        width: Math.max(exports.MIN_APP_WINDOW_WIDTH, Math.round(stored.width)),
        height: Math.max(exports.MIN_APP_WINDOW_HEIGHT, Math.round(stored.height)),
    };
    const maxWidth = Math.max(exports.MIN_APP_WINDOW_WIDTH, workArea.width - DEFAULT_WINDOW_SCREEN_MARGIN * 2);
    const maxHeight = Math.max(exports.MIN_APP_WINDOW_HEIGHT, workArea.height - DEFAULT_WINDOW_SCREEN_MARGIN * 2);
    const scale = Math.min(1, maxWidth / originalBounds.width, maxHeight / originalBounds.height);
    const width = Math.min(Math.max(exports.MIN_APP_WINDOW_WIDTH, Math.round(originalBounds.width * scale)), Math.max(exports.MIN_APP_WINDOW_WIDTH, workArea.width));
    const height = Math.min(Math.max(exports.MIN_APP_WINDOW_HEIGHT, Math.round(originalBounds.height * scale)), Math.max(exports.MIN_APP_WINDOW_HEIGHT, workArea.height));
    const fallback = centerBounds({ width, height }, workArea);
    const hasVisiblePosition = typeof stored.x === 'number'
        && typeof stored.y === 'number'
        && intersects(originalBounds, workArea);
    const x = clamp(Math.round(hasVisiblePosition ? stored.x ?? fallback.x : fallback.x), workArea.x, workArea.x + Math.max(0, workArea.width - width));
    const y = clamp(Math.round(hasVisiblePosition ? stored.y ?? fallback.y : fallback.y), workArea.y, workArea.y + Math.max(0, workArea.height - height));
    return { x, y, width, height };
};
const resolveInitialAppWindowState = (storedValue, workAreas) => {
    const normalizedWorkAreas = normalizeWorkAreas(workAreas);
    const stored = (0, exports.normalizeAppWindowState)(storedValue);
    if (!stored) {
        return {
            ...resolveDefaultBounds(normalizedWorkAreas[0]),
            isMaximized: false,
        };
    }
    return {
        ...fitStoredBounds(stored, selectWorkArea(stored, normalizedWorkAreas)),
        isMaximized: stored.isMaximized === true,
    };
};
exports.resolveInitialAppWindowState = resolveInitialAppWindowState;
//# sourceMappingURL=windowState.js.map