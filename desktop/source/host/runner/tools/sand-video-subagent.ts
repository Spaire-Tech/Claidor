// The watchVideo and videoReview subagents, registered again (25 September
// 2026, docs/product/video-served.md). Grok Bot's Task tool knows both
// types by their proto cases (`subagent-config.ts`, `getSubagentTypeName`:
// `watchVideo` → "watchVideo", `mediaReview` → "videoReview";
// `isGeminiVideoSubagentType` is what lets a Task carry a video in
// `file_attachments`, up to the inline limit). What was missing was a
// config in `resolveSubagentConfigs` (host-runner-composition.ts) and a
// model that can see: `userRequestedModelId` pins the child to the video
// model, which `resolveSubagentModel` accepts as is (the production Task
// options say every model is valid), so the Task's `resolvedModelId` says
// gemini and the attachment path stops refusing the video.
import { configuredClaidorVideoModel, VIDEO_INLINE_MAX_MB } from "../../../shared/video-availability.js";

export const WATCH_VIDEO_SUBAGENT_TYPE = "watchVideo";
export const VIDEO_REVIEW_SUBAGENT_TYPE = "videoReview";

const normalize = (value: string): string => value.replace(/[-_ ]/g, "").toLowerCase();

/** Either of the two video types, in any of the spellings the Task tool accepts (`normalizeSubagentTypeName`: mediaReview is videoReview). */
export const isVideoSubagentType = (value: string | null | undefined): boolean => {
  if (value == null) return false;
  const normalized = normalize(value);
  return normalized === normalize(WATCH_VIDEO_SUBAGENT_TYPE) || normalized === normalize(VIDEO_REVIEW_SUBAGENT_TYPE) || normalized === "mediareview";
};

const SHARED = [
  `Pass the video's box path in file_attachments (a video the user attached, or one under /workspace); each video may be up to ${VIDEO_INLINE_MAX_MB} MB in this build, and a larger one has to be trimmed or transcoded on your computer first (ffmpeg).`,
  "It runs in the background like any Task: you are notified when it finishes, so do not poll or await it.",
  "It runs headless and cannot ask follow-ups, so say exactly what to look for or answer, and what to report back.",
].join(" ");

export const WATCH_VIDEO_SUBAGENT_DESCRIPTION = [
  "Delegate watching a video to a background subagent that can actually see and hear it: it watches the attached video on a video-capable model and reports back in text what happens, what is said, what is on screen at a moment, or the answer to a question about it.",
  SHARED,
].join(" ");

export const VIDEO_REVIEW_SUBAGENT_DESCRIPTION = [
  "Delegate reviewing a recording to a background subagent that can see and hear it: a screen recording, a demo, a meeting, a clip to critique. It watches the attached video on a video-capable model and returns a structured review — what happened step by step, issues it noticed, timestamps that matter.",
  "Prefer watchVideo for a plain question about a video; use videoReview when you want a review or a play-by-play.",
  SHARED,
].join(" ");

// The same plain-object shape the computerUse and browserUse configs use
// (`sand-computer-use-subagent.ts`); the Task tool reads
// `subagent_type.type.case` off it. The proto cases are the real ones, so
// `isGeminiVideoSubagentType` says yes and the video travels.
export function createSandVideoSubagentConfigs(modelId: string = configuredClaidorVideoModel()) {
  return [
    {
      subagent_type: { type: { case: "watchVideo", value: {} } },
      description: WATCH_VIDEO_SUBAGENT_DESCRIPTION,
      preserveTaskTool: false,
      subagentSource: "builtin" as const,
      userRequestedModelId: modelId,
    },
    {
      subagent_type: { type: { case: "mediaReview", value: {} } },
      description: VIDEO_REVIEW_SUBAGENT_DESCRIPTION,
      preserveTaskTool: false,
      subagentSource: "builtin" as const,
      userRequestedModelId: modelId,
    },
  ] as const;
}
