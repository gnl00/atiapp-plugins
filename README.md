# atiapp-plugins

Plugin repository for `@i` / `atiapp`.

This repository hosts standalone request-adapter plugins and plugin templates used by the app. It is kept separate from the main app repository so plugin development, versioning, and publishing can evolve independently.

## Repository Layout

- `openai-response-compatible-adapter`
  OpenAI Responses API compatible request adapter plugin.
- `google-gemini-compatible-adapter`
  JavaScript Gemini-compatible adapter example.
- `google-gemini-compatible-adapter-typescript`
  TypeScript Gemini-compatible adapter example.
- `templates`
  Starter templates for building new request-adapter plugins.

## Plugin Structure

A plugin directory typically contains:

- `plugin.json`
  Plugin manifest.
- `src/main.ts` or `main.mjs`
  Plugin entry.
- `src/types.ts`
  Plugin-local types when needed.
- `package.json`
  Build dependencies for TypeScript-based plugins.
- `dist/`
  Build output for distributable plugins.

## Development

Use `pnpm` for TypeScript-based plugins.

Examples:

```bash
cd openai-response-compatible-adapter
pnpm install
pnpm exec tsc -p tsconfig.json
```

```bash
cd google-gemini-compatible-adapter-typescript
pnpm install
pnpm exec tsc -p tsconfig.json
```

## Using These Plugins In atiapp

In the main app, local plugins can be imported from a directory path. Point the app to one of the plugin folders in this repository after building it if the plugin requires compilation.

For TypeScript plugins, make sure `dist/` is up to date before importing into the app.

## Templates

Use the templates under `templates/` as the starting point for new plugins instead of copying an existing production plugin directly.

## Notes

- Keep plugin manifests and exported hook contracts aligned with the app's plugin API.
- Avoid committing secrets, API keys, or machine-specific paths.
- Built artifacts in `dist/` may be committed only when the plugin distribution flow requires them.
