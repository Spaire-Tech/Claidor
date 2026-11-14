import { validateBaseHookResponse } from "./baseHookResponse.js";

/** After a thought of the agent, a hook's answer only has to be an object: this is the base check itself, under the step's name. */
export const validateAfterAgentThoughtResponse = validateBaseHookResponse;
