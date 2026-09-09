import { Type } from '@sinclair/typebox';
import type { OpenClawPluginApi } from 'openclaw/plugin-sdk';

import { isSearchLibraryCandidateSessionKey } from './sessionKey';

/**
 * Search Library plugin for OpenClaw.
 *
 * Registers the `search_library` tool: the model asks a question in plain
 * words, the plugin posts it over the loopback bridge to Swen, and Swen
 * answers with passages from the person's own documents (indexed on the
 * machine), each with its file path and its page, sheet or slide.
 *
 * Extensions compile on their own and cannot import from src/, so the few
 * constants and types below mirror src/shared/library/contentConstants.ts.
 */

// Mirrors LIBRARY_SEARCH_PLUGIN_ID / LIBRARY_SEARCH_TOOL_NAME in
// src/shared/library/contentConstants.ts.
const LIBRARY_SEARCH_PLUGIN_ID = 'search-library';
const LIBRARY_SEARCH_TOOL_NAME = 'search_library';
// Mirrors LibraryContentLimits.DefaultSearchResults / MaxSearchResults.
const DEFAULT_SEARCH_RESULTS = 8;
const MAX_SEARCH_RESULTS = 20;

const REQUEST_TIMEOUT_MS = 30_000;
const BRIDGE_SECRET_HEADER = 'x-mcp-bridge-secret';

type PluginConfig = {
  callbackUrl: string;
  secret: string;
};

type SearchLibraryInput = {
  query: string;
  folder?: string;
  limit?: number;
};

type SearchLibraryCallbackInput = SearchLibraryInput & {
  sessionKey?: string;
};

// Mirrors LibraryChunkLocator in src/shared/library/contentConstants.ts.
type LibraryChunkLocator = {
  page?: number;
  sheet?: string;
  slide?: number;
  heading?: string;
};

// Mirrors LibrarySearchHit in src/shared/library/contentConstants.ts.
type LibrarySearchHit = {
  documentId: string;
  filePath: string;
  fileName: string;
  kind: string;
  locator: LibraryChunkLocator;
  text: string;
  score: number;
  modifiedAt: number;
};

// Mirrors LibrarySearchResponse in src/shared/library/contentConstants.ts.
type LibrarySearchResponse = {
  hits: LibrarySearchHit[];
  documentCount: number;
  vectorsUsed: boolean;
  tookMs: number;
};

const isRecord = (value: unknown): value is Record<string, unknown> => {
  return !!value && typeof value === 'object' && !Array.isArray(value);
};

const parsePluginConfig = (value: unknown): PluginConfig => {
  const raw = isRecord(value) ? value : {};
  return {
    callbackUrl: typeof raw.callbackUrl === 'string' ? raw.callbackUrl.trim() : '',
    secret: typeof raw.secret === 'string' ? raw.secret.trim() : '',
  };
};

// Mirrors formatLibraryLocator in src/shared/library/contentConstants.ts.
const formatLibraryLocator = (locator: LibraryChunkLocator | null | undefined): string => {
  if (!locator) return '';
  if (typeof locator.page === 'number') return `page ${locator.page}`;
  if (typeof locator.slide === 'number') return `slide ${locator.slide}`;
  if (locator.sheet) return `sheet ${locator.sheet}`;
  if (locator.heading) return `under ${locator.heading}`;
  return '';
};

const SearchLibrarySchema = Type.Object({
  query: Type.String({
    description: 'What to look for, in plain words: a question or a few keywords.',
  }),
  folder: Type.Optional(Type.String({
    description: 'Only look inside this folder, absolute path.',
  })),
  limit: Type.Optional(Type.Integer({
    minimum: 1,
    maximum: MAX_SEARCH_RESULTS,
    default: DEFAULT_SEARCH_RESULTS,
    description: `How many passages to return (1-${MAX_SEARCH_RESULTS}, default ${DEFAULT_SEARCH_RESULTS}).`,
  })),
});

const parseSearchResponse = (value: unknown): LibrarySearchResponse => {
  const raw = isRecord(value) ? value : {};
  const hits = Array.isArray(raw.hits)
    ? raw.hits.filter(isRecord).map((hit): LibrarySearchHit => ({
        documentId: typeof hit.documentId === 'string' ? hit.documentId : '',
        filePath: typeof hit.filePath === 'string' ? hit.filePath : '',
        fileName: typeof hit.fileName === 'string' ? hit.fileName : '',
        kind: typeof hit.kind === 'string' ? hit.kind : '',
        locator: isRecord(hit.locator) ? hit.locator as LibraryChunkLocator : {},
        text: typeof hit.text === 'string' ? hit.text : '',
        score: typeof hit.score === 'number' && Number.isFinite(hit.score) ? hit.score : 0,
        modifiedAt: typeof hit.modifiedAt === 'number' ? hit.modifiedAt : 0,
      }))
    : [];
  return {
    hits,
    documentCount: typeof raw.documentCount === 'number' ? raw.documentCount : 0,
    vectorsUsed: raw.vectorsUsed === true,
    tookMs: typeof raw.tookMs === 'number' ? raw.tookMs : 0,
  };
};

