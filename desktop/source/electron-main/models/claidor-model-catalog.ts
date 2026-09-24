import { AvailableModelsResponse, AvailableModelsResponse_AvailableModel } from "../../packages/proto/generated/aiserver/v1/aiserver_pb.js";
import { claidorApiData, type ClaidorApiAuth } from "../../shared/node/cursor-backend/claidor-api.js";

// The model picker, on Simeon Labs' server's own menu.
//
// Until 24 September 2026 the Mac's `getAvailableModels` binding
// (`main-production-services.ts`, `fetchAvailableModels`) called
// `aiserver.v1.AiService/AvailableModels` through `fetchSandAvailableModels`,
// a Connect RPC that Simeon Labs' server never served, so the picker got a
// 404 wrapped as a ConnectError and the renderer showed the error instead
// of a list. The menu the server does serve is `GET /desktop/api/models/available`
// (`server/polar/desktop/endpoints.py`, `models_available`), one row per
// `DesktopModel.available()` in `pricing.py`. This file reads that and hands
// back the same `AvailableModelsResponse` the edge already serialises with
// `toJson()`, so nothing between the binding and the renderer changed.
//
// `fetchSandAvailableModels` stays in the tree for the cloud-agent path
// (`host/extensions/cloud-agents/model-catalog-fetch.ts` speaks the same
// RPC); the Mac binding no longer calls it.

export const CLAIDOR_AVAILABLE_MODELS_PATH = "models/available";

/** One row of `/desktop/api/models/available`, as `pricing.py` writes it. */
export interface ClaidorAvailableModelRow {
  readonly modelId: string;
  readonly modelName?: string;
  readonly provider?: string;
  readonly description?: string;
  readonly costMultiplier?: number;
  /** The server's word; `available` is read too in case a row ever carries it. */
  readonly accessible?: boolean;
  readonly available?: boolean;
  readonly supportsImage?: boolean;
  readonly supportsThinking?: boolean;
  readonly supportsToolCalling?: boolean;
  readonly agenticReady?: boolean;
  /** `primary`, `cheap` or `fallback` (`pricing.py`, `ModelRole`). */
  readonly role?: string | null;
  readonly contextWindow?: number;
  readonly maxTokens?: number;
}

function isRow(value: unknown): value is ClaidorAvailableModelRow {
  return typeof value === "object" && value != null && !Array.isArray(value) && typeof (value as { modelId?: unknown }).modelId === "string" && (value as { modelId: string }).modelId.trim().length > 0;
}

function nonEmpty(value: unknown): string | undefined {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : undefined;
}

/**
 * The rows a person may pick from: a row marked not available is left off,
 * and so is a `fallback` role, which `pricing.py` says is "never shown,
 * never in a menu". A `primary` row is the one on by default.
 */
export function availableModelFromClaidorRow(row: ClaidorAvailableModelRow): AvailableModelsResponse_AvailableModel | null {
  if (row.accessible === false || row.available === false || row.role === "fallback") return null;
  const displayName = nonEmpty(row.modelName);
  const description = nonEmpty(row.description);
  const vendor = nonEmpty(row.provider);
  const contextTokenLimit = typeof row.contextWindow === "number" && Number.isFinite(row.contextWindow) && row.contextWindow > 0 ? Math.floor(row.contextWindow) : undefined;
  return new AvailableModelsResponse_AvailableModel({
    name: row.modelId,
    defaultOn: row.role === "primary",
    serverModelName: row.modelId,
    ...(displayName === undefined ? {} : { clientDisplayName: displayName }),
    ...(description === undefined ? {} : { tagline: description }),
    supportsAgent: row.agenticReady !== false && row.supportsToolCalling !== false,
    supportsImages: row.supportsImage !== false,
    supportsThinking: row.supportsThinking === true,
    supportsMaxMode: false,
    supportsNonMaxMode: true,
    isHidden: false,
    isChatOnly: false,
    isLongContextOnly: false,
    ...(contextTokenLimit === undefined ? {} : { contextTokenLimit }),
    ...(typeof row.costMultiplier === "number" && Number.isFinite(row.costMultiplier) ? { price: row.costMultiplier } : {}),
    ...(vendor === undefined ? {} : { vendorName: vendor }),
  });
}

export function availableModelsResponseFromClaidor(rows: unknown): AvailableModelsResponse {
  const models: AvailableModelsResponse_AvailableModel[] = [];
  if (Array.isArray(rows)) {
    for (const row of rows) {
      if (!isRow(row)) continue;
      const model = availableModelFromClaidorRow(row);
      if (model != null) models.push(model);
    }
  }
  // Exactly one default: the first primary, or the first row when the
  // server named none, so the picker never opens on nothing.
  const firstDefault = models.findIndex((model) => model.defaultOn);
  for (const [index, model] of models.entries()) model.defaultOn = index === (firstDefault < 0 ? 0 : firstDefault);
  return new AvailableModelsResponse({ models });
}

export interface ClaidorModelCatalogOptions extends ClaidorApiAuth {
  readonly fetch?: typeof fetch;
}

export async function fetchClaidorAvailableModels(options: ClaidorModelCatalogOptions): Promise<AvailableModelsResponse> {
  const rows = await claidorApiData<unknown>(options, CLAIDOR_AVAILABLE_MODELS_PATH, {
    method: "GET",
    ...(options.fetch === undefined ? {} : { fetch: options.fetch }),
  });
  return availableModelsResponseFromClaidor(rows);
}
