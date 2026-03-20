# Google Gemini Compatible Adapter

Local request-adapter plugin for the Google Gemini `models.generateContent` API.

Suggested provider config:

- Adapter: `gemini`
- API Base URL: `https://generativelanguage.googleapis.com/v1beta`
- API Version: `v1beta`

This plugin builds requests against:

- `POST /models/{model}:generateContent`
- `POST /models/{model}:streamGenerateContent?alt=sse`

Reference:

- https://ai.google.dev/api/generate-content?hl=zh-cn#method:-models.generatecontent
