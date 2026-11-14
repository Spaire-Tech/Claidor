/**
 * The wire's two envelopes. The asking side sends an `ExecServerMessage`
 * that holds one request; the working side answers with `ExecClientMessage`s
 * that hold one answer each. Both carry the number the run is known by, and
 * name what they hold. These functions put a request or an answer into its
 * envelope under a given name, and take it out again when the name matches.
 */
import { ExecClientMessage, ExecServerMessage } from "../proto/generated/agent/v1/exec_pb.js";

export type Serializer<T, Message> = (id: number, value: T) => Message;
export type Deserializer<T, Message> = (message: Message) => { id: number; args: T } | undefined;

/** What an asking envelope can hold: each request's name with its type. */
type Request = Exclude<ExecServerMessage["message"], { case: undefined }>;
type RequestName = Request["case"];
type RequestNamed<Name extends RequestName> = Extract<Request, { case: Name }>["value"];

/** What an answering envelope can hold: each answer's name with its type. */
type Answer = Exclude<ExecClientMessage["message"], { case: undefined }>;
type AnswerName = Answer["case"];
type AnswerNamed<Name extends AnswerName> = Extract<Answer, { case: Name }>["value"];

/** Puts a request into a new asking envelope, under `argsKey`. */
export function createServerSerializer<Case extends RequestName>(argsKey: Case): Serializer<RequestNamed<Case>, ExecServerMessage> {
  return (id, args) => {
    const held = { case: argsKey, value: args } as Request;
    return new ExecServerMessage({ id, message: held });
  };
}

/** Takes the answer named `resultKey` out of an answering envelope; an envelope that holds anything else gives nothing. */
export function createClientDeserializer<Case extends AnswerName>(resultKey: Case): (message: ExecClientMessage) => AnswerNamed<Case> | undefined {
  return (envelope) => {
    const held = envelope.message;
    return held.case === resultKey ? (held.value as AnswerNamed<Case>) : undefined;
  };
}

/** Puts an answer into a new answering envelope, under `resultKey`. */
export function createClientSerializer<Case extends AnswerName>(resultKey: Case): Serializer<AnswerNamed<Case>, ExecClientMessage> {
  return (id, result) => {
    const held = { case: resultKey, value: result } as Answer;
    return new ExecClientMessage({ id, message: held });
  };
}

/** Takes the request named `argsKey` out of an asking envelope, with the envelope's number; any other envelope gives nothing. */
export function createServerDeserializer<Case extends RequestName>(argsKey: Case): Deserializer<RequestNamed<Case>, ExecServerMessage> {
  return (envelope) => {
    const held = envelope.message;
    if (held.case !== argsKey) return undefined;
    return { id: envelope.id, args: held.value as RequestNamed<Case> };
  };
}
