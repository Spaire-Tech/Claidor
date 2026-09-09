'use strict';

/**
 * Fetches the library's embedding model (Xenova/bge-small-en-v1.5, quantised)
 * from a pinned revision on the Hugging Face hub into
 * resources/embedding-model/, verifying every file's sha256. The model ships
 * inside the installer and is never committed.
 *
 * Node's built-in fetch honours HTTPS_PROXY only when NODE_USE_ENV_PROXY=1 is
 * set before Node starts, so the script re-runs itself with it when a proxy
 * is configured. Set NODE_EXTRA_CA_CERTS for a proxy with its own CA.
 */

const { createHash } = require('crypto');
const { spawnSync } = require('child_process');
const { createWriteStream, existsSync, mkdirSync, renameSync, rmSync, statSync } = require('fs');
const { readFile } = require('fs/promises');
const path = require('path');
const { pipeline } = require('stream/promises');
const { Readable } = require('stream');

const MODEL_ID = 'Xenova/bge-small-en-v1.5';
/** Commit of the model repository; look it up with https://huggingface.co/api/models/Xenova/bge-small-en-v1.5 */
const MODEL_REVISION = 'ea104dacec62c0de699686887e3f920caeb4f3e3';
const MODEL_HOST = 'https://huggingface.co';
/** Must match LIBRARY_EMBEDDING_MODEL_FILES in src/shared/library/contentConstants.ts */
const MODEL_FILES = Object.freeze({
  'config.json': 'fa73f90bf92c8cace1fbcb709626306f2bdbc9ea3e5b5f94b440df9b6aa56350',
  'tokenizer.json': 'd241a60d5e8f04cc1b2b3e9ef7a4921b27bf526d9f6050ab90f9267a1f9e5c66',
  'tokenizer_config.json': '9261e7d79b44c8195c1cada2b453e55b00aeb81e907a6664974b4d7776172ab3',
  'onnx/model_quantized.onnx': '6c9c6101a956d62dfb5e7190c538226c0c5bb9cb27b651234b6df063ee7dbfe4',
});

const MODEL_ROOT = path.join(__dirname, '..', 'resources', 'embedding-model');
const MODEL_DIR = path.join(MODEL_ROOT, ...MODEL_ID.split('/'));
const LOG_TAG = '[embedding-model]';

async function sha256OfFile(filePath) {
  return createHash('sha256').update(await readFile(filePath)).digest('hex');
}

/**
 * Returns the problems with the model folder: one line per file that is
 * missing or whose hash does not match. Empty when everything is in place.
 */
async function verifyEmbeddingModelDir(modelRoot = MODEL_ROOT) {
  const modelDir = path.join(modelRoot, ...MODEL_ID.split('/'));
  const problems = [];
  for (const [relative, expected] of Object.entries(MODEL_FILES)) {
    const filePath = path.join(modelDir, ...relative.split('/'));
    if (!existsSync(filePath) || !statSync(filePath).isFile()) {
      problems.push(`${relative}: missing`);
      continue;
    }
    const actual = await sha256OfFile(filePath);
    if (actual !== expected) problems.push(`${relative}: sha256 ${actual}, expected ${expected}`);
  }
  return problems;
}

function modelFileUrl(relative) {
  return `${MODEL_HOST}/${MODEL_ID}/resolve/${MODEL_REVISION}/${relative}`;
}

async function download(relative, targetPath) {
  const url = modelFileUrl(relative);
  const response = await fetch(url, { redirect: 'follow' });
  if (!response.ok || !response.body) {
    throw new Error(`${url} answered ${response.status} ${response.statusText}`);
  }
  mkdirSync(path.dirname(targetPath), { recursive: true });
  const partPath = `${targetPath}.part`;
  rmSync(partPath, { force: true });
  await pipeline(Readable.fromWeb(response.body), createWriteStream(partPath));
  renameSync(partPath, targetPath);
}

async function fetchEmbeddingModel() {
  console.log(`${LOG_TAG} ${MODEL_ID} @ ${MODEL_REVISION} -> ${MODEL_DIR}`);
  for (const [relative, expected] of Object.entries(MODEL_FILES)) {
    const targetPath = path.join(MODEL_DIR, ...relative.split('/'));
    if (existsSync(targetPath) && statSync(targetPath).isFile()) {
      const actual = await sha256OfFile(targetPath);
      if (actual === expected) {
        console.log(`${LOG_TAG} ${relative}: present, sha256 verified`);
        continue;
      }
      console.warn(`${LOG_TAG} ${relative}: sha256 ${actual} does not match, fetching again`);
      rmSync(targetPath, { force: true });
    }
    console.log(`${LOG_TAG} ${relative}: downloading`);
    const started = Date.now();
    await download(relative, targetPath);
    const actual = await sha256OfFile(targetPath);
    if (actual !== expected) {
      rmSync(targetPath, { force: true });
      throw new Error(
        `${relative} downloaded from ${modelFileUrl(relative)} has sha256 ${actual}, expected ${expected}. `
        + 'The file was deleted. Check MODEL_REVISION and the pinned hashes in scripts/fetch-embedding-model.cjs.',
      );
    }
    const size = statSync(targetPath).size;
    console.log(`${LOG_TAG} ${relative}: ${size} bytes in ${Date.now() - started} ms, sha256 verified`);
  }
  const problems = await verifyEmbeddingModelDir();
  if (problems.length > 0) {
    throw new Error(`model folder still incomplete after fetching: ${problems.join('; ')}`);
  }
  console.log(`${LOG_TAG} model ready at ${MODEL_DIR}`);
}

function hasProxyEnv() {
  return Boolean(
    process.env.HTTPS_PROXY || process.env.https_proxy || process.env.HTTP_PROXY || process.env.http_proxy,
  );
}

function main() {
  if (hasProxyEnv() && !process.env.NODE_USE_ENV_PROXY) {
    // Re-run with the proxy flag Node needs at startup.
    const result = spawnSync(process.execPath, [__filename, ...process.argv.slice(2)], {
      stdio: 'inherit',
      env: { ...process.env, NODE_USE_ENV_PROXY: '1' },
    });
    process.exit(result.status === null ? 1 : result.status);
  }
  fetchEmbeddingModel().catch((error) => {
    console.error(`${LOG_TAG} failed: ${error instanceof Error ? error.message : String(error)}`);
    process.exit(1);
  });
}

module.exports = {
  MODEL_ID,
  MODEL_REVISION,
  MODEL_FILES,
  MODEL_ROOT,
  MODEL_DIR,
  verifyEmbeddingModelDir,
  fetchEmbeddingModel,
};

if (require.main === module) {
  main();
}
