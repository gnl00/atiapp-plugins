export type ProviderType = string

export type RequestAdapterStreamProtocol = 'sse' | 'raw'

export interface RequestAdapterRequestResult {
  endpoint: string
  headers?: Record<string, string>
  body: unknown
}

export interface RequestAdapterRequestHookContext {
  request: IUnifiedRequest
}

export interface RequestAdapterParseResponseHookContext {
  request: IUnifiedRequest
  raw: unknown
}

export interface RequestAdapterParseStreamResponseHookContext {
  request: IUnifiedRequest
  chunk: string
}

export interface RequestAdapterHooks {
  providerType: ProviderType
  streamProtocol?: RequestAdapterStreamProtocol
  supportsStreamOptionsUsage?: boolean
  request: (context: RequestAdapterRequestHookContext) => RequestAdapterRequestResult
  parseResponse: (context: RequestAdapterParseResponseHookContext) => IUnifiedResponse
  parseStreamResponse?: (context: RequestAdapterParseStreamResponseHookContext) => IUnifiedStreamResponse | null
}

export interface IUnifiedRequest {
  adapterPluginId: string
  baseUrl: string
  apiKey: string
  modelType?: string
  model: string
  userInstruction?: string
  systemPrompt?: string
  messages: ChatMessage[]
  stream?: boolean
  tools?: ToolDefinition[]
  requestOverrides?: Record<string, unknown>
  options?: {
    maxTokens?: number
    thinkingLevel?: string
  }
}

export interface ToolDefinition {
  type?: 'function'
  name?: string
  description?: string
  inputSchema?: Record<string, unknown>
  parameters?: Record<string, unknown>
  function?: {
    name: string
    description?: string
    parameters?: Record<string, unknown>
    inputSchema?: Record<string, unknown>
  }
}

export interface IToolCall {
  id: string
  index?: number
  type: 'function'
  function: {
    name: string
    arguments: string
  }
}

export interface ITokenUsage {
  promptTokens: number
  completionTokens: number
  totalTokens: number
}

export interface IUnifiedResponse {
  id: string
  model: string
  timestamp: number
  content: string
  reasoning?: string
  toolCalls?: IToolCall[]
  finishReason: 'stop' | 'length' | 'tool_calls' | 'content_filter' | 'error'
  usage?: ITokenUsage
  raw?: unknown
}

export interface IUnifiedStreamResponse {
  id: string
  model: string
  delta?: {
    content?: string
    reasoning?: string
    toolCalls?: IToolCall[]
    finishReason?: 'stop' | 'length' | 'tool_calls' | 'content_filter' | 'error'
  }
  usage?: ITokenUsage
  raw?: unknown
}

export interface BaseChatMessage {
  createdAt?: number
  role: string
  content: string | VLMContent[]
  name?: string
  toolCallId?: string
  toolCalls?: IToolCall[]
}

export interface ChatMessage extends BaseChatMessage {
  model?: string
  modelRef?: { accountId: string; modelId: string }
  typewriterCompleted?: boolean
  source?: string
  segments: MessageSegment[]
}

export interface VLMContent {
  type: 'image_url' | 'text'
  text?: string
  image_url?: {
    url: string
    detail: 'auto' | 'low' | 'high'
  }
}

export type MessageSegment = {
  type?: string
  text?: string
  reasoning?: string
  toolCalls?: IToolCall[]
  [key: string]: unknown
}
