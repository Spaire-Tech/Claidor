export const MediaGenerationTool = {
  Image: 'caisra_image_generate',
  Video: 'caisra_video_generate',
} as const;
export type MediaGenerationTool = typeof MediaGenerationTool[keyof typeof MediaGenerationTool];

export const MediaGenerationAction = {
  Generate: 'generate',
} as const;
export type MediaGenerationAction = typeof MediaGenerationAction[keyof typeof MediaGenerationAction];

export const MediaSelectionMode = {
  Auto: 'auto',
  Image: 'image',
  Video: 'video',
  None: 'none',
} as const;
export type MediaSelectionMode = typeof MediaSelectionMode[keyof typeof MediaSelectionMode];

export const MediaGenerationGateReason = {
  MediaNotEnabled: 'MEDIA_NOT_ENABLED',
  WrongMediaType: 'WRONG_MEDIA_TYPE',
} as const;
export type MediaGenerationGateReason = typeof MediaGenerationGateReason[keyof typeof MediaGenerationGateReason];

export type MediaSelectionState = {
  mode: MediaSelectionMode;
  modelId?: string;
  modelName?: string;
  imageModelId?: string;
  videoModelId?: string;
};

export type MediaGenerationGateResult =
  | { allowed: true }
  | { allowed: false; reason: MediaGenerationGateReason; message: string };

export const resolveMediaGenerationGate = (input: {
  action: string;
  tool: string;
  selection?: MediaSelectionState;
}): MediaGenerationGateResult => {
  if (input.action !== MediaGenerationAction.Generate) {
    return { allowed: true };
  }

  // **No selection is no longer a refusal, 18 September 2026.**
  //
  // This gate came from upstream, where a person picked a media model from
  // a picker beside the composer before the agent could make an image. That
  // picker lives on the upstream cowork screens, and this app does not draw
  // them: `App.tsx` mounts the Caisra shell, and nothing in
  // `renderer/design/` ever sets a media selection. So the gate could never
  // open, every `caisra_image_generate` call was refused with "no media
  // generation model has been selected by the user", and the product shipped
  // with no images at all.
  //
  // It is also the wrong shape for this product. The founder, 16 September:
  // *"my users should never put a key. everything happens under the hood.
  // not a setting."* Choosing an image model before asking for an image is a
  // setting. The agent decides whether a picture belongs, and the app picks
  // the model.
  //
  // A selection, when one exists, still wins — that is what the two checks
  // below are for, and the skin-pack flow sets one deliberately.
  if (!input.selection || input.selection.mode === MediaSelectionMode.None) {
    return { allowed: true };
  }

  if (input.selection?.mode === MediaSelectionMode.Image && input.tool === MediaGenerationTool.Video) {
    return {
      allowed: false,
      reason: MediaGenerationGateReason.WrongMediaType,
      message: 'Video generation is not available. The user selected an image generation model for this turn.',
    };
  }

  if (input.selection?.mode === MediaSelectionMode.Video && input.tool === MediaGenerationTool.Image) {
    return {
      allowed: false,
      reason: MediaGenerationGateReason.WrongMediaType,
      message: 'Image generation is not available. The user selected a video generation model for this turn.',
    };
  }

  return { allowed: true };
};
