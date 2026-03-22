const extractTextContent = (content) => {
    if (typeof content === 'string') {
        return content;
    }
    if (Array.isArray(content)) {
        return content
            .filter(part => part && typeof part === 'object' && part.type === 'text' && typeof part.text === 'string')
            .map(part => part.text)
            .join('\n');
    }
    return '';
};
const createTextPart = (text) => ({ text });
const safeParseJson = (value) => {
    if (!value || typeof value !== 'string') {
        return {};
    }
    try {
        return JSON.parse(value);
    }
    catch {
        return { raw: value };
    }
};
const toGeminiRole = (role) => {
    if (role === 'assistant') {
        return 'model';
    }
    return 'user';
};
const normalizeModelName = (model) => {
    if (!model) {
        return 'models/gemini-2.5-flash';
    }
    return model.startsWith('models/') ? model : `models/${model}`;
};
const mapFinishReason = (reason) => {
    switch (String(reason || '').toUpperCase()) {
        case 'STOP':
            return 'stop';
        case 'MAX_TOKENS':
            return 'length';
        case 'SAFETY':
            return 'content_filter';
        case 'FUNCTION_CALL':
            return 'tool_calls';
        default:
            return 'stop';
    }
};
const extractUsage = (raw) => {
    const usage = raw?.usageMetadata;
    if (!usage) {
        return undefined;
    }
    const promptTokens = usage.promptTokenCount;
    const completionTokens = usage.candidatesTokenCount;
    const totalTokens = usage.totalTokenCount;
    if (typeof promptTokens !== 'number'
        || typeof completionTokens !== 'number'
        || typeof totalTokens !== 'number') {
        return undefined;
    }
    return { promptTokens, completionTokens, totalTokens };
};
const transformToolDefinitions = (tools) => {
    if (!Array.isArray(tools) || tools.length === 0) {
        return undefined;
    }
    return [{
            functionDeclarations: tools.map((tool) => {
                if (tool?.type === 'function' && tool?.function) {
                    return {
                        name: tool.function.name,
                        description: tool.function.description,
                        parameters: tool.function.parameters || tool.function.inputSchema || { type: 'object', properties: {} }
                    };
                }
                return {
                    name: tool.name || 'tool',
                    description: tool.description,
                    parameters: tool.inputSchema || { type: 'object', properties: {} }
                };
            })
        }];
};
// Gemini's GenerateContent API uses:
// - `systemInstruction` for system prompts
// - `contents[]` for conversation messages
// - `functionCall` / `functionResponse` parts for tool use
const transformMessages = (messages, systemPrompt) => {
    const systemParts = [];
    if (typeof systemPrompt === 'string' && systemPrompt.trim()) {
        systemParts.push(createTextPart(systemPrompt.trim()));
    }
    const contents = [];
    for (const message of messages || []) {
        if (message.role === 'tool') {
            const responseName = message.name || message.toolCallId || 'tool';
            contents.push({
                role: 'user',
                parts: [{
                        functionResponse: {
                            name: responseName,
                            response: safeParseJson(typeof message.content === 'string'
                                ? message.content
                                : JSON.stringify(message.content))
                        }
                    }]
            });
            continue;
        }
        const parts = [];
        const text = extractTextContent(message.content);
        if (text) {
            parts.push(createTextPart(text));
        }
        if (message.role === 'assistant' && Array.isArray(message.toolCalls)) {
            for (const toolCall of message.toolCalls) {
                parts.push({
                    functionCall: {
                        name: toolCall.function?.name || '',
                        args: safeParseJson(toolCall.function?.arguments || '{}')
                    }
                });
            }
        }
        if (parts.length > 0) {
            contents.push({
                role: toGeminiRole(message.role),
                parts
            });
        }
    }
    return {
        systemInstruction: systemParts.length > 0 ? { parts: systemParts } : undefined,
        contents
    };
};
const extractTextFromParts = (parts) => {
    if (!Array.isArray(parts)) {
        return '';
    }
    return parts
        .map((part) => typeof part?.text === 'string' ? part.text : '')
        .filter(Boolean)
        .join('');
};
const extractToolCallsFromParts = (parts) => {
    if (!Array.isArray(parts)) {
        return undefined;
    }
    const toolCalls = parts
        .filter(part => part?.functionCall && typeof part.functionCall.name === 'string')
        .map((part, index) => ({
        id: `gemini_tool_${Date.now()}_${index}`,
        index,
        type: 'function',
        function: {
            name: part.functionCall.name,
            arguments: JSON.stringify(part.functionCall.args || {})
        }
    }));
    return toolCalls.length > 0 ? toolCalls : undefined;
};
const extractPayload = (raw) => Array.isArray(raw) ? raw[0] : raw;
// This example implements both non-stream and stream handling:
// - request(): chooses generateContent vs streamGenerateContent
// - parseResponse(): parses one complete non-stream Gemini response
// - parseStreamResponse(): parses one SSE event from the stream
export const geminiRequestAdapter = {
    providerType: 'gemini',
    streamProtocol: 'sse',
    supportsStreamOptionsUsage: false,
    // Use `request.stream === false` to switch to the non-stream endpoint.
    // This is where request-level differences between stream and non-stream
    // should be handled.
    request({ request }) {
        const { systemInstruction, contents } = transformMessages(request.messages, request.systemPrompt);
        const modelName = normalizeModelName(request.model);
        const endpoint = request.stream === false
            ? `${request.baseUrl}/${modelName}:generateContent`
            : `${request.baseUrl}/${modelName}:streamGenerateContent?alt=sse`;
        const body = {
            contents,
            ...(systemInstruction ? { systemInstruction } : {}),
            ...(request.options?.maxTokens !== undefined
                ? { generationConfig: { maxOutputTokens: request.options.maxTokens } }
                : {})
        };
        const tools = transformToolDefinitions(request.tools);
        if (tools) {
            body.tools = tools;
        }
        return {
            endpoint,
            headers: {
                'content-type': 'application/json',
                'x-goog-api-key': request.apiKey
            },
            body
        };
    },
    // parseResponse() handles the non-streaming GenerateContent JSON payload.
    parseResponse({ request, raw }) {
        const payload = extractPayload(raw);
        const candidate = payload?.candidates?.[0];
        const parts = candidate?.content?.parts || [];
        return {
            id: payload?.responseId || 'gemini-response',
            model: payload?.modelVersion || request.model,
            timestamp: Date.now(),
            content: extractTextFromParts(parts),
            toolCalls: extractToolCallsFromParts(parts),
            finishReason: mapFinishReason(candidate?.finishReason),
            usage: extractUsage(payload),
            raw: payload
        };
    },
    // parseStreamResponse() handles one SSE `data: ...` event from
    // streamGenerateContent?alt=sse.
    parseStreamResponse({ request, chunk }) {
        if (!chunk.startsWith('data: ')) {
            return null;
        }
        const payloadText = chunk.slice(6).trim();
        if (!payloadText) {
            return null;
        }
        const payload = extractPayload(JSON.parse(payloadText));
        const candidate = payload?.candidates?.[0];
        const parts = candidate?.content?.parts || [];
        const response = {
            id: payload?.responseId || 'gemini-stream',
            model: payload?.modelVersion || request.model,
            delta: {
                content: extractTextFromParts(parts) || undefined,
                toolCalls: extractToolCallsFromParts(parts),
                finishReason: mapFinishReason(candidate?.finishReason)
            },
            usage: extractUsage(payload),
            raw: payload
        };
        return response;
    }
};
export default {
    requestAdapter: geminiRequestAdapter
};
