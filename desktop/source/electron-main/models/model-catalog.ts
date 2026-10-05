import { AiService } from "../../packages/proto/simeon/v1/services.js";
import { AvailableModelsRequest, AvailableModelsScope } from "../../packages/proto/generated/aiserver/v1/aiserver_pb.js";
import { createSimeonBackendClient, type SandInferenceOptions } from "../../shared/node/simeon-backend/simeon-inference.js";

export const SAND_AVAILABLE_MODELS_SCOPE = "USER_AVAILABLE" as const;
export interface SandAvailableModelsClient<Result> { availableModels(request: { readonly useModelParameters: true; readonly scope: typeof SAND_AVAILABLE_MODELS_SCOPE }): Promise<Result> }
export async function fetchSandAvailableModels<Options, Result>(options: Options, createClient: (options: Options) => SandAvailableModelsClient<Result>): Promise<Result>;
export async function fetchSandAvailableModels(options: Omit<SandInferenceOptions, "backendUrl">): Promise<ReturnType<typeof createSimeonBackendClient<typeof AiService>> extends Promise<infer _> ? never : ReturnType<typeof createSimeonBackendClient<typeof AiService>>["availableModels"] extends (...args: never[]) => Promise<infer Result> ? Result : never>;
export async function fetchSandAvailableModels<Options, Result>(options: Options, ...args: [createClient?: (options: Options) => SandAvailableModelsClient<Result>]): Promise<Result> {
  const createClient = args[0];
  if (createClient != null) return createClient(options).availableModels({ useModelParameters: true, scope: SAND_AVAILABLE_MODELS_SCOPE });
  const client = createSimeonBackendClient(AiService, options as Omit<SandInferenceOptions, "backendUrl">);
  return await client.availableModels(new AvailableModelsRequest({
    useModelParameters: true,
    scope: AvailableModelsScope.USER_AVAILABLE,
  })) as Result;
}
