/**
 * The name of the model on a piece of reasoning. The engine keeps it in the
 * piece's options, under our own provider's name, so that it travels with
 * the piece: to the wire when the piece is sent, and back onto the piece
 * when an answer is read.
 */

/** The model's name a part carries in its options, when it carries one and the name is a text. */
export function getSimeonModelName(part: { providerOptions?: { simeon?: { modelName?: unknown } } }): string | undefined {
  const name = part.providerOptions?.simeon?.modelName;
  if (typeof name !== "string") return undefined;
  return name;
}

/**
 * The options that carry a model's name, ready to be spread into a part.
 * With no name there is nothing to spread.
 */
export function providerOptionsFromModelName(modelName: string | undefined): Record<string, unknown> {
  if (modelName === undefined) return {};
  return { providerOptions: { simeon: { modelName } } };
}
