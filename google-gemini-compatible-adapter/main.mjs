const THINKING_LEVELS = new Set(['minimal', 'low', 'medium', 'high'])

const normalizeThinkingLevel = (value) => (
  typeof value === 'string' && THINKING_LEVELS.has(value) ? value : undefined
)

const extractTextContent = (content) => {
  if (typeof content === 'string') {
    return content
  }

  if (Array.isArray(content)) {
    return content
      .filter((part) => part && typeof part === 'object' && part.type === 'text' && typeof part.text === 'string')
      .map((part) => part.text)
      .join('\n')
  }

  return ''
}

const createTextPart = (text) => ({ text })

const safeParseJson = (value) => {
  if (!value || typeof value !== 'string') {
    return {}
  }

  try {
    return JSON.parse(value)
  } catch {
    return { raw: value }
  }
}

const toGeminiRole = (role) => {
  if (role === 'assistant') return 'model'
  return 'user'
}

const normalizeModelName = (model) => {
  if (typeof model !== 'string' || model.length === 0) {
    return 'models/gemini-2.5-flash'
  }
  return model.startsWith('models/') ? model : `models/${model}`
}

const mapFinishReason = (reason) => {
  switch (String(reason || '').toUpperCase()) {
    case 'STOP':
      return 'stop'
    case 'MAX_TOKENS':
      return 'length'
    case 'SAFETY':
      return 'content_filter'
    case 'FUNCTION_CALL':
      return 'tool_calls'
    default:
      return 'stop'
  }
}

const extractUsage = (raw) => {
  const usage = raw?.usageMetadata
  if (!usage) return undefined
  const promptTokens = usage.promptTokenCount
  const completionTokens = usage.candidatesTokenCount
  const totalTokens = usage.totalTokenCount
  if (
    typeof promptTokens !== 'number'
    || typeof completionTokens !== 'number'
    || typeof totalTokens !== 'number'
  ) {
    return undefined
  }

  return {
    promptTokens,
    completionTokens,
    totalTokens
  }
}

const transformToolDefinitions = (tools) => {
  if (!Array.isArray(tools) || tools.length === 0) {
    return undefined
  }

  return [{
    functionDeclarations: tools.map((tool) => {
      if (tool?.type === 'function' && tool?.function) {
        return {
          name: tool.function.name,
          description: tool.function.description,
          parameters: tool.function.parameters || tool.function.inputSchema || { type: 'object', properties: {} }
        }
      }

      return {
        name: tool.name,
        description: tool.description,
        parameters: tool.inputSchema || tool.parameters || { type: 'object', properties: {} }
      }
    })
  }]
}

const transformMessages = (messages, systemPrompt) => {
  const systemParts = []
  if (typeof systemPrompt === 'string' && systemPrompt.trim()) {
    systemParts.push(createTextPart(systemPrompt.trim()))
  }
  const contents = []

  for (const message of messages || []) {
    if (message.role === 'tool') {
      const responseName = message.name || message.toolCallId || 'tool'
      contents.push({
        role: 'user',
        parts: [{
          functionResponse: {
            name: responseName,
            response: safeParseJson(typeof message.content === 'string' ? message.content : JSON.stringify(message.content))
          }
        }]
      })
      continue
    }

    const parts = []
    const text = extractTextContent(message.content)
    if (text) {
      parts.push(createTextPart(text))
    }

    if (message.role === 'assistant' && Array.isArray(message.toolCalls)) {
      for (const toolCall of message.toolCalls) {
        parts.push({
          functionCall: {
            name: toolCall.function?.name || '',
            args: safeParseJson(toolCall.function?.arguments || '{}')
          }
        })
      }
    }

    if (parts.length > 0) {
      contents.push({
        role: toGeminiRole(message.role),
        parts
      })
    }
  }

  return {
    systemInstruction: systemParts.length > 0 ? { parts: systemParts } : undefined,
    contents
  }
}

const extractTextFromParts = (parts) => {
  if (!Array.isArray(parts)) return ''
  return parts
    .map((part) => typeof part?.text === 'string' ? part.text : '')
    .filter(Boolean)
    .join('')
}

const extractToolCallsFromParts = (parts) => {
  if (!Array.isArray(parts)) return undefined

  const toolCalls = parts
    .filter((part) => part?.functionCall && typeof part.functionCall.name === 'string')
    .map((part, index) => ({
      id: `gemini_tool_${Date.now()}_${index}`,
      index,
      type: 'function',
      function: {
        name: part.functionCall.name,
        arguments: JSON.stringify(part.functionCall.args || {})
      }
    }))

  return toolCalls.length > 0 ? toolCalls : undefined
}

const extractPayload = (raw) => Array.isArray(raw) ? raw[0] : raw

const buildGenerationConfig = (request) => {
  const generationConfig = {}

  if (request.options?.maxTokens !== undefined) {
    generationConfig.maxOutputTokens = request.options.maxTokens
  }

  const thinkingLevel = normalizeThinkingLevel(request.options?.thinkingLevel)
  if (thinkingLevel) {
    generationConfig.thinkingConfig = { thinkingLevel }
  }

  return Object.keys(generationConfig).length > 0 ? generationConfig : undefined
}

export const requestAdapter = {
  providerType: 'gemini',
  streamProtocol: 'sse',
  supportsStreamOptionsUsage: false,

  request({ request }) {
    const { systemInstruction, contents } = transformMessages(request.messages, request.systemPrompt)
    const modelName = normalizeModelName(request.model)
    const endpoint = request.stream === false
      ? `${request.baseUrl}/${modelName}:generateContent`
      : `${request.baseUrl}/${modelName}:streamGenerateContent?alt=sse`
    const generationConfig = buildGenerationConfig(request)

    const body = {
      contents,
      ...(systemInstruction ? { systemInstruction } : {}),
      ...(generationConfig ? { generationConfig } : {})
    }

    const tools = transformToolDefinitions(request.tools)
    if (tools) {
      body.tools = tools
    }

    return {
      endpoint,
      headers: {
        'content-type': 'application/json',
        'x-goog-api-key': request.apiKey
      },
      body
    }
  },

  parseResponse({ request, raw }) {
    const payload = extractPayload(raw)
    const candidate = payload?.candidates?.[0]
    const parts = candidate?.content?.parts || []

    return {
      id: payload?.responseId || 'gemini-response',
      model: payload?.modelVersion || request.model,
      timestamp: Date.now(),
      content: extractTextFromParts(parts),
      toolCalls: extractToolCallsFromParts(parts),
      finishReason: mapFinishReason(candidate?.finishReason),
      usage: extractUsage(payload),
      raw: payload
    }
  },

  parseStreamResponse({ request, chunk }) {
    try {
      if (!chunk.startsWith('data: ')) {
        return null
      }

      const payloadText = chunk.slice(6).trim()
      if (!payloadText) {
        return null
      }

      const payload = extractPayload(JSON.parse(payloadText))
      const candidate = payload?.candidates?.[0]
      const parts = candidate?.content?.parts || []

      return {
        id: payload?.responseId || 'gemini-stream',
        model: payload?.modelVersion || request.model,
        delta: {
          content: extractTextFromParts(parts) || undefined,
          toolCalls: extractToolCallsFromParts(parts),
          finishReason: candidate?.finishReason ? mapFinishReason(candidate.finishReason) : undefined
        },
        usage: extractUsage(payload),
        raw: payload
      }
    } catch {
      return null
    }
  }
}

export default {
  requestAdapter
}
