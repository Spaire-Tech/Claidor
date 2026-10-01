import { installVoiceCallPreloadEntrypoint, loadVoiceCallPreloadElectron } from "../preload-voice-call.js";

installVoiceCallPreloadEntrypoint(loadVoiceCallPreloadElectron(require("electron")));
