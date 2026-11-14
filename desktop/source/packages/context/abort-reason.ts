/**
 * What an abort was given as its reason, in fields that can be logged and
 * counted: its kind, and what it says when it is an error or a text.
 */
export function getAbortReasonInfo(reason: unknown) {
  if (reason === undefined) {
    return { abortReasonType: "undefined" };
  }
  if (typeof reason === "string") {
    return { abortReasonType: "string", abortReasonMessage: reason };
  }
  if (reason instanceof Error) {
    return { abortReasonType: "error", abortReasonName: reason.name, abortReasonMessage: reason.message };
  }
  // Anything else is told by its type alone: "object" for null, and for an error that was not made here.
  return { abortReasonType: typeof reason };
}
