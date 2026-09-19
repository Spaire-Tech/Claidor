"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.createWindowStatePersistManager = createWindowStatePersistManager;
const electron_1 = require("electron");
const windowState_1 = require("./windowState");
function createWindowStatePersistManager(deps) {
    let saveTimer = null;
    let suppressUntil = 0;
    const DEBOUNCE_MS = 300;
    const TRANSITION_GUARD_MS = 500;
    function emitState() {
        const win = deps.getMainWindow();
        if (!win || win.isDestroyed())
            return;
        if (win.webContents.isDestroyed())
            return;
        win.webContents.send('window:state-changed', {
            isMaximized: win.isMaximized(),
            isFullscreen: win.isFullScreen(),
            isFocused: win.isFocused(),
        });
    }
    function getDisplayWorkAreas() {
        return electron_1.screen.getAllDisplays().map((display) => display.workArea);
    }
    function getCurrentState() {
        const win = deps.getMainWindow();
        if (!win || win.isDestroyed())
            return null;
        const bounds = win.isFullScreen()
            ? win.getNormalBounds()
            : win.isMaximized()
                ? win.getNormalBounds()
                : win.getBounds();
        return {
            x: bounds.x,
            y: bounds.y,
            width: bounds.width,
            height: bounds.height,
            isMaximized: win.isMaximized(),
        };
    }
    function persist() {
        const state = getCurrentState();
        if (!state)
            return;
        // Reject obviously invalid bounds that can arise from getNormalBounds()
        // returning wrong values on Windows frameless windows, or from resize
        // events firing with transitional sizes during maximize/unmaximize.
        if (state.width < windowState_1.MIN_APP_WINDOW_WIDTH || state.height < windowState_1.MIN_APP_WINDOW_HEIGHT)
            return;
        deps.getStore().set(windowState_1.AppWindowStoreKey.State, state);
    }
    function schedulePersist() {
        if (saveTimer) {
            clearTimeout(saveTimer);
        }
        saveTimer = setTimeout(() => {
            saveTimer = null;
            // Skip if we are inside a maximize/unmaximize transition window,
            // because getBounds() may return intermediate animation values.
            if (Date.now() < suppressUntil)
                return;
            persist();
        }, DEBOUNCE_MS);
    }
    function forwardAndPersist() {
        emitState();
        // Suppress resize-driven persists during the transition animation,
        // then persist the final settled state after the guard period.
        suppressUntil = Date.now() + TRANSITION_GUARD_MS;
        if (saveTimer) {
            clearTimeout(saveTimer);
            saveTimer = null;
        }
        saveTimer = setTimeout(() => {
            saveTimer = null;
            suppressUntil = 0;
            persist();
        }, TRANSITION_GUARD_MS);
    }
    /**
     * Fix cross-DPI-monitor scaling: on Windows with frame:false, Electron
     * may divide width/height by the primary monitor's scaleFactor when the
     * window is placed on a secondary monitor with a different DPI.  Detect
     * and correct this before showing the window.
     */
    function fixDpiBounds(initialBounds, shouldRestoreMaximized) {
        const win = deps.getMainWindow();
        if (!win || win.isDestroyed() || shouldRestoreMaximized)
            return;
        const actual = win.getBounds();
        if (actual.width < initialBounds.width || actual.height < initialBounds.height) {
            win.setBounds(initialBounds);
            // Re-enforce minimum size after correction
            win.setMinimumSize(windowState_1.MIN_APP_WINDOW_WIDTH, windowState_1.MIN_APP_WINDOW_HEIGHT);
        }
    }
    /**
     * Register all window state persistence event handlers on the main window.
     * Call this once inside createWindow() after the BrowserWindow is created.
     */
    function bindWindowEvents(initialBounds, shouldRestoreMaximized) {
        const win = deps.getMainWindow();
        if (!win)
            return;
        win.on('resize', schedulePersist);
        win.on('move', schedulePersist);
        win.on('maximize', forwardAndPersist);
        win.on('unmaximize', forwardAndPersist);
        win.on('enter-full-screen', forwardAndPersist);
        win.on('leave-full-screen', forwardAndPersist);
        win.on('focus', emitState);
        win.on('blur', emitState);
        win.once('ready-to-show', () => {
            fixDpiBounds(initialBounds, shouldRestoreMaximized);
            emitState();
        });
    }
    function cleanup() {
        if (saveTimer) {
            clearTimeout(saveTimer);
            saveTimer = null;
        }
    }
    return {
        emitState,
        getDisplayWorkAreas,
        persist,
        schedulePersist,
        forwardAndPersist,
        fixDpiBounds,
        bindWindowEvents,
        cleanup,
    };
}
//# sourceMappingURL=windowStatePersist.js.map