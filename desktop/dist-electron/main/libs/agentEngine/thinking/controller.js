"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.OpenClawThinkingController = exports.createOpenClawThinkingTurnState = void 0;
const blocks_1 = require("./blocks");
const diagnostics_1 = require("./diagnostics");
const reconciliation_1 = require("./reconciliation");
const isRecord = (value) => {
    return Boolean(value && typeof value === 'object' && !Array.isArray(value));
};
const createOpenClawThinkingTurnState = () => ({
    messageId: null,
    currentText: '',
    messageIdByKey: new Map(),
});
exports.createOpenClawThinkingTurnState = createOpenClawThinkingTurnState;
class OpenClawThinkingController {
    dependencies;
    constructor(dependencies) {
        this.dependencies = dependencies;
    }
    handleStream(sessionId, turn, data) {
        if (!isRecord(data))
            return;
        const cumulativeText = typeof data.text === 'string' ? data.text.trim() : '';
        const deltaText = typeof data.delta === 'string' ? data.delta : '';
        const nextText = cumulativeText || `${turn.thinking.currentText}${deltaText}`.trim();
        if (!nextText || nextText === turn.thinking.currentText)
            return;
        if (turn.thinking.currentText && !nextText.startsWith(turn.thinking.currentText)) {
            this.finalize(sessionId, turn);
        }
        turn.thinking.currentText = nextText;
        (0, diagnostics_1.logThinkingDiagnostic)('adapterAction=thinking-stream-update', `sessionId=${sessionId}`, `chars=${nextText.length}`, `deltaChars=${deltaText.length}`, `thinkingMessage=${turn.thinking.messageId ?? '-'}`);
        this.sync(sessionId, turn);
    }
    sync(sessionId, turn) {
        const thinkingText = turn.thinking.currentText;
        if (!thinkingText)
            return;
        if (!turn.thinking.messageId) {
            const insertBeforeId = turn.assistantMessageId || undefined;
            (0, diagnostics_1.logThinkingDiagnostic)('thinking-message-create', `sessionId=${sessionId}`, `chars=${thinkingText.length}`, `before=${insertBeforeId ?? '-'}`, `toolMessages=${turn.toolUseMessageIdByToolCallId.size}`);
            const payload = {
                type: 'assistant',
                content: thinkingText,
                metadata: { isThinking: true, isStreaming: true, isFinal: false },
            };
            const message = insertBeforeId
                ? this.dependencies.store.insertMessageBeforeId(sessionId, insertBeforeId, payload)
                : this.dependencies.store.addMessage(sessionId, payload);
            turn.thinking.messageId = message.id;
            this.dependencies.emitMessage(sessionId, message, insertBeforeId);
            return;
        }
        (0, diagnostics_1.logThinkingDiagnostic)('thinking-message-update', `sessionId=${sessionId}`, `messageId=${turn.thinking.messageId}`, `chars=${thinkingText.length}`);
        this.dependencies.throttledStoreUpdate(sessionId, turn.thinking.messageId, thinkingText, { isThinking: true, isStreaming: true, isFinal: false });
        this.dependencies.throttledEmitMessageUpdate(sessionId, turn.thinking.messageId, thinkingText);
    }
    finalize(sessionId, turn) {
        const messageId = turn.thinking.messageId;
        if (!messageId)
            return undefined;
        (0, diagnostics_1.logThinkingDiagnostic)('thinking-message-finalize', `sessionId=${sessionId}`, `messageId=${messageId}`, `chars=${turn.thinking.currentText.length}`, `toolMessages=${turn.toolUseMessageIdByToolCallId.size}`);
        this.dependencies.flushPendingStoreUpdate(sessionId, messageId);
        this.dependencies.clearPendingMessageUpdate(messageId);
        const existingMessage = this.dependencies.store
            .getSession(sessionId)?.messages.find((message) => message.id === messageId);
        const metadata = {
            ...existingMessage?.metadata,
            isThinking: true,
            isStreaming: false,
            isFinal: true,
        };
        this.dependencies.store.updateMessage(sessionId, messageId, {
            content: turn.thinking.currentText || undefined,
            metadata,
        });
        if (turn.thinking.currentText) {
            this.dependencies.emitMessageUpdate(sessionId, messageId, turn.thinking.currentText, metadata);
        }
        turn.thinking.messageId = null;
        turn.thinking.currentText = '';
        return messageId;
    }
    finalizeBeforeTool(sessionId, turn, toolCallId) {
        (0, diagnostics_1.logThinkingDiagnostic)('tool-boundary-split', `sessionId=${sessionId}`, `assistantMessage=${turn.assistantMessageId ?? '-'}`, `thinkingMessage=${turn.thinking.messageId ?? '-'}`, `thinkingChars=${turn.thinking.currentText.length}`);
        const messageId = this.finalize(sessionId, turn);
        if (messageId && toolCallId) {
            turn.thinking.messageIdByKey.set((0, blocks_1.buildAnchoredThinkingKey)(toolCallId), messageId);
        }
    }
    reconcile(sessionId, turn, historyMessages, includeUnanchored) {
        (0, reconciliation_1.reconcileOpenClawThinkingBlocks)({
            sessionId,
            historyMessages,
            includeUnanchored,
            assistantMessageId: turn.assistantMessageId ?? undefined,
            toolUseMessageIdByToolCallId: turn.toolUseMessageIdByToolCallId,
            messageIdByThinkingKey: turn.thinking.messageIdByKey,
            store: this.dependencies.store,
            emitMessage: (message, beforeMessageId) => {
                this.dependencies.emitMessage(sessionId, message, beforeMessageId);
            },
            emitMessageUpdate: (messageId, content, metadata) => {
                this.dependencies.emitMessageUpdate(sessionId, messageId, content, metadata);
            },
            onMessageCreated: ({ key, chars, beforeMessageId }) => {
                (0, diagnostics_1.logThinkingDiagnostic)('history-thinking-block-create', `sessionId=${sessionId}`, `key=${key}`, `chars=${chars}`, `before=${beforeMessageId ?? '-'}`);
            },
        });
    }
}
exports.OpenClawThinkingController = OpenClawThinkingController;
//# sourceMappingURL=controller.js.map