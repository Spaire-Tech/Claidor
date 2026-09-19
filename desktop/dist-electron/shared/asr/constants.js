"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.AsrRealtimeEventType = exports.AsrApiCode = exports.AsrLangType = exports.AsrIpcChannel = void 0;
exports.AsrIpcChannel = {
    CreateRealtimeSession: 'asr:realtime:createSession',
};
exports.AsrLangType = {
    ZhChs: 'zh-CHS',
};
exports.AsrApiCode = {
    Unauthorized: 401,
    AuthTokenInvalid: 40100,
    ConfigInvalid: 41400,
    AudioInvalid: 41401,
    AudioTooLarge: 41402,
    AudioTooLong: 41403,
    DailyLimitExceeded: 41404,
    UpstreamAuthFailed: 41405,
    UpstreamRateLimited: 41406,
    RecognitionFailed: 41407,
    UpstreamError: 50201,
    UpstreamBalanceInsufficient: 50203,
    UpstreamInvalidParams: 50204,
};
exports.AsrRealtimeEventType = {
    Started: 'started',
    Recognition: 'recognition',
    Closed: 'closed',
    Error: 'error',
};
//# sourceMappingURL=constants.js.map