const parseToolCalls = (raw) => {
    const calls = Array.isArray(raw?.toolCalls) ? raw.toolCalls : [];
    if (calls.length === 0) {
        return undefined;
    }
    return calls.map((call, index) => ({
        id: String(call.id ?? `tool_${index}`),
        index,
        type: 'function',
        function: {
            name: String(call.function?.name ?? ''),
            arguments: typeof call.function?.arguments === 'string'
                ? call.function.arguments
                : JSON.stringify(call.function?.arguments ?? {})
        }
    }));
};
const buildResponse = (request, raw) => ({
    id: String(raw?.id ?? 'response-id'),
    model: String(raw?.model ?? request.model),
    timestamp: Date.now(),
    content: typeof raw?.content === 'string' ? raw.content : '',
    toolCalls: parseToolCalls(raw),
    finishReason: 'stop',
    raw
});
// requestAdapter is the plugin entry consumed by the app runtime.
//
// The common split is:
// - request(): build the upstream HTTP request
// - parseResponse(): parse non-streaming JSON responses
// - parseStreamResponse(): parse one raw streaming chunk into a unified delta
export const requestAdapter = {
    providerType: 'your-provider',
    streamProtocol: 'raw',
    // request() is called before the HTTP request is sent.
    //
    // Use it to map IUnifiedRequest into:
    // - endpoint
    // - headers
    // - body
    //
    // If your upstream uses different payloads for non-stream and stream,
    // branch here with `request.stream === false`.
    request({ request }) {
        return {
            endpoint: `${request.baseUrl}/chat/completions`,
            headers: {
                'content-type': 'application/json',
                authorization: `Bearer ${request.apiKey}`
            },
            body: {
                model: request.model,
                stream: request.stream !== false
            }
        };
    },
    // parseResponse() handles non-streaming responses only.
    //
    // It receives the parsed upstream JSON in `raw` and must return one
    // complete IUnifiedResponse.
    parseResponse({ request, raw }) {
        return buildResponse(request, raw);
    },
    // parseStreamResponse() handles raw streaming responses.
    //
    // For this raw template:
    // - `chunk` is raw decoded text from the upstream response body
    // - the upstream does not use SSE framing
    // - return null when the chunk is empty or incomplete
    parseStreamResponse({ request, chunk }) {
        const text = chunk.trim();
        if (!text) {
            return null;
        }
        const raw = JSON.parse(text);
        const response = {
            id: String(raw?.id ?? 'stream-id'),
            model: String(raw?.model ?? request.model),
            delta: {
                content: typeof raw?.delta?.content === 'string' ? raw.delta.content : undefined,
                toolCalls: parseToolCalls(raw?.delta),
                finishReason: raw?.delta?.finishReason
            },
            raw
        };
        return response;
    }
};
export default {
    requestAdapter
};
