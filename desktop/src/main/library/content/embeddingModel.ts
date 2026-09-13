import { env, type FeatureExtractionPipeline, pipeline } from '@huggingface/transformers';

import {
  LIBRARY_EMBEDDING_MODEL_ID,
  LibraryContentLimits,
} from '../../../shared/library/contentConstants';

/**
 * The local embedding model (bge-small-en-v1.5, quantised) through
 * transformers.js. The files ship inside the installer; nothing is fetched.
 */

export type LibraryEmbedFunction = (texts: string[]) => Promise<Float32Array[]>;

export interface LibraryEmbeddingModel {
  embed: LibraryEmbedFunction;
  dispose: () => Promise<void>;
}

/** How many passages go through the model in one call. */
export const EMBED_BATCH_SIZE = 16;

const splitVectors = (data: ArrayLike<number>, count: number, dims: number): Float32Array[] => {
  const vectors: Float32Array[] = [];
  for (let index = 0; index < count; index += 1) {
    const vector = new Float32Array(dims);
    const offset = index * dims;
    for (let position = 0; position < dims; position += 1) vector[position] = data[offset + position];
    vectors.push(vector);
  }
  return vectors;
};

export const loadLibraryEmbeddingModel = async (modelDir: string): Promise<LibraryEmbeddingModel> => {
  env.allowRemoteModels = false;
  env.allowLocalModels = true;
  env.localModelPath = modelDir;
  env.cacheDir = modelDir;
  const extractor: FeatureExtractionPipeline = await pipeline(
    'feature-extraction',
    LIBRARY_EMBEDDING_MODEL_ID,
    { dtype: 'q8' },
  );

  const embedBatch = async (texts: string[]): Promise<Float32Array[]> => {
    const output = await extractor(texts, { pooling: 'cls', normalize: true });
    try {
      const dims = output.dims[output.dims.length - 1];
      if (dims !== LibraryContentLimits.EmbeddingDimensions) {
        throw new Error(`embedding has ${dims} dimensions, expected ${LibraryContentLimits.EmbeddingDimensions}`);
      }
      return splitVectors(output.data as ArrayLike<number>, texts.length, dims);
    } finally {
      output.dispose();
    }
  };

  return {
    embed: async (texts) => {
      const vectors: Float32Array[] = [];
      for (let start = 0; start < texts.length; start += EMBED_BATCH_SIZE) {
        vectors.push(...await embedBatch(texts.slice(start, start + EMBED_BATCH_SIZE)));
      }
      return vectors;
    },
    dispose: async () => {
      await extractor.dispose();
    },
  };
};
