import { validateBaseHookResponse } from "./baseHookResponse.js";

/** After a file is edited, a hook's answer only has to be an object: this is the base check itself, under the step's name. */
export const validateAfterEditFileResponse = validateBaseHookResponse;
