# Plugin Templates

These templates are copy-and-edit starting points for local plugins.

## Available Templates

- `request-adapter-plugin-typescript`
  - TypeScript request-adapter template for SSE-style streaming APIs
  - Use this when upstream chunks look like `data: {...}`

- `request-adapter-plugin-typescript-raw`
  - TypeScript request-adapter template for raw chunk streaming APIs
  - Use this when upstream does not use SSE framing

## Usage

1. Copy one template directory.
2. Update `plugin.json`.
3. Edit `src/main.ts`.
4. Run `pnpm install && pnpm build`.
5. Import the directory from Settings -> Plugins.

## Reference

- `docs/plugins/plugin-author-checklist.md`
- `docs/plugins/request-adapter-plugin-api.md`
- `plugins/google-gemini-compatible-adapter/`
- `plugins/google-gemini-compatible-adapter-typescript/`
