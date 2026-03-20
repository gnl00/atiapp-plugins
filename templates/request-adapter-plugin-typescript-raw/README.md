# Request Adapter Plugin Template (Raw Stream)

This template is for upstream APIs that stream raw text chunks instead of SSE `data: ...` events.

Use this template when:

- the response body is chunked text
- the upstream sends NDJSON without SSE framing
- the upstream uses custom delimiters

If your upstream uses standard SSE, use:

- `plugins/templates/request-adapter-plugin-typescript/`

## Quick Start

1. Copy this directory.
2. Update `plugin.json`.
3. Edit `src/main.ts`.
4. Run:

```bash
pnpm install
pnpm build
```

5. Import the directory from Settings -> Plugins.
