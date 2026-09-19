"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.DesktopNotificationManager = void 0;
const electron_1 = require("electron");
const constants_1 = require("../../shared/cowork/constants");
const constants_2 = require("../../shared/notifications/constants");
const appConstants_1 = require("../appConstants");
const i18n_1 = require("../i18n");
const MAX_ACTIVE_NOTIFICATION_REFERENCES = 50;
const MAX_RESOLVED_REQUEST_ID_REFERENCES = 200;
class DesktopNotificationManager {
    options;
    pendingCompletions = new Map();
    activeNotifications = new Map();
    waitingNotifications = new Map();
    // Requests that resolved before (or without) a visible notification, so a
    // late-arriving request event does not raise a stale notification. Covers
    // auto-approved commands whose resolve fires before the request is emitted.
    resolvedRequestIds = new Set();
    windowsOverlayIcons = new Map();
    activeSessionId = null;
    constructor(options) {
        this.options = options;
    }
    handleComplete(sessionId) {
        const settings = (0, constants_2.normalizeNotificationSettings)(this.options.getNotificationSettings());
        const mode = settings.taskCompletionNotificationMode;
        if (mode === constants_2.TaskCompletionNotificationMode.Off) {
            console.debug(`[DesktopNotification] skipped completed session ${sessionId} because completion notifications are off`);
            return;
        }
        if (this.options.isSessionNotifying && !this.options.isSessionNotifying(sessionId)) {
            console.debug(`[DesktopNotification] skipped completed session ${sessionId} because its agent's notifications are off`);
            return;
        }
        const win = this.options.getWindow();
        if (this.isWindowForeground(win)) {
            if (mode !== constants_2.TaskCompletionNotificationMode.Always) {
                console.debug(`[DesktopNotification] skipped completed session ${sessionId} because the app is foreground`);
                return;
            }
            // "Always" while foreground: show a transient notification only. The
            // user can already see the result, so no unread state or badge.
            this.showCompletionNotification(sessionId);
            return;
        }
        if (this.pendingCompletions.has(sessionId)) {
            console.debug(`[DesktopNotification] ignored duplicate completed session notification for ${sessionId}`);
            return;
        }
        this.pendingCompletions.set(sessionId, {
            sessionId,
            completedAt: Date.now(),
        });
        console.log(`[DesktopNotification] recorded completed session notification for ${sessionId}; pending count ${this.pendingCompletions.size}`);
        this.updateAttentionState();
        this.showCompletionNotification(sessionId);
    }
    handlePermissionRequest(sessionId, request) {
        const { requestId, toolName } = request;
        if (!requestId)
            return;
        if (this.resolvedRequestIds.delete(requestId)) {
            console.debug(`[DesktopNotification] skipped request ${requestId} because it was already resolved`);
            return;
        }
        const kind = (0, constants_2.classifyWaitingNotificationKind)(toolName);
        const settings = (0, constants_2.normalizeNotificationSettings)(this.options.getNotificationSettings());
        const enabled = kind === constants_2.WaitingNotificationKind.Question
            ? settings.questionNotificationsEnabled
            : settings.permissionNotificationsEnabled;
        if (!enabled) {
            console.debug(`[DesktopNotification] skipped ${kind} request ${requestId} because ${kind} notifications are disabled`);
            return;
        }
        if (this.isViewingSession(sessionId)) {
            console.debug(`[DesktopNotification] skipped ${kind} request ${requestId} because session ${sessionId} is being viewed`);
            return;
        }
        const existing = this.waitingNotifications.get(requestId);
        if (existing) {
            this.closeNotification(this.waitingNotificationId(existing));
        }
        this.waitingNotifications.set(requestId, { sessionId, requestId, kind });
        this.showWaitingNotification(sessionId, requestId, kind, toolName);
    }
    handlePermissionResolved(requestId) {
        if (!requestId)
            return;
        const record = this.waitingNotifications.get(requestId);
        if (!record) {
            this.rememberResolvedRequest(requestId);
            return;
        }
        this.removeWaitingNotification(record);
        console.log(`[DesktopNotification] closed ${record.kind} notification for resolved request ${requestId}`);
    }
    setActiveSession(sessionId) {
        this.activeSessionId = sessionId;
        if (sessionId) {
            this.closeWaitingNotificationsForSession(sessionId, 'session viewed');
        }
    }
    handleWindowFocused() {
        this.clearAllCompletions('main window focused');
        if (this.activeSessionId) {
            this.closeWaitingNotificationsForSession(this.activeSessionId, 'window focused');
        }
    }
    markSessionViewed(sessionId) {
        if (!this.pendingCompletions.delete(sessionId))
            return;
        this.closeNotification(this.completionNotificationId(sessionId));
        console.log(`[DesktopNotification] cleared completed session notification for ${sessionId}; pending count ${this.pendingCompletions.size}`);
        this.updateAttentionState();
    }
    handleSessionDeleted(sessionId) {
        this.closeWaitingNotificationsForSession(sessionId, 'session deleted');
        if (!this.pendingCompletions.delete(sessionId))
            return;
        this.closeNotification(this.completionNotificationId(sessionId));
        console.log(`[DesktopNotification] removed completed session notification for deleted session ${sessionId}; pending count ${this.pendingCompletions.size}`);
        this.updateAttentionState();
    }
    handleSessionStopped(sessionId) {
        this.closeWaitingNotificationsForSession(sessionId, 'session stopped');
    }
    clearAllCompletions(reason) {
        if (this.pendingCompletions.size === 0 && !this.hasActiveNotificationOfKind('completion'))
            return;
        const count = this.pendingCompletions.size;
        this.pendingCompletions.clear();
        this.closeNotificationsByKind('completion');
        console.log(`[DesktopNotification] cleared ${count} completed session notifications after ${reason}`);
        this.updateAttentionState();
    }
    closeWaitingNotifications(kind, reason) {
        let closed = 0;
        for (const record of [...this.waitingNotifications.values()]) {
            if (record.kind !== kind)
                continue;
            this.removeWaitingNotification(record);
            closed += 1;
        }
        if (closed > 0) {
            console.log(`[DesktopNotification] closed ${closed} ${kind} notifications after ${reason}`);
        }
    }
    closeWaitingNotificationsForSession(sessionId, reason) {
        let closed = 0;
        for (const record of [...this.waitingNotifications.values()]) {
            if (record.sessionId !== sessionId)
                continue;
            this.removeWaitingNotification(record);
            closed += 1;
        }
        if (closed > 0) {
            console.log(`[DesktopNotification] closed ${closed} waiting notifications for session ${sessionId} after ${reason}`);
        }
    }
    removeWaitingNotification(record) {
        this.waitingNotifications.delete(record.requestId);
        this.closeNotification(this.waitingNotificationId(record));
    }
    rememberResolvedRequest(requestId) {
        this.resolvedRequestIds.add(requestId);
        while (this.resolvedRequestIds.size > MAX_RESOLVED_REQUEST_ID_REFERENCES) {
            const oldest = this.resolvedRequestIds.values().next().value;
            if (oldest === undefined)
                return;
            this.resolvedRequestIds.delete(oldest);
        }
    }
    isWindowForeground(win) {
        return !!win && !win.isDestroyed() && win.isVisible() && !win.isMinimized() && win.isFocused();
    }
    isViewingSession(sessionId) {
        if (!this.isWindowForeground(this.options.getWindow()))
            return false;
        if (sessionId === constants_1.SESSION_AGNOSTIC_PERMISSION_SESSION_ID) {
            // Session-agnostic requests surface in whichever session is open, so
            // any active session means the request is visible to the user.
            return this.activeSessionId !== null;
        }
        return this.activeSessionId === sessionId;
    }
    completionNotificationId(sessionId) {
        return `complete-${sessionId}`;
    }
    waitingNotificationId(record) {
        return `permission-${record.sessionId}-${record.requestId}`;
    }
    resolveSessionTitle(sessionId) {
        if (sessionId === constants_1.SESSION_AGNOSTIC_PERMISSION_SESSION_ID)
            return null;
        try {
            const title = this.options.getSessionTitle(sessionId);
            const trimmed = title?.trim();
            return trimmed ? trimmed : null;
        }
        catch (error) {
            console.warn(`[DesktopNotification] failed to resolve title for session ${sessionId}:`, error);
            return null;
        }
    }
    showCompletionNotification(sessionId) {
        this.showSystemNotification({
            notificationId: this.completionNotificationId(sessionId),
            kind: 'completion',
            title: this.resolveSessionTitle(sessionId) ?? (0, i18n_1.t)('taskCompletionNotificationTitle'),
            body: (0, i18n_1.t)('taskCompletionNotificationBody'),
            onClick: () => {
                console.log(`[DesktopNotification] system notification clicked for session ${sessionId}`);
                this.openPendingSession(sessionId);
            },
        });
    }
    showWaitingNotification(sessionId, requestId, kind, toolName) {
        const isQuestion = kind === constants_2.WaitingNotificationKind.Question;
        const fallbackTitle = isQuestion ? (0, i18n_1.t)('questionNotificationTitle') : (0, i18n_1.t)('permissionNotificationTitle');
        const trimmedToolName = toolName.trim();
        const body = isQuestion
            ? (0, i18n_1.t)('questionNotificationBody')
            : trimmedToolName
                ? (0, i18n_1.t)('permissionNotificationBody', { toolName: trimmedToolName })
                : (0, i18n_1.t)('permissionNotificationBodyGeneric');
        const shown = this.showSystemNotification({
            notificationId: this.waitingNotificationId({ sessionId, requestId, kind }),
            kind,
            title: this.resolveSessionTitle(sessionId) ?? fallbackTitle,
            body,
            // Keep waiting notifications on screen until they are acted on where
            // the platform supports it (macOS/Linux). Windows toasts move to the
            // Action Center on their own.
            persistent: process.platform !== 'win32',
            onClick: () => {
                console.log(`[DesktopNotification] ${kind} notification clicked for session ${sessionId}, request ${requestId}`);
                this.waitingNotifications.delete(requestId);
                if (sessionId === constants_1.SESSION_AGNOSTIC_PERMISSION_SESSION_ID) {
                    this.options.focusMainWindow('waiting notification');
                    return;
                }
                this.openPendingSession(sessionId);
            },
        });
        if (!shown) {
            this.waitingNotifications.delete(requestId);
            return;
        }
        console.log(`[DesktopNotification] showed ${kind} notification for session ${sessionId}, request ${requestId}`);
    }
    showSystemNotification(params) {
        if (!electron_1.Notification.isSupported()) {
            console.warn('[DesktopNotification] system notifications are not supported on this platform');
            return false;
        }
        try {
            this.closeNotification(params.notificationId);
            const notification = new electron_1.Notification({
                title: params.title,
                body: params.body,
                icon: this.getNotificationIcon(),
                ...(params.persistent ? { timeoutType: 'never' } : {}),
            });
            notification.on('click', () => {
                this.activeNotifications.delete(params.notificationId);
                params.onClick();
            });
            this.activeNotifications.set(params.notificationId, {
                notification,
                kind: params.kind,
            });
            this.pruneActiveNotificationReferences();
            notification.show();
            return true;
        }
        catch (error) {
            console.warn(`[DesktopNotification] failed to show system notification ${params.notificationId}:`, error);
            return false;
        }
    }
    updateAttentionState() {
        const count = this.pendingCompletions.size;
        const hasReminder = count > 0;
        this.updateDockBadge(count);
        this.updateWindowsAttention(count);
        this.options.updateTrayReminder(count, hasReminder ? () => this.openPendingSession(this.getMostRecentPendingSessionId()) : undefined);
    }
    updateDockBadge(count) {
        if (process.platform !== 'darwin' || !electron_1.app.dock)
            return;
        try {
            electron_1.app.dock.setBadge(count > 0 ? String(count) : '');
        }
        catch (error) {
            console.warn('[DesktopNotification] failed to update Dock badge:', error);
        }
    }
    updateWindowsAttention(count) {
        if (process.platform !== 'win32')
            return;
        const win = this.options.getWindow();
        if (!win || win.isDestroyed())
            return;
        const hasReminder = count > 0;
        try {
            win.setOverlayIcon(hasReminder ? this.getWindowsOverlayIcon(count) : null, hasReminder ? (0, i18n_1.t)('taskCompletionOverlayDescription') : '');
            win.flashFrame(hasReminder);
        }
        catch (error) {
            console.warn('[DesktopNotification] failed to update Windows taskbar attention state:', error);
        }
    }
    getNotificationIcon() {
        const iconPath = this.options.getNotificationIconPath();
        if (!iconPath)
            return undefined;
        const image = electron_1.nativeImage.createFromPath(iconPath);
        return image.isEmpty() ? undefined : image;
    }
    closeNotification(notificationId) {
        const entry = this.activeNotifications.get(notificationId);
        if (!entry)
            return;
        this.activeNotifications.delete(notificationId);
        try {
            entry.notification.close();
        }
        catch (error) {
            console.warn(`[DesktopNotification] failed to close system notification ${notificationId}:`, error);
        }
    }
    closeNotificationsByKind(kind) {
        for (const [notificationId, entry] of [...this.activeNotifications.entries()]) {
            if (entry.kind !== kind)
                continue;
            this.closeNotification(notificationId);
        }
    }
    hasActiveNotificationOfKind(kind) {
        for (const entry of this.activeNotifications.values()) {
            if (entry.kind === kind)
                return true;
        }
        return false;
    }
    pruneActiveNotificationReferences() {
        while (this.activeNotifications.size > MAX_ACTIVE_NOTIFICATION_REFERENCES) {
            const oldestNotificationId = this.activeNotifications.keys().next().value;
            if (!oldestNotificationId)
                return;
            const oldest = this.activeNotifications.get(oldestNotificationId);
            this.closeNotification(oldestNotificationId);
            if (oldest && oldest.kind !== 'completion') {
                for (const record of [...this.waitingNotifications.values()]) {
                    if (this.waitingNotificationId(record) === oldestNotificationId) {
                        this.waitingNotifications.delete(record.requestId);
                    }
                }
            }
            console.warn(`[DesktopNotification] closed the oldest system notification because more than ${MAX_ACTIVE_NOTIFICATION_REFERENCES} notifications were active`);
        }
    }
    getWindowsOverlayIcon(count) {
        const label = this.formatBadgeCount(count);
        const cachedIcon = this.windowsOverlayIcons.get(label);
        if (cachedIcon && !cachedIcon.isEmpty())
            return cachedIcon;
        const svg = [
            '<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 32 32">',
            `<circle cx="16" cy="16" r="15" fill="${appConstants_1.APP_ATTENTION_BADGE_COLOR}"/>`,
            `<text x="16" y="21" text-anchor="middle" fill="#ffffff" font-size="${label.length > 2 ? 12 : 18}" font-family="-apple-system, BlinkMacSystemFont, Segoe UI, sans-serif" font-weight="600">${label}</text>`,
            '</svg>',
        ].join('');
        const icon = electron_1.nativeImage.createFromDataURL(`data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`);
        this.windowsOverlayIcons.set(label, icon);
        return icon;
    }
    formatBadgeCount(count) {
        return count > 99 ? '99+' : String(count);
    }
    getMostRecentPendingSessionId() {
        let latest = null;
        for (const notification of this.pendingCompletions.values()) {
            if (!latest || notification.completedAt > latest.completedAt) {
                latest = notification;
            }
        }
        return latest?.sessionId ?? '';
    }
    openPendingSession(sessionId) {
        if (!sessionId)
            return;
        this.options.focusMainWindow('desktop notification');
        this.options.openSession(sessionId);
    }
}
exports.DesktopNotificationManager = DesktopNotificationManager;
//# sourceMappingURL=desktopNotificationManager.js.map