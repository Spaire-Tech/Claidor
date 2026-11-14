import { validateBaseHookResponse } from "./baseHookResponse.js";

/** After an MCP tool has run, a hook's answer only has to be an object: this is the base check itself, under the step's name. */
export const validateAfterMCPExecutionResponse = validateBaseHookResponse;
