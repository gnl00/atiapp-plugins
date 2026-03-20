# OpenAI Responses Compatible Adapter

TypeScript local plugin for the OpenAI Responses API.

Official reference:

- https://developers.openai.com/api/reference/resources/responses/methods/create

This plugin maps the app's unified request model to:

- `POST /v1/responses`

It supports:

- non-streaming responses via `parseResponse()`
- streaming responses via `parseStreamResponse()`
- function tools
- text and image input

## Provider Setup

Recommended provider settings:

- Adapter: `openai-response`
- API version: `v1`
- Base URL: `https://api.openai.com/v1`

## Build

```bash
pnpm install
pnpm build
```

The built entry is:

- `dist/main.js`

## Notes

- `request.systemPrompt` is mapped into `instructions`
- user and assistant messages are mapped into `input`
- tool results are mapped into `function_call_output`
