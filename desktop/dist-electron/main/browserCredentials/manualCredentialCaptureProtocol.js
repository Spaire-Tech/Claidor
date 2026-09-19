"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.parseManualCredentialCaptureEvent = exports.ManualCredentialFormKind = exports.ManualCredentialCaptureEventType = exports.ManualCredentialCaptureChannel = void 0;
exports.ManualCredentialCaptureChannel = {
    Event: 'lobster:browser-credential:capture-event',
};
exports.ManualCredentialCaptureEventType = {
    Submitted: 'submitted',
    PageState: 'page-state',
};
exports.ManualCredentialFormKind = {
    Login: 'login',
    Registration: 'registration',
};
const parseManualCredentialCaptureEvent = (value) => {
    if (!value || typeof value !== 'object' || Array.isArray(value))
        return null;
    const event = value;
    if (event.type === exports.ManualCredentialCaptureEventType.PageState) {
        return typeof event.hasPasswordField === 'boolean'
            ? { type: exports.ManualCredentialCaptureEventType.PageState, hasPasswordField: event.hasPasswordField }
            : null;
    }
    if (event.type !== exports.ManualCredentialCaptureEventType.Submitted)
        return null;
    if (typeof event.username !== 'string' || typeof event.password !== 'string')
        return null;
    if (!Object.values(exports.ManualCredentialFormKind).includes(event.formKind)) {
        return null;
    }
    return {
        type: exports.ManualCredentialCaptureEventType.Submitted,
        username: event.username,
        password: event.password,
        formKind: event.formKind,
    };
};
exports.parseManualCredentialCaptureEvent = parseManualCredentialCaptureEvent;
//# sourceMappingURL=manualCredentialCaptureProtocol.js.map