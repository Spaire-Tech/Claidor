import {
  LibraryWorkerMessageType,
  type LibraryWorkerRequest,
  type LibraryWorkerResponse,
} from '../../../shared/library/contentConstants';
import { handleLibraryWorkerRequest, type LibraryWorkerCoreDeps } from './documentWorkerCore';
import { type LibraryEmbedFunction, loadLibraryEmbeddingModel } from './embeddingModel';
import { extractLibraryDocument } from './extractors';

/**
 * Entry of the library document worker, an Electron utilityProcess. It
 * receives requests over `process.parentPort`, handles them one at a time in
 * arrival order and posts the replies back. Model loading, extraction and
 * embedding live in the modules it imports; this file is only the plumbing.
 */

const LOG_TAG = '[LibraryWorker]';

interface ParentPortLike {
  on(event: 'message', listener: (event: { data: unknown }) => void): unknown;
  postMessage(message: unknown): void;
}

const parentPort = (process as unknown as { parentPort?: ParentPortLike }).parentPort;

if (!parentPort) {
  console.error(`${LOG_TAG} no parent port; this script must run as an Electron utilityProcess`);
  process.exit(1);
}

let embed: LibraryEmbedFunction | null = null;
let queue: Promise<void> = Promise.resolve();

const deps: LibraryWorkerCoreDeps = {
  extract: extractLibraryDocument,
  get embed() {
    return embed;
  },
  loadModel: async (modelDir) => {
    const model = await loadLibraryEmbeddingModel(modelDir);
    return model.embed;
  },
  onModelLoaded: (loaded) => {
    embed = loaded;
  },
};

const post = (response: LibraryWorkerResponse): void => {
  try {
    parentPort.postMessage(response);
  } catch (error) {
    console.error(`${LOG_TAG} could not post a reply`, error);
  }
};

const handle = async (request: unknown): Promise<void> => {
  const response = await handleLibraryWorkerRequest(request as LibraryWorkerRequest, deps);
  if (response.type === LibraryWorkerMessageType.Ready) {
    if (response.ok) console.log(`${LOG_TAG} model ready in ${response.loadMs} ms`);
    else console.error(`${LOG_TAG} model failed to load: ${response.error ?? 'unknown error'}`);
  } else if (response.type === LibraryWorkerMessageType.Failed) {
    console.warn(`${LOG_TAG} request ${response.requestId || '(none)'} failed: ${response.error}`);
  }
  post(response);
};

parentPort.on('message', (event) => {
  const request = event?.data;
  queue = queue
    .then(() => handle(request))
    .catch((error) => {
      // handleLibraryWorkerRequest never throws; this guards the plumbing itself.
      console.error(`${LOG_TAG} unexpected failure`, error);
      const requestId = (request as { requestId?: unknown } | null)?.requestId;
      post({
        type: LibraryWorkerMessageType.Failed,
        requestId: typeof requestId === 'string' ? requestId : '',
        error: error instanceof Error ? error.message : String(error),
        permanent: false,
      });
    });
});

process.on('uncaughtException', (error) => {
  console.error(`${LOG_TAG} uncaught exception`, error);
});
process.on('unhandledRejection', (reason) => {
  console.error(`${LOG_TAG} unhandled rejection`, reason);
});

console.log(`${LOG_TAG} started (pid ${process.pid})`);
