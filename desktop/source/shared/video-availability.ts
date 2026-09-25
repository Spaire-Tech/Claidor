/**
 * Watching a video is served (25 September 2026,
 * docs/product/video-served.md; ledger F-236, F-273, F-329).
 *
 * Grok Bot's watchVideo / videoReview subagents ran a Gemini model on
 * Cursor's inference service. Simeon Labs' server now serves Gemini's own
 * wire at `/desktop/api/proxy/v1beta/models/{model}:streamGenerateContent`
 * behind `CLAIDOR_GEMINI_API_KEY`, and the box's executor speaks it
 * (`host/extensions/inference/gemini-direct-generate.ts`), so the two
 * subagents are registered again and the brief says so.
 *
 * The box does not read the server's model list; the Mac does, for the
 * picker. So which model watches the video, and whether the subagent is
 * offered at all, are two environment values the Mac forwards into the
 * box (`SERVED_SWITCH_ENVS`, local-docker-host-connector.ts):
 * `SAND_VIDEO_SUBAGENT_SERVED=0` turns the subagent off and puts the
 * coming-soon sentence back in the brief; `SAND_CLAIDOR_VIDEO_MODEL`
 * names the model, default the server's video role, `gemini-2.5-flash`
 * (`server/polar/desktop/pricing.py`, `ModelRole.video`). A server with
 * no Gemini key answers the child's first call with 503 "The model
 * service is not configured.", which comes back as the Task's result.
 */
export const VIDEO_SUBAGENT_SERVED_ENV = "SAND_VIDEO_SUBAGENT_SERVED";
export const CLAIDOR_VIDEO_MODEL_ENV = "SAND_CLAIDOR_VIDEO_MODEL";
export const DEFAULT_CLAIDOR_VIDEO_MODEL = "gemini-2.5-flash";

/** Inline is the only path built: the box reads the file and sends its bytes with the request (`task-subagent-preparation.ts`, `getInlineVideoMaxBytes`); the signed-URL store for larger files is not served. */
export const VIDEO_INLINE_MAX_MB = 15;

export const VIDEO_COMING_SOON_SENTENCE =
  "You can't watch videos yet, and there is no subagent that can: when a video is attached or relevant, say so in one line and work from what the user tells you about it.";

export function isVideoSubagentServed(env: NodeJS.ProcessEnv = process.env): boolean {
  const raw = env[VIDEO_SUBAGENT_SERVED_ENV]?.trim();
  return raw === "0" ? false : true;
}

export function configuredClaidorVideoModel(env: NodeJS.ProcessEnv = process.env): string {
  return env[CLAIDOR_VIDEO_MODEL_ENV]?.trim() || DEFAULT_CLAIDOR_VIDEO_MODEL;
}

/** Grok Bot's rule (`attached-media.ts`, `isGeminiModelId`): a model whose id says gemini takes a video. */
export function isGeminiVideoModelId(modelId: string | undefined): boolean {
  return modelId != null && modelId.toLowerCase().includes("gemini");
}
