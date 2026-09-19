import { claidorProxyRequest, ClaidorApiError, type ClaidorApiAuth } from "./claidor-api.js";

// Pictures, on Claidor's `/images/generations` door
// (`server/polar/desktop/capabilities.py`). Until 19 September 2026 this was
// a Connect RPC call on `aiserver.v1.AiService/RunGenerateImage`, which
// Claidor never served; the tool that calls it
// (`packages/agent/tools/core/generate-image.ts`) and the avatar picker are
// unchanged, because the shape they were given is kept.

export class SandGenerateImageError extends Error {}
export class SandGenerateImageModelRestrictedError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SandGenerateImageModelRestrictedError";
  }
}

export type GenerateImageSize = "auto" | "1024x1024" | "1536x1024" | "1024x1536";

// The tool speaks in ratios; OpenAI's image model draws three shapes. Wide
// ratios take the wide one, tall the tall one, square the square one.
export function imageSizeForAspectRatio(aspectRatio: string | undefined): GenerateImageSize {
  switch (aspectRatio?.trim()) {
    case undefined:
    case "": return "auto";
    case "1:1": return "1024x1024";
    case "4:3":
    case "16:9": return "1536x1024";
    case "3:4":
    case "9:16": return "1024x1536";
    default: return "auto";
  }
}

export interface GenerateImageReference { readonly data: string; readonly mimeType: string }
export interface GeneratedImageBytes { readonly imageData: string; readonly mimeType: string; readonly usage?: unknown }

export interface ClaidorGenerateImageOptions extends ClaidorApiAuth {
  readonly fetch?: typeof fetch;
  readonly quality?: "auto" | "low" | "medium" | "high";
}

export function createClaidorGenerateImageService(options: ClaidorGenerateImageOptions) {
  return async (_context: unknown, description: string, referenceImages?: readonly GenerateImageReference[], aspectRatio?: string): Promise<GeneratedImageBytes> => {
    const references = (referenceImages ?? []).filter((image) => typeof image?.data === "string" && image.data.length > 0);
    let response: Response;
    try {
      response = await claidorProxyRequest(options, "images/generations", {
        ...(options.fetch === undefined ? {} : { fetch: options.fetch }),
        json: {
          prompt: description,
          size: imageSizeForAspectRatio(aspectRatio),
          quality: options.quality ?? "auto",
          ...(references.length === 0 ? {} : { reference_images: references.map((image) => ({ data: image.data, mime_type: image.mimeType })) }),
        },
      });
    } catch (error) {
      if (error instanceof ClaidorApiError) {
        // A 402 is the person's allowance, not the picture: the tool tells the
        // agent the model is closed to it rather than that the drawing failed.
        if (error.status === 402) throw new SandGenerateImageModelRestrictedError(error.message);
        throw new SandGenerateImageError(error.message);
      }
      throw new SandGenerateImageError(error instanceof Error ? error.message : String(error));
    }
    const body = (await response.json().catch(() => null)) as { data?: { b64_json?: unknown; mime_type?: unknown }[]; usage?: unknown } | null;
    const first = body?.data?.[0];
    if (typeof first?.b64_json !== "string" || first.b64_json.length === 0) throw new SandGenerateImageError("Image generation returned no picture.");
    return {
      imageData: first.b64_json,
      mimeType: typeof first.mime_type === "string" && first.mime_type.length > 0 ? first.mime_type : "image/png",
      ...(body?.usage === undefined ? {} : { usage: body.usage }),
    };
  };
}
