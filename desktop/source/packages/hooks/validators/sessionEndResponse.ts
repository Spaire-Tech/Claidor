import { validateBaseHookResponse } from "./baseHookResponse.js";

/** At a session's end, a hook's answer only has to be an object: this is the base check itself, under the step's name. */
export const validateSessionEndResponse = validateBaseHookResponse;