async function searchLibrary(
  config: PluginConfig,
  input: SearchLibraryCallbackInput,
): Promise<LibrarySearchResponse> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  try {
    const response = await fetch(config.callbackUrl, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        [BRIDGE_SECRET_HEADER]: config.secret,
      },
      body: JSON.stringify(input),
      signal: controller.signal,
    });

    const text = await response.text();

    if (!response.ok) {
      let message = text.trim();
      try {
        const parsed = JSON.parse(text);
        if (isRecord(parsed) && typeof parsed.error === 'string' && parsed.error.trim()) {
          message = parsed.error.trim();
        }
      } catch {
        // Not JSON; keep the raw body.
      }
      throw new Error(message || `Library search HTTP ${response.status}: ${response.statusText}`);
    }

    return parseSearchResponse(text.trim() ? JSON.parse(text) : {});
  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError') {
      throw new Error(`The library did not answer within ${Math.round(REQUEST_TIMEOUT_MS / 1000)} seconds.`);
    }
    throw error;
  } finally {
    clearTimeout(timer);
  }
}

const renderSearchResponse = (response: LibrarySearchResponse): string => {
  if (response.hits.length === 0) {
    return `No matching passages in the library (${response.documentCount} documents indexed).`;
  }

  const lines: string[] = [];
  response.hits.forEach((hit, index) => {
    const locator = formatLibraryLocator(hit.locator) || 'whole file';
    lines.push(`${index + 1}. ${hit.filePath} — ${locator} (score ${hit.score.toFixed(2)})`);
    lines.push(hit.text.trim());
    lines.push('');
  });
  lines.push('Cite the file and the page, sheet or slide when you use a passage.');
  return lines.join('\n');
};

const plugin = {
  id: LIBRARY_SEARCH_PLUGIN_ID,
  name: 'Search Library',
  description: 'Searches the person\'s own documents indexed by Swen desktop.',
  configSchema: {
    parse(value: unknown): PluginConfig {
      return parsePluginConfig(value);
    },
  },
  register(api: OpenClawPluginApi) {
    const config = parsePluginConfig(api.pluginConfig);
    if (!config.callbackUrl || !config.secret) {
      api.logger.info(`[${LIBRARY_SEARCH_PLUGIN_ID}] skipped: callbackUrl or secret not configured.`);
      return;
    }

    // Factory: the tool exists for Swen desktop sessions (and their subagents)
    // only. Chat channel sessions get null, so the tool is hidden there.
    api.registerTool((ctx) => {
      const sessionKey = ctx.sessionKey ?? '';
      if (!isSearchLibraryCandidateSessionKey(sessionKey)) {
        return null;
      }

      return {
        name: LIBRARY_SEARCH_TOOL_NAME,
        label: 'Search the person\'s documents',
        description: [
          'The person\'s own documents on this computer are indexed in a library.',
          'Use this tool whenever the question may concern their own files: contracts, budgets, minutes, reports, slides, notes.',
          'It returns passages with the file path and the page, sheet or slide; cite them in your answer.',
          'Do not use it for the web or for general knowledge.',
        ].join(' '),
        parameters: SearchLibrarySchema,
        async execute(_id: string, params: unknown) {
          const input = isRecord(params) ? params : {};
          const query = typeof input.query === 'string' ? input.query.trim() : '';
          if (!query) {
            return {
              content: [{ type: 'text', text: 'No query provided.' }],
              isError: true,
            };
          }
          const folder = typeof input.folder === 'string' && input.folder.trim()
            ? input.folder.trim()
            : undefined;
          const rawLimit = typeof input.limit === 'number' && Number.isFinite(input.limit)
            ? Math.trunc(input.limit)
            : DEFAULT_SEARCH_RESULTS;
          const limit = Math.min(MAX_SEARCH_RESULTS, Math.max(1, rawLimit));

          try {
            const response = await searchLibrary(config, { query, folder, limit, sessionKey });
            return {
              content: [{ type: 'text', text: renderSearchResponse(response) }],
              details: { hits: response.hits },
            };
          } catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            return {
              content: [{ type: 'text', text: `Library search failed: ${message}` }],
              isError: true,
            };
          }
        },
      };
    });

    api.logger.info(`[${LIBRARY_SEARCH_PLUGIN_ID}] registered ${LIBRARY_SEARCH_TOOL_NAME} tool factory.`);
  },
};

export default plugin;
