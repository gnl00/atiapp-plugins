import type {
  ChatMessage,
  IToolCall,
  IUnifiedResponse,
  IUnifiedStreamResponse,
  RequestAdapterHooks,
  ToolDefinition
} from './types.js'

const extractTextContent = (content: ChatMessage['content']): string => {
  if (typeof content === 'string') {
    return content
  }

  if (Array.isArray(content)) {
    return content
      .filter(part => part?.type === 'text' && typeof part.text === 'string')
      .map(part => part.text as string)
      .join('\n')
  }

  return ''
}

const transformMessages = (messages: ChatMessage[]) => {
  return messages.map(message => ({
    role: message.role,
    content: extractTextContent(message.content),
    toolCalls: message.toolCalls
  }))
}

const transformTools = (tools: ToolDefinition[] | undefined) => {
  if (!Array.isArray(tools) || tools.length === 0) {
    return undefined
  }

  return tools.map(tool => ({
    name: tool.function?.name ?? tool.name ?? 'tool',
    description: tool.function?.description ?? tool.description,
    parameters: tool.function?.parameters ?? tool.function?.inputSchema ?? tool.inputSchema
  }))
}

const parseToolCalls = (raw: any): IToolCall[] | undefined => {
  const calls = Array.isArray(raw?.toolCalls) ? raw.toolCalls : []
  if (calls.length === 0) {
    return undefined
  }

  return calls.map((call: any, index: number) => ({
    id: String(call.id ?? `tool_${index}`),
    index,
    type: 'function',
    function: {
      name: String(call.function?.name ?? ''),
      arguments: typeof call.function?.arguments === 'string'
        ? call.function.arguments
        : JSON.stringify(call.function?.arguments ?? {})
    }
  }))
}

const buildResponse = (request: { model: string }, raw: any): IUnifiedResponse => ({
  id: String(raw?.id ?? 'response-id'),
  model: String(raw?.model ?? request.model),
  timestamp: Date.now(),
  content: typeof raw?.content === 'string' ? raw.content : '',
  toolCalls: parseToolCalls(raw),
  finishReason: 'stop',
  raw
})

// requestAdapter is the plugin entry consumed by the app runtime.
//
// The common split is:
// - request(): build the upstream HTTP request
// - parseResponse(): parse non-streaming JSON responses
// - parseStreamResponse(): parse one streaming chunk into a unified delta
export const requestAdapter: RequestAdapterHooks = {
  providerType: 'your-provider',
  streamProtocol: 'sse',
  supportsStreamOptionsUsage: false,

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
        ...(request.systemPrompt
          ? {
              messages: [
                {
                  role: 'system',
                  content: request.systemPrompt
                },
                ...transformMessages(request.messages)
              ]
            }
          : {
              messages: transformMessages(request.messages)
            }),
        stream: request.stream !== false,
        tools: transformTools(request.tools),
        max_tokens: request.options?.maxTokens
      }
    }
  },

  // parseResponse() handles non-streaming responses only.
  //
  // It receives the parsed upstream JSON in `raw` and must return one
  // complete IUnifiedResponse.
  parseResponse({ request, raw }) {
    return buildResponse(request, raw)
  },

  // parseStreamResponse() handles streaming responses.
  //
  // For this SSE template:
  // - `chunk` is one SSE event, usually starting with `data: `
  // - return null for empty chunks, keep-alives, or [DONE]
  // - return one IUnifiedStreamResponse when the chunk contains useful data
  parseStreamResponse({ request, chunk }) {
    if (!chunk.startsWith('data: ')) {
      return null
    }

    const payloadText = chunk.slice(6).trim()
    if (!payloadText || payloadText === '[DONE]') {
      return null
    }

    const raw = JSON.parse(payloadText)

    const response: IUnifiedStreamResponse = {
      id: String(raw?.id ?? 'stream-id'),
      model: String(raw?.model ?? request.model),
      delta: {
        content: typeof raw?.delta?.content === 'string' ? raw.delta.content : undefined,
        toolCalls: parseToolCalls(raw?.delta),
        finishReason: raw?.delta?.finishReason
      },
      raw
    }

    return response
  }
}

export default {
  requestAdapter
}
