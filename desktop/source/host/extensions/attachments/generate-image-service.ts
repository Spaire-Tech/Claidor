import { createClaidorGenerateImageService } from "../../../shared/node/cursor-backend/claidor-generate-image.js";

export class SandGenerateImagePersistError extends Error {}
export interface GenerateImageAuth { readonly getAccessToken: () => Promise<string>; readonly getMachineId: () => Promise<string> }
export interface GeneratedImage { readonly imageData: string; readonly mimeType: string }
export interface PersistedImage { readonly absolutePath: string }

// Composition builds this service into runnerOptions but never hands it to
// createGenerateImageToolInputs (host-runner-composition is outside the images
// lane allowlist). Register the live service here so turn-toolset can attach
// GenerateImage when the provider omits it.
export type SandGenerateImageServiceFn = (
  ctx: unknown,
  description: string,
  filePath: string,
  referenceImages?: readonly { data: string; mimeType: string }[],
  aspectRatio?: string,
) => Promise<{ filePath: string; imageData: string; usage?: unknown }>;

let registeredSandGenerateImageService: SandGenerateImageServiceFn | undefined;

export function getRegisteredSandGenerateImageService(): SandGenerateImageServiceFn | undefined {
  return registeredSandGenerateImageService;
}

export function createSandGenerateImageService<Context>(auth: GenerateImageAuth, options: {
  readonly persistImage: (bytes: Uint8Array, mimeType: string) => Promise<PersistedImage | null>;
  readonly onRequestId?: (id: string) => void;
}) {
  const generateImage = createClaidorGenerateImageService({ getAccessToken: auth.getAccessToken });
  const service = async (ctx: Context, description: string, _filePath: string, referenceImages?: readonly { data: string; mimeType: string }[], aspectRatio?: string) => {
    const generated = await generateImage(ctx, description, referenceImages, aspectRatio);
    const persisted = await options.persistImage(Buffer.from(generated.imageData, "base64"), generated.mimeType);
    if (persisted == null) throw new SandGenerateImagePersistError("Failed to save the generated image into the agent's media store.");
    // The server's usage object rides along so the tool's `addTurnUsage` sees it (F-241).
    return { filePath: persisted.absolutePath, imageData: generated.imageData, ...(generated.usage === undefined ? {} : { usage: generated.usage }) };
  };
  registeredSandGenerateImageService = service as SandGenerateImageServiceFn;
  return service;
}
