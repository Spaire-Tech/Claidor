import { Type } from '@sinclair/typebox';
import type { OpenClawPluginApi } from 'openclaw/plugin-sdk';

import { isAskUserQuestionCandidateSessionKey } from './sessionKey';

/**
 * AskUserQuestion plugin for the agent engine.
 *
 * Registers a structured tool that lets the model ask the user a question
 * with predefined options (single/multi select). The tool pauses execution
 * and waits for the user's response via an HTTP callback to Caisra.
 *
 * This enables delete-confirmation modals on the Caisra desktop app
 * without relying on the engine's exec.approval mechanism.
 */

type PluginConfig = {
  callbackUrl: string;
  secret: string;
};

type QuestionOption = {
  label: string;
  description?: string;
};

type Question = {
  question: string;
  header?: string;
  options: QuestionOption[];
  multiSelect?: boolean;
};

type AskUserInput = {
  questions: Question[];
};

type AskUserCallbackInput = AskUserInput & {
  sessionKey?: string;
};

type AskUserResponse = {
  behavior: 'allow' | 'deny';
  answers?: Record<string, string>;
};

const DEFAULT_TIMEOUT_MS = 120_000;

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

const QuestionOptionSchema = Type.Object({
  label: Type.String({ description: 'Display text for this option (1-5 words).' }),
  description: Type.Optional(Type.String({ description: 'Explanation of what this option means.' })),
});

const QuestionSchema = Type.Object({
  question: Type.String({ description: 'The question to ask. Should be clear and end with a question mark.' }),
  header: Type.Optional(Type.String({ description: 'Short label displayed as a tag (max 12 chars). Examples: "Auth method", "Confirm".' })),
  options: Type.Array(QuestionOptionSchema, {
    minItems: 2,
    maxItems: 4,
    description: 'Available choices (2-4 options).',
  }),
  multiSelect: Type.Optional(Type.Boolean({ description: 'Allow selecting multiple options.' })),
});

const AskUserQuestionSchema = Type.Object({
  questions: Type.Array(QuestionSchema, {
    minItems: 1,
    maxItems: 4,
    description: 'Questions to ask the user (1-4 questions).',
  }),
});

async function askUser(
  config: PluginConfig,
  input: AskUserCallbackInput,
): Promise<AskUserResponse> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), DEFAULT_TIMEOUT_MS);

  try {
    const response = await fetch(config.callbackUrl, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-ask-user-secret': config.secret,
      },
      body: JSON.stringify(input),
      signal: controller.signal,
    });

    const text = await response.text();

    if (!response.ok) {
      throw new Error(`AskUserQuestion callback HTTP ${response.status}: ${text.trim() || response.statusText}`);
    }

    if (!text.trim()) {
      return { behavior: 'deny' };
    }

    const parsed = JSON.parse(text);
    return {
      behavior: parsed?.behavior === 'allow' ? 'allow' : 'deny',
      answers: isRecord(parsed?.answers) ? parsed.answers as Record<string, string> : undefined,
    };
  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError') {
      return { behavior: 'deny' };
    }
    throw error;
  } finally {
    clearTimeout(timer);
  }
}

const plugin = {
  id: 'ask-user-question',
  name: 'AskUserQuestion',
  description: 'Structured user confirmation tool for Caisra desktop.',
  configSchema: {
    parse(value: unknown): PluginConfig {
      return parsePluginConfig(value);
    },
  },
  register(api: OpenClawPluginApi) {
    const config = parsePluginConfig(api.pluginConfig);
    if (!config.callbackUrl || !config.secret) {
      api.logger.info('[ask-user-question] skipped: callbackUrl or secret not configured.');
      return;
    }

    // Use a factory so the tool is only available for Caisra local-session candidates.
    // IM channel sessions (qqbot, dingtalk, weixin, feishu, etc.) get null → tool hidden.
    api.registerTool((ctx) => {
      // Enable for Caisra desktop sessions across agents and delegated child sessions.
      // IM channel sessions (dingtalk, qqbot, weixin, feishu, wecom, etc.) should not have this tool
      // so the model executes delete commands directly without confirmation on IM.
      const sessionKey = ctx.sessionKey ?? '';
      if (!isAskUserQuestionCandidateSessionKey(sessionKey)) {
        return null;
      }

      return {
        name: 'AskUserQuestion',
        label: 'Ask User Question',
        // The description the model reads. It used to say "Do NOT use
        // this tool for non-delete commands", which is why the question
        // cards the founder designed never appeared: the model read it
        // and stopped. The card is for any real decision.
        description: [
        'Ask the person a question with a small set of answers and wait for their choice.',
        'It draws a card in the conversation with the options on it; they can also type their own answer.',
        'Use it whenever what you do next depends on something only they can decide: which file, which account, how far to go, which of two ways.',
        'Ask before the work, not after. Two to four options, each a short phrase with what happens if chosen.',
        'Do not use it to confirm a command or a file change: the app asks about those itself, in its own card.',
        'A dismissed card is a no; do not ask the same thing again.',
      ].join(' '),
      parameters: AskUserQuestionSchema,
      async execute(_id: string, params: unknown) {
        const input = params as AskUserInput;
        if (!input?.questions?.length) {
          return {
            content: [{ type: 'text', text: 'No questions provided.' }],
            isError: true,
          };
        }

        try {
          const response = await askUser(config, { ...input, sessionKey });

          if (response.behavior === 'deny') {
            return {
              content: [{ type: 'text', text: 'User denied the operation.' }],
            };
          }

          const answerLines = response.answers
            ? Object.entries(response.answers)
                .map(([q, a]) => `${q}: ${a}`)
                .join('\n')
            : 'User approved.';

          return {
            content: [{ type: 'text', text: answerLines }],
          };
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error);
          return {
            content: [{ type: 'text', text: `AskUserQuestion failed: ${message}` }],
            isError: true,
          };
        }
      },
    };  // end of returned tool object
    });  // end of factory function passed to registerTool

    api.logger.info('[ask-user-question] registered AskUserQuestion tool factory.');
  },
};

export default plugin;
