import fs from 'fs';
import path from 'path';
import { describe, expect, test } from 'vitest';

import {
  LIBRARY_EMBEDDING_MODEL_FILES,
  LIBRARY_EMBEDDING_MODEL_ID,
  LibraryContentLimits,
} from '../../../shared/library/contentConstants';

/**
 * Loads the real model through the worker's code path. Runs only when the
 * model has been fetched (npm run setup:embedding-model); it is never
 * committed, so CI without it skips this suite.
 */

const MODEL_DIR = path.resolve(__dirname, '..', '..', '..', '..', 'resources', 'embedding-model');

const modelPresent = LIBRARY_EMBEDDING_MODEL_FILES.every(file => (
  fs.existsSync(path.join(MODEL_DIR, ...LIBRARY_EMBEDDING_MODEL_ID.split('/'), ...file.split('/')))
));

const dot = (a: Float32Array, b: Float32Array): number => {
  let sum = 0;
  for (let index = 0; index < a.length; index += 1) sum += a[index] * b[index];
  return sum;
};

const norm = (vector: Float32Array): number => Math.sqrt(dot(vector, vector));

describe.skipIf(!modelPresent)('loadLibraryEmbeddingModel (real model)', () => {
  test('embeds normalized 384-dimensional vectors that rank a rent passage first', async () => {
    const { loadLibraryEmbeddingModel } = await import('./embeddingModel');
    const loadStarted = Date.now();
    const model = await loadLibraryEmbeddingModel(MODEL_DIR);
    const loadMs = Date.now() - loadStarted;
    try {
      const passages = [
        'The tenant shall pay rent of 2,400 euros on the first day of each month.',
        'Q3 marketing budget: 45,000 total, 12,000 for events, 8,000 for print.',
      ];
      const embedStarted = Date.now();
      const [rent, budget] = await model.embed(passages);
      const [query] = await model.embed(['how much is the rent']);
      const embedMs = Date.now() - embedStarted;
      console.log(`[LibraryWorker] test: model loaded in ${loadMs} ms, 3 texts embedded in ${embedMs} ms`);

      for (const vector of [rent, budget, query]) {
        expect(vector).toBeInstanceOf(Float32Array);
        expect(vector).toHaveLength(LibraryContentLimits.EmbeddingDimensions);
        expect(Array.from(vector).every(value => Number.isFinite(value))).toBe(true);
        expect(Math.abs(norm(vector) - 1)).toBeLessThan(1e-3);
      }
      const rentScore = dot(query, rent);
      const budgetScore = dot(query, budget);
      console.log(`[LibraryWorker] test: rent ${rentScore.toFixed(3)}, budget ${budgetScore.toFixed(3)}`);
      expect(rentScore).toBeGreaterThan(budgetScore);

      // Batches longer than the batch size come back complete and in order.
      // Padding inside a batch moves the quantised vectors slightly, so the
      // same text embedded alone is close to, not identical with, its batched vector.
      const many = Array.from({ length: 20 }, (_, index) => `Passage number ${index + 1} about topic ${index % 3}.`);
      const manyStarted = Date.now();
      const vectors = await model.embed(many);
      console.log(`[LibraryWorker] test: 20 passages embedded in ${Date.now() - manyStarted} ms`);
      expect(vectors).toHaveLength(20);
      const [first, last] = await model.embed([many[0], many[19]]);
      expect(Math.abs(dot(first, vectors[0]) - 1)).toBeLessThan(1e-2);
      expect(Math.abs(dot(last, vectors[19]) - 1)).toBeLessThan(1e-2);
      expect(dot(first, vectors[0])).toBeGreaterThan(dot(first, vectors[19]));
    } finally {
      await model.dispose();
    }
  }, 120_000);
});
