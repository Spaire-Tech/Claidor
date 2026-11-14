/**
 * Searching earlier conversations for a query.
 *
 * The resource holds both ends of that trip. Asked from afar, the request
 * goes out in an exec message as `conversationSearchArgs` and the answer is
 * read from the first message that comes back with `conversationSearchResult`.
 * Served here, a request under that name is handed to the implementation,
 * and what it answers goes back under the answer's name.
 */
import type { ConversationSearchArgs, ConversationSearchResult } from "../proto/generated/agent/v1/conversation_search_exec_pb.js";
import { SimpleControlledExecHandler } from "./controlled.js";
import { ExecutorResource, type Executor, type RemoteExecManager } from "./remote.js";
import { createResource, type ControlledExecManager } from "./resource-provider.js";
import { createClientDeserializer, createClientSerializer, createServerDeserializer, createServerSerializer } from "./serialization.js";

/** The names the request and its answer travel under. */
const REQUEST = "conversationSearchArgs";
const ANSWER = "conversationSearchResult";

type ConversationSearchExecutor = Executor<ConversationSearchArgs, ConversationSearchResult>;

export const conversationSearchExecutorResource = createResource<ConversationSearchExecutor, RemoteExecManager, ControlledExecManager>(
  (remote) => new ExecutorResource(remote, createServerSerializer(REQUEST), createClientDeserializer(ANSWER)),
  (implementation, served) => served.register(new SimpleControlledExecHandler(implementation, createServerDeserializer(REQUEST), createClientSerializer(ANSWER))),
);
