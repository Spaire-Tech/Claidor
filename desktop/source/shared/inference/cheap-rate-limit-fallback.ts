import { asError } from "../errors.js";
import { isProviderRateLimitError } from "../provider-rate-limit.js";

export type CheapRateLimitStream<TPart, TResponse, TUsage, TExtended, TMetadata> = {
  readonly fullStream: AsyncIterable<TPart>;
  readonly response: Promise<TResponse>;
  readonly usage: Promise<TUsage>;
  readonly extendedUsage: Promise<TExtended>;
  readonly providerMetadata: Promise<TMetadata>;
  readonly invocationId: Promise<string>;
};

function deferred<T>() {
  return Promise.withResolvers<T>();
}

function ignoreSettled<TPart, TResponse, TUsage, TExtended, TMetadata>(
  executor: CheapRateLimitStream<TPart, TResponse, TUsage, TExtended, TMetadata>,
): void {
  void executor.response.catch(() => undefined);
  void executor.usage.catch(() => undefined);
  void executor.extendedUsage.catch(() => undefined);
  void executor.providerMetadata.catch(() => undefined);
}

export function withCheapRateLimitFallback<TPart, TResponse, TUsage, TExtended, TMetadata>(
  primary: CheapRateLimitStream<TPart, TResponse, TUsage, TExtended, TMetadata>,
  fallback: () => CheapRateLimitStream<TPart, TResponse, TUsage, TExtended, TMetadata>,
): CheapRateLimitStream<TPart, TResponse, TUsage, TExtended, TMetadata> {
  ignoreSettled(primary);
  const resultResponse = deferred<TResponse>();
  const usage = deferred<TUsage>();
  const extendedUsage = deferred<TExtended>();
  const metadata = deferred<TMetadata>();
  resultResponse.promise.catch(() => undefined);
  usage.promise.catch(() => undefined);
  extendedUsage.promise.catch(() => undefined);
  metadata.promise.catch(() => undefined);
  const fail = (error: unknown) => {
    const next = asError(error);
    resultResponse.reject(next);
    usage.reject(next);
    extendedUsage.reject(next);
    metadata.reject(next);
  };
  const take = async function* (
    executor: CheapRateLimitStream<TPart, TResponse, TUsage, TExtended, TMetadata>,
  ) {
    for await (const part of executor.fullStream) yield part;
    resultResponse.resolve(await executor.response);
    usage.resolve(await executor.usage);
    extendedUsage.resolve(await executor.extendedUsage);
    metadata.resolve(await executor.providerMetadata);
  };
  const fullStream = (async function* () {
    try {
      yield* take(primary);
    } catch (error) {
      if (!isProviderRateLimitError(error)) {
        fail(error);
        throw error;
      }
      try {
        const cheap = fallback();
        ignoreSettled(cheap);
        yield* take(cheap);
      } catch (cheapError) {
        fail(cheapError);
        throw cheapError;
      }
    }
  })();
  return {
    fullStream,
    response: resultResponse.promise,
    usage: usage.promise,
    extendedUsage: extendedUsage.promise,
    providerMetadata: metadata.promise,
    invocationId: primary.invocationId,
  };
}
