const extractTextContent = (content) => {
    if (typeof content === 'string') {
        return content;
    }
    if (Array.isArray(content)) {
        return content
            .filter(part => part?.type === 'text' && typeof part.text === 'string')
            .map(part => part.text)
            .join('\n');
    }
    return '';
};
const toResponseContent = (content) => {
    if (typeof content === 'string') {
        if (!content) {
            return [];
        }
        return [{ type: 'input_text', text: content }];
    }
    if (!Array.isArray(content)) {
        return [];
    }
    return content.reduce((result, part) => {
        if (!part || typeof part !== 'object') {
            return result;
        }
        const typedPart = part;
        if (typedPart.type === 'text' && typeof typedPart.text === 'string') {
            result.push({ type: 'input_text', text: typedPart.text });
            return result;
        }
        if (typedPart.type === 'image_url' && typedPart.image_url?.url) {
            result.push({
                type: 'input_image',
                image_url: typedPart.image_url.url,
                detail: typedPart.image_url.detail
            });
            return result;
        }
        return result;
    }, []);
};
const stringifyToolOutput = (content) => {
    if (typeof content === 'string') {
        return content;
    }
    try {
        return JSON.stringify(content);
    }
    catch {
        return '';
    }
};
const transformMessages = (messages, systemPrompt) => {
    const instructionParts = [];
    if (typeof systemPrompt === 'string' && systemPrompt.trim()) {
        instructionParts.push(systemPrompt.trim());
    }
    const input = [];
    for (const message of messages) {
        if (message.role === 'tool') {
            input.push({
                type: 'function_call_output',
                call_id: message.toolCallId || message.name || 'tool_call',
                output: stringifyToolOutput(message.content)
            });
            continue;
        }
        const responseContent = toResponseContent(message.content);
        if (responseContent.length > 0) {
            const role = (message.role === 'assistant'
                || message.role === 'developer'
                || message.role === 'system')
                ? message.role
                : 'user';
            input.push({
                type: 'message',
                role,
                content: responseContent
            });
        }
        if (message.role === 'assistant' && Array.isArray(message.toolCalls)) {
            for (const toolCall of message.toolCalls) {
                input.push({
                    type: 'function_call',
                    call_id: toolCall.id,
                    name: toolCall.function.name,
                    arguments: toolCall.function.arguments || '{}'
                });
            }
        }
    }
    return {
        instructions: instructionParts.length > 0 ? instructionParts.join('\n\n') : undefined,
        input
    };
};
const transformTools = (tools) => {
    if (!Array.isArray(tools) || tools.length === 0) {
        return undefined;
    }
    return tools.map((tool) => {
        if (tool?.type === 'function' && tool.function) {
            return {
                type: 'function',
                name: tool.function.name,
                description: tool.function.description,
                parameters: tool.function.parameters || tool.function.inputSchema || { type: 'object', properties: {} }
            };
        }
        return {
            type: 'function',
            name: tool.name || 'tool',
            description: tool.description,
            parameters: tool.inputSchema || tool.parameters || { type: 'object', properties: {} }
        };
    });
};
const extractOutputText = (raw) => {
    if (typeof raw?.output_text === 'string') {
        return raw.output_text;
    }
    if (!Array.isArray(raw?.output)) {
        return '';
    }
    return raw.output
        .filter((item) => item?.type === 'message' && Array.isArray(item.content))
        .flatMap((item) => item.content)
        .filter((part) => part?.type === 'output_text' && typeof part.text === 'string')
        .map((part) => part.text)
        .join('');
};
const extractReasoning = (raw) => {
    if (!Array.isArray(raw?.output)) {
        return undefined;
    }
    const reasoningText = raw.output
        .filter((item) => item?.type === 'reasoning')
        .flatMap((item) => Array.isArray(item.summary) ? item.summary : item.content ?? [])
        .filter((part) => (part?.type === 'summary_text' || part?.type === 'reasoning_text') && typeof part.text === 'string')
        .map((part) => part.text)
        .join('\n');
    return reasoningText || undefined;
};
const extractToolCalls = (raw) => {
    if (!Array.isArray(raw?.output)) {
        return undefined;
    }
    const toolCalls = raw.output
        .filter((item) => item?.type === 'function_call')
        .map((item, index) => ({
        id: item.call_id || item.id || `function_call_${index}`,
        index,
        type: 'function',
        function: {
            name: item.name || '',
            arguments: typeof item.arguments === 'string'
                ? item.arguments
                : JSON.stringify(item.arguments ?? {})
        }
    }));
    return toolCalls.length > 0 ? toolCalls : undefined;
};
const extractUsage = (raw) => {
    const usage = raw?.usage;
    if (!usage) {
        return undefined;
    }
    const promptTokens = usage.input_tokens;
    const completionTokens = usage.output_tokens;
    const totalTokens = usage.total_tokens;
    if (typeof promptTokens !== 'number'
        || typeof completionTokens !== 'number'
        || typeof totalTokens !== 'number') {
        return undefined;
    }
    return {
        promptTokens,
        completionTokens,
        totalTokens
    };
};
const mapFinishReason = (raw) => {
    const toolCalls = extractToolCalls(raw);
    if (toolCalls && toolCalls.length > 0) {
        return 'tool_calls';
    }
    const incompleteReason = raw?.incomplete_details?.reason;
    if (incompleteReason === 'max_output_tokens') {
        return 'length';
    }
    if (incompleteReason === 'content_filter') {
        return 'content_filter';
    }
    return 'stop';
};
export const openAIResponsesRequestAdapter = {
    providerType: 'openai-response',
    streamProtocol: 'sse',
    supportsStreamOptionsUsage: false,
    request({ request }) {
        const { instructions, input } = transformMessages(request.messages, request.systemPrompt);
        const body = {
            model: request.model,
            input,
            stream: request.stream ?? true,
            text: {
                format: {
                    type: 'text'
                }
            }
        };
        if (instructions) {
            body.instructions = instructions;
        }
        if (request.options?.maxTokens !== undefined) {
            body.max_output_tokens = request.options.maxTokens;
        }
        const tools = transformTools(request.tools);
        if (tools) {
            body.tools = tools;
            body.tool_choice = 'auto';
        }
        return {
            endpoint: `${request.baseUrl}/responses`,
            headers: {
                'content-type': 'application/json',
                authorization: `Bearer ${request.apiKey}`
            },
            body
        };
    },
    parseResponse({ request, raw }) {
        const response = raw;
        return {
            id: response?.id || 'response',
            model: response?.model || request.model,
            timestamp: response?.created_at ? response.created_at * 1000 : Date.now(),
            content: extractOutputText(response),
            reasoning: extractReasoning(response),
            toolCalls: extractToolCalls(response),
            finishReason: mapFinishReason(response),
            usage: extractUsage(response),
            raw: response
        };
    },
    parseStreamResponse({ request, chunk }) {
        if (!chunk.startsWith('data: ')) {
            return null;
        }
        const payloadText = chunk.slice(6).trim();
        if (!payloadText || payloadText === '[DONE]') {
            return null;
        }
        const payload = JSON.parse(payloadText);
        if (payload.type === 'response.output_text.delta') {
            return {
                id: payload.item_id || 'response-stream',
                model: request.model,
                delta: {
                    content: typeof payload.delta === 'string' ? payload.delta : undefined
                },
                raw: payload
            };
        }
        if (payload.type === 'response.output_item.done' && payload.item?.type === 'function_call') {
            return {
                id: payload.item.call_id || payload.item.id || 'response-stream',
                model: request.model,
                delta: {
                    toolCalls: [{
                            id: payload.item.call_id || payload.item.id || 'function_call',
                            type: 'function',
                            function: {
                                name: payload.item.name || '',
                                arguments: typeof payload.item.arguments === 'string'
                                    ? payload.item.arguments
                                    : JSON.stringify(payload.item.arguments ?? {})
                            }
                        }],
                    finishReason: 'tool_calls'
                },
                raw: payload
            };
        }
        if (payload.type === 'response.completed' && payload.response) {
            return {
                id: payload.response.id || 'response-stream',
                model: payload.response.model || request.model,
                delta: {
                    finishReason: mapFinishReason(payload.response)
                },
                usage: extractUsage(payload.response),
                raw: payload
            };
        }
        return null;
    }
};
export default {
    requestAdapter: openAIResponsesRequestAdapter
};
