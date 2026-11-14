/**
 * A goal an agent keeps working toward across turns: whose it is, whether
 * its state is fit to continue from, and the clock of the time worked on it.
 *
 * The clock counts only while the goal is active. `activeDurationMs` is the
 * time counted so far; `lastAccruedAtMs` is when counting last started, and
 * is there only while the goal is active. Both are milliseconds.
 */

/** The status of a goal that is being worked on. The number is the wire's own (`GOAL_STATUS_ACTIVE`). */
export const GOAL_STATUS_ACTIVE = 1;

/** What a goal's id looks like: five groups of hexadecimal digits, 8-4-4-4-12, in either case. */
export const GOAL_ID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export interface GoalState {
  activeDurationMs?: bigint;
  lastAccruedAtMs?: bigint;
  status?: number;
  goalId: string;
  conversationId?: string;
  agentSessionId?: string;
}

/** Who asks about a goal: the conversation, and the agent's session when there is one. */
interface GoalIdentity {
  conversationId: string;
  agentSessionId?: string;
}

/** The time counted so far, as a number. A goal with no state, or no count yet, has worked no time. */
export function goalWorkedMs(goalState: GoalState | null | undefined): number {
  return Number(goalState?.activeDurationMs ?? 0n);
}

/**
 * The time worked up to `nowMs`: what was counted, plus the time since
 * counting started at `accrualAnchorMs`. Nothing is added when no counting
 * is under way, and never less than nothing when the start lies after now.
 */
export function goalElapsedMsFrom(
  accruedMs: number,
  accrualAnchorMs: number | undefined,
  nowMs: number,
): number {
  if (accrualAnchorMs === undefined) {
    return accruedMs;
  }
  return accruedMs + Math.max(0, nowMs - accrualAnchorMs);
}

/** The time worked on a goal up to `nowMs`, read from its state. */
export function goalElapsedMs(goalState: GoalState | null | undefined, nowMs: number): number {
  const startedAt = goalState?.lastAccruedAtMs;
  return goalElapsedMsFrom(goalWorkedMs(goalState), startedAt === undefined ? undefined : Number(startedAt), nowMs);
}

/** The clock of a goal that becomes active at `nowMs`: what it had counted is kept, and counting starts now. */
export function goalClockOnActivation(
  goalState: GoalState | null | undefined,
  nowMs: number,
): { activeDurationMs: bigint; lastAccruedAtMs: bigint } {
  return {
    activeDurationMs: goalState?.activeDurationMs ?? 0n,
    lastAccruedAtMs: BigInt(nowMs),
  };
}

/**
 * The clock of a goal that stops being active at `nowMs`: the time up to
 * now is counted, and counting stops. `lastAccruedAtMs` is given as
 * undefined, so that laid over a state it takes the start away.
 */
export function goalClockOnDeactivation(
  goalState: GoalState | null | undefined,
  nowMs: number,
): { activeDurationMs: bigint; lastAccruedAtMs: undefined } {
  return {
    activeDurationMs: BigInt(goalElapsedMs(goalState, nowMs)),
    lastAccruedAtMs: undefined,
  };
}

/**
 * Whether the agent's session may act on the goal. A goal with no owner on
 * record is anyone's. One with an owner needs that very session named: an
 * owner or a session that is empty text never matches.
 */
export function isGoalOwnerValid(goalState: GoalState, agentSessionId: string | undefined): boolean {
  const owner = goalState.agentSessionId;
  if (owner === undefined) {
    return true;
  }
  return owner.length > 0 && agentSessionId !== undefined && agentSessionId.length > 0 && owner === agentSessionId;
}

/** Whether the goal is the asker's: by its conversation when no owner is on record, by its owner otherwise. */
export function isGoalIdentityValid(goalState: GoalState, identity: GoalIdentity): boolean {
  if (goalState.agentSessionId === undefined) {
    return goalState.conversationId === identity.conversationId;
  }
  return isGoalOwnerValid(goalState, identity.agentSessionId);
}

/**
 * Whether a goal's state is fit to continue from: there is one, it is the
 * asker's, it is active, and its id is well made. Checked in that order.
 */
export function isGoalStateShapeValid(goalState: GoalState | undefined, identity: GoalIdentity): boolean {
  if (goalState === undefined) {
    return false;
  }
  if (!isGoalIdentityValid(goalState, identity)) {
    return false;
  }
  if (goalState.status !== GOAL_STATUS_ACTIVE) {
    return false;
  }
  return GOAL_ID_PATTERN.test(goalState.goalId);
}
