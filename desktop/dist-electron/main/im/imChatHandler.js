"use strict";
/**
 * IM Chat Handler
 * Processes IM messages through LLM service with optional skills integration
 */
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.IMChatHandler = void 0;
const axios_1 = __importDefault(require("axios"));
const imMediaInstruction_1 = require("./imMediaInstruction");
class IMChatHandler {
    options;
    constructor(options) {
        this.options = options;
    }
    /**
     * Process an incoming IM message and generate a response
     */
    async processMessage(message) {
        const llmConfig = await this.options.getLLMConfig();
        if (!llmConfig) {
            throw new Error('LLM configuration not found');
        }
        // Build system prompt with optional skills
        let systemPrompt = this.options.imSettings.systemPrompt || '';
        if (this.options.imSettings.skillsEnabled && this.options.getSkillsPrompt) {
            const skillsPrompt = await this.options.getSkillsPrompt();
            if (skillsPrompt) {
                systemPrompt = systemPrompt
                    ? `${systemPrompt}\n\n${skillsPrompt}`
                    : skillsPrompt;
            }
        }
        // Append IM media sending instruction
        const mediaInstruction = (0, imMediaInstruction_1.buildIMMediaInstruction)(this.options.imSettings);
        if (mediaInstruction) {
            systemPrompt = systemPrompt
                ? `${systemPrompt}\n\n${mediaInstruction}`
                : mediaInstruction;
        }
        // Call LLM API
        const response = await this.callLLM(llmConfig, message.content, systemPrompt);
        return response;
    }
    /**
     * Call LLM API and get response (non-streaming for simplicity)
     */
    async callLLM(config, userMessage, systemPrompt) {
        const provider = this.detectProvider(config);
        if (provider === 'anthropic') {
            return this.callAnthropicAPI(config, userMessage, systemPrompt);
        }
        // Default to OpenAI-compatible API
        return this.callOpenAICompatibleAPI(config, userMessage, systemPrompt);
    }
    /**
     * Detect provider from config
     */
    detectProvider(config) {
        if (config.provider === 'anthropic')
            return 'anthropic';
        if (config.baseUrl.includes('anthropic'))
            return 'anthropic';
        if (config.model?.startsWith('claude'))
            return 'anthropic';
        return 'openai';
    }
    buildOpenAICompatibleChatCompletionsUrl(config) {
        const normalized = config.baseUrl.replace(/\/+$/, '');
        if (!normalized) {
            return '/v1/chat/completions';
        }
        if (normalized.endsWith('/chat/completions')) {
            return normalized;
        }
        const isGeminiLike = config.provider === 'gemini'
            || config.model?.startsWith('gemini')
            || normalized.includes('generativelanguage.googleapis.com');
        if (isGeminiLike) {
            if (normalized.endsWith('/v1beta/openai') || normalized.endsWith('/v1/openai')) {
                return `${normalized}/chat/completions`;
            }
            if (normalized.endsWith('/v1beta') || normalized.endsWith('/v1')) {
                const betaBase = normalized.endsWith('/v1')
                    ? `${normalized.slice(0, -3)}v1beta`
                    : normalized;
                return `${betaBase}/openai/chat/completions`;
            }
            return `${normalized}/v1beta/openai/chat/completions`;
        }
        if (normalized.endsWith('/v1')) {
            return `${normalized}/chat/completions`;
        }
        return `${normalized}/v1/chat/completions`;
    }
    buildOpenAIResponsesUrl(config) {
        const normalized = config.baseUrl.replace(/\/+$/, '');
        if (!normalized) {
            return '/v1/responses';
        }
        if (normalized.endsWith('/responses')) {
            return normalized;
        }
        if (normalized.endsWith('/v1')) {
            return `${normalized}/responses`;
        }
        return `${normalized}/v1/responses`;
    }
    shouldUseOpenAIResponsesApi(config) {
        return config.provider?.toLowerCase() === 'openai';
    }
    shouldUseMaxCompletionTokens(config) {
        const provider = config.provider?.toLowerCase();
        if (provider !== 'openai') {
            return false;
        }
        const normalizedModel = config.model?.toLowerCase() || '';
        const resolvedModel = normalizedModel.includes('/')
            ? normalizedModel.slice(normalizedModel.lastIndexOf('/') + 1)
            : normalizedModel;
        return resolvedModel.startsWith('gpt-5')
            || resolvedModel.startsWith('o1')
            || resolvedModel.startsWith('o3')
            || resolvedModel.startsWith('o4');
    }
    /**
     * Call Anthropic API
     */
    async callAnthropicAPI(config, userMessage, systemPrompt) {
        const url = `${config.baseUrl.replace(/\/$/, '')}/v1/messages`;
        const body = {
            model: config.model || 'claude-3-5-sonnet-20241022',
            max_tokens: 4096,
            messages: [{ role: 'user', content: userMessage }],
        };
        if (systemPrompt) {
            body.system = systemPrompt;
        }
        const response = await axios_1.default.post(url, body, {
            headers: {
                'x-api-key': config.apiKey,
                'anthropic-version': '2023-06-01',
                'Content-Type': 'application/json',
            },
        });
        // Extract text from response
        const content = response.data.content;
        if (Array.isArray(content)) {
            return content
                .filter((block) => block.type === 'text')
                .map((block) => block.text)
                .join('\n');
        }
        return content?.text || content || '';
    }
    /**
     * Call OpenAI-compatible API
     */
    async callOpenAICompatibleAPI(config, userMessage, systemPrompt) {
        const useResponsesApi = this.shouldUseOpenAIResponsesApi(config);
        const url = useResponsesApi
            ? this.buildOpenAIResponsesUrl(config)
            : this.buildOpenAICompatibleChatCompletionsUrl(config);
        const messages = [];
        if (systemPrompt) {
            messages.push({ role: 'system', content: systemPrompt });
        }
        messages.push({ role: 'user', content: userMessage });
        const body = useResponsesApi
            ? {
                model: config.model || 'gpt-4o',
                input: [{ role: 'user', content: [{ type: 'input_text', text: userMessage }] }],
                max_output_tokens: 4096,
            }
            : {
                model: config.model || 'gpt-4o',
                messages,
            };
        if (useResponsesApi && systemPrompt) {
            body.instructions = systemPrompt;
        }
        if (!useResponsesApi) {
            if (this.shouldUseMaxCompletionTokens(config)) {
                body.max_completion_tokens = 4096;
            }
            else {
                body.max_tokens = 4096;
            }
        }
        const headers = {
            'Content-Type': 'application/json',
        };
        if (config.apiKey) {
            headers.Authorization = `Bearer ${config.apiKey}`;
        }
        const response = await axios_1.default.post(url, body, { headers });
        if (useResponsesApi) {
            return this.extractResponsesText(response.data);
        }
        return response.data.choices?.[0]?.message?.content || '';
    }
    extractResponsesText(payload) {
        if (typeof payload?.output_text === 'string' && payload.output_text) {
            return payload.output_text;
        }
        const output = Array.isArray(payload?.output) ? payload.output : [];
        const chunks = [];
        output.forEach((item) => {
            if (!Array.isArray(item?.content)) {
                return;
            }
            item.content.forEach((contentItem) => {
                if (typeof contentItem?.text === 'string' && contentItem.text) {
                    chunks.push(contentItem.text);
                }
            });
        });
        return chunks.join('');
    }
    /**
     * Process message with streaming (for AI cards)
     */
    async *processMessageStream(message) {
        const llmConfig = await this.options.getLLMConfig();
        if (!llmConfig) {
            throw new Error('LLM configuration not found');
        }
        // Build system prompt
        let systemPrompt = this.options.imSettings.systemPrompt || '';
        if (this.options.imSettings.skillsEnabled && this.options.getSkillsPrompt) {
            const skillsPrompt = await this.options.getSkillsPrompt();
            if (skillsPrompt) {
                systemPrompt = systemPrompt
                    ? `${systemPrompt}\n\n${skillsPrompt}`
                    : skillsPrompt;
            }
        }
        // For now, use non-streaming and yield once
        // TODO: Implement actual streaming for better UX
        const response = await this.callLLM(llmConfig, message.content, systemPrompt);
        yield { content: response, done: true };
    }
}
exports.IMChatHandler = IMChatHandler;
//# sourceMappingURL=imChatHandler.js.map