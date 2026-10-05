export function getSimeonModelName(part: { providerOptions?: { simeon?: { modelName?: unknown } } }): string | undefined {
  const modelName = part.providerOptions?.simeon?.modelName;
  return typeof modelName === "string" ? modelName : undefined;
}

export function providerOptionsFromModelName(modelName: string | undefined): Record<string, unknown> {
  return modelName === undefined ? {} : { providerOptions: { simeon: { modelName } } };
}
