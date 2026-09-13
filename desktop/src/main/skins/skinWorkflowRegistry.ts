import {
  SkinWorkflowKind,
  type SkinWorkflowKind as SkinWorkflowKindValue,
} from '../../shared/skin/constants';
import { SkinPackSkillId } from '../../shared/skin/kit';
import {
  MediaSelectionMode,
  type MediaSelectionState,
} from '../mediaGenerationPolicy';

export interface SkinWorkflowSessionState {
  workflowKind: SkinWorkflowKindValue;
  draftSkinId?: string;
}

export interface ResolvedSkinWorkflowState {
  ownerSessionId: string;
  state: SkinWorkflowSessionState;
}

export interface PrepareSkinWorkflowTurnInput {
  sessionId: string;
  /** The skills the person chose for this turn. */
  skillIds?: string[];
  mediaSelection?: MediaSelectionState;
  mediaGenerationEntitled: boolean;
}

export interface PreparedSkinWorkflowTurn {
  workflowKind?: SkinWorkflowKindValue;
  mediaSelection?: MediaSelectionState;
}

export interface SkinWorkflowRegistryOptions {
  /** Whether the bundled appearance-designer skill is installed and switched on. */
  isSkinSkillEnabled: () => boolean;
  getParentSessionId: (sessionId: string) => string | null;
}

const MAX_PARENT_DEPTH = 16;

export class SkinWorkflowRegistry {
  private readonly states = new Map<string, SkinWorkflowSessionState>();

  constructor(private readonly options: SkinWorkflowRegistryOptions) {}

  prepareTurn(input: PrepareSkinWorkflowTurnInput): PreparedSkinWorkflowTurn {
    const requestedWorkflowKind = this.resolveTrustedWorkflowKind(input.skillIds);
    const workflowKind = requestedWorkflowKind
      ?? this.resolve(input.sessionId)?.state.workflowKind;
    if (!workflowKind) {
      return { mediaSelection: input.mediaSelection };
    }

    if (requestedWorkflowKind) {
      const existing = this.states.get(input.sessionId);
      if (!existing || existing.workflowKind !== workflowKind) {
        this.states.set(input.sessionId, { workflowKind });
      }
    }

    if (!input.mediaGenerationEntitled) {
      return { workflowKind };
    }

    const selectedImageModelId = input.mediaSelection?.imageModelId
      ?? (input.mediaSelection?.mode === MediaSelectionMode.Image
        ? input.mediaSelection.modelId
        : undefined);
    return {
      workflowKind,
      mediaSelection: {
        mode: MediaSelectionMode.Image,
        ...(selectedImageModelId ? { imageModelId: selectedImageModelId } : {}),
        ...(input.mediaSelection?.modelName
          ? { modelName: input.mediaSelection.modelName }
          : {}),
      },
    };
  }

  resolve(sessionId: string | null): ResolvedSkinWorkflowState | undefined {
    let current = sessionId?.trim() || null;
    const seen = new Set<string>();

    for (let depth = 0; current && depth < MAX_PARENT_DEPTH; depth += 1) {
      if (seen.has(current)) return undefined;
      seen.add(current);

      const state = this.states.get(current);
      if (state) {
        return {
          ownerSessionId: current,
          state,
        };
      }

      try {
        current = this.options.getParentSessionId(current);
      } catch (error) {
        console.warn('[SkinWorkflow] failed to resolve parent workflow state:', error);
        return undefined;
      }
    }

    return undefined;
  }

  recordDraft(sessionId: string, skinId: string): void {
    const resolved = this.resolve(sessionId);
    if (resolved) resolved.state.draftSkinId = skinId;
  }

  finishWorkflow(sessionId: string): void {
    const resolved = this.resolve(sessionId);
    if (resolved) this.states.delete(resolved.ownerSessionId);
  }

  handleRuntimeComplete(_sessionId: string): void {
    // Native image_generate finishes through a background wake after the
    // runtime emits complete. Keep the transaction until apply/deactivate,
    // an error, or session deletion. Follow-up turns may omit the skill after
    // the renderer clears its one-turn capability selection.
  }

  handleRuntimeError(sessionId: string): void {
    this.states.delete(sessionId);
  }

  handleSessionDeleted(sessionId: string): void {
    this.states.delete(sessionId);
  }

  /**
   * The workflow starts only when the person chose the bundled appearance
   * skill for this turn and that skill is really installed and enabled — the
   * renderer's selection alone is not trusted.
   */
  private resolveTrustedWorkflowKind(
    skillIds: string[] | undefined,
  ): SkinWorkflowKindValue | undefined {
    if (!skillIds?.includes(SkinPackSkillId.BuiltIn)) return undefined;
    return this.options.isSkinSkillEnabled()
      ? SkinWorkflowKind.SkinPack
      : undefined;
  }
}
