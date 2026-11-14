/**
 * A turn's updates, questions and answers exist in two forms: plain, and
 * wrapped, where every private value is held with its privacy labels and
 * comes out only for a named purpose. A listener speaks one of the two.
 * The two functions here stand a listener of one form in front of a
 * listener of the other.
 *
 * Wrapping is done under the privacy mode the caller gives. Unwrapping asks
 * every value for the purpose that is always allowed
 * (`PrivacyCapability.UNSAFE_ALWAYS_ALLOWED`) and asks for nothing to be
 * enforced: what was wrapped comes back whole, under every mode.
 */
import type {
  InteractionQuery,
  InteractionResponse,
  InteractionUpdate,
} from "../proto/generated/agent/v1/agent_pb.js";
import {
  fromRedactedInteractionQuery,
  fromRedactedInteractionResponse,
  fromRedactedInteractionUpdate,
  toRedactedInteractionQuery,
  toRedactedInteractionResponse,
  toRedactedInteractionUpdate,
} from "../redacted-protos/generated/agent/v1/agent_redacted.js";
import { PrivacyCapability } from "../redaction/classification.js";
import type { PrivacyMode } from "../redaction/privacy-mode.js";

type MaybePromise<T> = T | Promise<T>;

/** A listener, for whichever form of update, question and answer it speaks. */
export interface InteractionListenerAdapter<Context, Update, Query, Response> {
  sendUpdate(ctx: Context, update: Update): MaybePromise<void>;
  query(ctx: Context, query: Query): MaybePromise<Response>;
  enqueuePostTurnEndedWork?: ((work: () => Promise<unknown>) => void) | undefined;
  flushPostTurnEndedWork?: ((ctx: Context) => MaybePromise<void>) | undefined;
}

type RedactedInteractionUpdate = ReturnType<typeof toRedactedInteractionUpdate>;
type RedactedInteractionQuery = ReturnType<typeof toRedactedInteractionQuery>;
type RedactedInteractionResponse = ReturnType<typeof toRedactedInteractionResponse>;

/** An unwrap as this file calls it: the wrapped form and the purpose, no options. */
type Unwrap<Wrapped, Plain> = (wrapped: Wrapped, purpose: PrivacyCapability) => Plain;

/** How one side's updates and questions become the other side's, and the other side's answers this side's. */
interface Turning<Update, Query, Response, DelegateUpdate, DelegateQuery, DelegateResponse> {
  update(update: Update): DelegateUpdate;
  query(query: Query): DelegateQuery;
  response(response: DelegateResponse): Response;
}

/**
 * A listener in front of `delegate` that speaks the other form. An update
 * and a question are turned and handed to the delegate, which is waited
 * for; the delegate's answer is turned back. The two fields for work after
 * the turn are there only when the delegate has them when this is made, and
 * hand the work on as it is.
 */
function inFrontOf<Context, Update, Query, Response, DelegateUpdate, DelegateQuery, DelegateResponse>(
  delegate: InteractionListenerAdapter<Context, DelegateUpdate, DelegateQuery, DelegateResponse>,
  turn: Turning<Update, Query, Response, DelegateUpdate, DelegateQuery, DelegateResponse>,
): InteractionListenerAdapter<Context, Update, Query, Response> {
  return {
    async sendUpdate(ctx, update) {
      await delegate.sendUpdate(ctx, turn.update(update));
    },
    async query(ctx, query) {
      return turn.response(await delegate.query(ctx, turn.query(query)));
    },
    enqueuePostTurnEndedWork: delegate.enqueuePostTurnEndedWork
      ? (work) => delegate.enqueuePostTurnEndedWork!(work)
      : undefined,
    flushPostTurnEndedWork: delegate.flushPostTurnEndedWork
      ? (ctx) => delegate.flushPostTurnEndedWork!(ctx)
      : undefined,
  };
}

/**
 * A plain listener in front of one that speaks the wrapped form: updates and
 * questions are wrapped under `privacyMode` for the delegate, and the
 * delegate's answers are unwrapped.
 */
export function toUnredactedInteractionListener<Context>(
  delegate: InteractionListenerAdapter<
    Context,
    RedactedInteractionUpdate,
    RedactedInteractionQuery,
    RedactedInteractionResponse
  >,
  privacyMode: PrivacyMode,
): InteractionListenerAdapter<Context, InteractionUpdate, InteractionQuery, InteractionResponse> {
  return inFrontOf(delegate, {
    update: (update: InteractionUpdate) => toRedactedInteractionUpdate(update, privacyMode),
    query: (query: InteractionQuery) => toRedactedInteractionQuery(query, privacyMode),
    response: (response) =>
      (fromRedactedInteractionResponse as unknown as Unwrap<RedactedInteractionResponse, InteractionResponse>)(
        response,
        PrivacyCapability.UNSAFE_ALWAYS_ALLOWED,
      ),
  });
}

/**
 * A listener that speaks the wrapped form in front of a plain one: updates
 * and questions are unwrapped for the delegate, and the delegate's answers
 * are wrapped under `privacyMode`.
 */
export function toRedactedInteractionListener<Context>(
  delegate: InteractionListenerAdapter<Context, InteractionUpdate, InteractionQuery, InteractionResponse>,
  privacyMode: PrivacyMode,
): InteractionListenerAdapter<
  Context,
  RedactedInteractionUpdate,
  RedactedInteractionQuery,
  RedactedInteractionResponse
> {
  return inFrontOf(delegate, {
    update: (update: RedactedInteractionUpdate) =>
      (fromRedactedInteractionUpdate as unknown as Unwrap<RedactedInteractionUpdate, InteractionUpdate>)(
        update,
        PrivacyCapability.UNSAFE_ALWAYS_ALLOWED,
      ),
    query: (query: RedactedInteractionQuery) =>
      (fromRedactedInteractionQuery as unknown as Unwrap<RedactedInteractionQuery, InteractionQuery>)(
        query,
        PrivacyCapability.UNSAFE_ALWAYS_ALLOWED,
      ),
    response: (response) => toRedactedInteractionResponse(response, privacyMode),
  });
}
