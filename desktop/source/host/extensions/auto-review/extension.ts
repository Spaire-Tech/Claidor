import { defineHostExtension } from "../../../internal/host-extensions.js";
import { SAND_AUTO_REVIEW_HOST_GENERATION } from "../../runner/sand-auto-review.js";
import { HostExtensions } from "../extension-ids.generated.js";
import {
  AutoReviewService,
  parseLocalAutoReviewMode,
  type AutoReviewServiceDeps,
} from "./auto-review-service.js";
import { SAND_SUMMARIZATION_MODEL_ID } from "../../../shared/agents/sand-agent-model.js";
import { createSimeonSmartModeClassifierExecutor } from "./simeon-smart-mode-classifier-exec.js";

// The classifier runs on Simeon's own model path (see
// simeon-smart-mode-classifier-exec.ts); Cursor's `ClassifySandAutoReview`
// exec stays in the tree unreferenced. `auth` is kept on the service's deps
// for its shape; the classifier does not use it.
type AutoReviewAuth = unknown;
type AutoReviewClassifier = ReturnType<typeof createSimeonSmartModeClassifierExecutor>;
interface AutoReviewInferencePort {
  readonly port: {
    createSession(
      onRequestId: (requestId: string) => void,
      options?: Readonly<Record<string, unknown>>,
    ): { getExecutor(): unknown };
  };
}
type AutoReviewDependencies = Omit<
  AutoReviewServiceDeps<AutoReviewClassifier, AutoReviewAuth>,
  "hostGeneration" | "localMode" | "now" | "createClassifierExecutor"
> & {
  readonly transcript: AutoReviewServiceDeps<AutoReviewClassifier, AutoReviewAuth>["transcript"] & {
    createAwaitingStateSink(): AutoReviewServiceDeps<AutoReviewClassifier, AutoReviewAuth>["awaitingSink"];
    listAgentIds(): Promise<readonly string[]>;
    expireAllPendingAutoReviewApprovalCards(): Promise<unknown>;
  };
};

export const autoReviewExtension = defineHostExtension<
  AutoReviewService<AutoReviewClassifier, AutoReviewAuth>
>({
  id: HostExtensions.AutoReview,
  dependencies: [
    HostExtensions.Auth,
    HostExtensions.Experiments,
    HostExtensions.Inference,
    HostExtensions.Settings,
    HostExtensions.Telemetry,
    HostExtensions.Transcript,
  ],
  start: (context) => {
    const auth = context.deps[HostExtensions.Auth] as AutoReviewAuth;
    const inference = context.deps[HostExtensions.Inference] as AutoReviewInferencePort;
    const experiments = context.deps[HostExtensions.Experiments] as AutoReviewDependencies["experiments"];
    const settings = context.deps[HostExtensions.Settings] as AutoReviewDependencies["settings"];
    const telemetry = (context.deps[HostExtensions.Telemetry] as {
      logs: AutoReviewDependencies["telemetry"];
    }).logs;
    const transcript = context.deps[HostExtensions.Transcript] as AutoReviewDependencies["transcript"];
    const service = new AutoReviewService({
      auth,
      experiments,
      settings,
      telemetry,
      awaitingSink: transcript.createAwaitingStateSink(),
      transcript,
      hostGeneration: SAND_AUTO_REVIEW_HOST_GENERATION,
      localMode: parseLocalAutoReviewMode(process.env.SAND_AUTO_REVIEW_MODE)!,
      createClassifierExecutor: () => createSimeonSmartModeClassifierExecutor({
        createExecutor: () => inference.port.createSession(() => {}, {
          modelId: SAND_SUMMARIZATION_MODEL_ID,
          isSummarizationSession: true,
          skipLabeling: true,
        }).getExecutor() as Parameters<typeof createSimeonSmartModeClassifierExecutor>[0]["createExecutor"] extends () => infer R ? R : never,
      }),
    });
    context.onStop(() => service.stop());
    const startedAtMs = Date.now();
    const sweepBadges = () => service.sweepStaleAwaitingBadges(
      () => transcript.listAgentIds(),
      startedAtMs,
    );
    void transcript.expireAllPendingAutoReviewApprovalCards().then(sweepBadges, sweepBadges);
    return service;
  },
});
