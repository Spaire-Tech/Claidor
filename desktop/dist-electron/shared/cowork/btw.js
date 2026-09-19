"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.createCoworkBtwRunId = exports.buildCoworkBtwContextualQuestion = exports.resolveCoworkBtwSelectedTextSnippets = exports.buildCoworkBtwComposerQuestion = exports.normalizeCoworkBtwSelectedTextQuestion = exports.normalizeCoworkBtwQuestion = exports.CoworkBtwCommandValidationError = exports.COWORK_BTW_EPHEMERAL_THREAD_LIMIT = exports.COWORK_BTW_THREAD_CONTENT_MAX_CHARS = exports.COWORK_BTW_THREAD_ENTRY_LIMIT = exports.COWORK_BTW_IDENTIFIER_MAX_CHARS = exports.COWORK_BTW_RESULT_MAX_CHARS = exports.COWORK_BTW_EVENT_QUESTION_MAX_CHARS = exports.COWORK_BTW_CONTEXT_MAX_CHARS = exports.CoworkBtwStatus = void 0;
exports.parseCoworkBtwCommand = parseCoworkBtwCommand;
const selectedText_1 = require("./selectedText");
const text_1 = require("./text");
exports.CoworkBtwStatus = {
    Pending: 'pending',
    Answered: 'answered',
    Failed: 'failed',
    Stopped: 'stopped',
};
// BTW questions have no product-level character limit. Follow-up history stays
// bounded independently, while the runtime enforces the shared chat frame size.
exports.COWORK_BTW_CONTEXT_MAX_CHARS = 16_000;
exports.COWORK_BTW_EVENT_QUESTION_MAX_CHARS = 120_000;
exports.COWORK_BTW_RESULT_MAX_CHARS = 120_000;
exports.COWORK_BTW_IDENTIFIER_MAX_CHARS = 512;
exports.COWORK_BTW_THREAD_ENTRY_LIMIT = 50;
exports.COWORK_BTW_THREAD_CONTENT_MAX_CHARS = 500_000;
exports.COWORK_BTW_EPHEMERAL_THREAD_LIMIT = 12;
exports.CoworkBtwCommandValidationError = {
    EmptyQuestion: 'empty_question',
    MultilineUnsupported: 'multiline_unsupported',
};
const normalizeCoworkBtwQuestion = (value) => ((0, text_1.stripNullChars)(value).trim());
exports.normalizeCoworkBtwQuestion = normalizeCoworkBtwQuestion;
const normalizeCoworkBtwSelectedTextQuestion = (value) => ((0, exports.normalizeCoworkBtwQuestion)(value).replace(/\s+/g, ' '));
exports.normalizeCoworkBtwSelectedTextQuestion = normalizeCoworkBtwSelectedTextQuestion;
const buildCoworkBtwComposerQuestion = (draft, selectedTextSnippets = []) => {
    const normalizedDraft = (0, exports.normalizeCoworkBtwQuestion)(draft);
    const selectedTextSection = (0, selectedText_1.buildSelectedTextPromptSection)(selectedTextSnippets);
    if (!selectedTextSection)
        return normalizedDraft;
    const question = normalizedDraft
        || 'Analyze the selected text excerpt and answer it directly if it contains a question.';
    return `${question}\n\n${selectedTextSection}`;
};
exports.buildCoworkBtwComposerQuestion = buildCoworkBtwComposerQuestion;
const resolveCoworkBtwSelectedTextSnippets = (currentSnippets, incomingSnippets, shouldAppend) => ((0, selectedText_1.normalizeCoworkSelectedTextSnippets)([
    ...(shouldAppend ? currentSnippets : []),
    ...incomingSnippets,
]));
exports.resolveCoworkBtwSelectedTextSnippets = resolveCoworkBtwSelectedTextSnippets;
const truncateBtwContextValue = (value, maxChars) => {
    if (value.length <= maxChars)
        return value;
    return `${value.slice(0, Math.max(0, maxChars - 1))}…`;
};
const buildCoworkBtwContextualQuestion = (entries, question) => {
    const currentQuestion = (0, exports.normalizeCoworkBtwSelectedTextQuestion)(question);
    if (!currentQuestion)
        return '';
    if (currentQuestion.length >= exports.COWORK_BTW_CONTEXT_MAX_CHARS) {
        return currentQuestion;
    }
    const prefix = 'Continue this temporary side chat using the previous side-chat turns as context. '
        + 'Answer only the current question. Previous side-chat turns, oldest to newest: ';
    const suffix = ` Current question: ${JSON.stringify(currentQuestion)}`;
    const selectedTurns = [];
    // Walk backwards and stop as soon as the bounded context is full. This
    // avoids normalizing older, potentially large answers that cannot be sent.
    for (let index = entries.length - 1; index >= 0; index -= 1) {
        const entry = entries[index];
        if (entry.status !== exports.CoworkBtwStatus.Answered
            || typeof entry.answer !== 'string'
            || entry.answer.length === 0) {
            continue;
        }
        const previousTurn = {
            question: truncateBtwContextValue((0, exports.normalizeCoworkBtwSelectedTextQuestion)((0, exports.buildCoworkBtwComposerQuestion)(entry.question, entry.selectedTextSnippets)), 2_000),
            answer: truncateBtwContextValue((0, exports.normalizeCoworkBtwSelectedTextQuestion)(entry.answer), 6_000),
        };
        if (!previousTurn.question || !previousTurn.answer) {
            continue;
        }
        const serializedTurn = JSON.stringify(previousTurn);
        const candidateTurns = [serializedTurn, ...selectedTurns];
        const candidate = `${prefix}[${candidateTurns.join(',')}]${suffix}`;
        if (candidate.length > exports.COWORK_BTW_CONTEXT_MAX_CHARS) {
            break;
        }
        selectedTurns.unshift(serializedTurn);
    }
    if (selectedTurns.length === 0) {
        return currentQuestion;
    }
    return `${prefix}[${selectedTurns.join(',')}]${suffix}`;
};
exports.buildCoworkBtwContextualQuestion = buildCoworkBtwContextualQuestion;
const createCoworkBtwRunId = () => (`btw-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`);
exports.createCoworkBtwRunId = createCoworkBtwRunId;
function parseCoworkBtwCommand(input) {
    const trimmedStart = input.trimStart();
    const match = /^\/(?:btw|side)(?=\s|$)/i.exec(trimmedStart);
    if (!match) {
        return { matched: false };
    }
    const rawQuestion = trimmedStart.slice(match[0].length);
    const question = (0, exports.normalizeCoworkBtwQuestion)(rawQuestion);
    if (!question) {
        return {
            matched: true,
            question: '',
            error: exports.CoworkBtwCommandValidationError.EmptyQuestion,
        };
    }
    if (/[\r\n]/.test(rawQuestion)) {
        return {
            matched: true,
            question,
            error: exports.CoworkBtwCommandValidationError.MultilineUnsupported,
        };
    }
    return { matched: true, question };
}
//# sourceMappingURL=btw.js.map