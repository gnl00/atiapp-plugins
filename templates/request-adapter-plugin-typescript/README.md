# Request Adapter Plugin Template

This template is a self-contained TypeScript starting point for local `request-adapter` plugins.

## Files

- `plugin.json`: plugin manifest loaded by the app
- `src/main.ts`: your plugin entry
- `src/types.ts`: local plugin API types copied from the app contract
- `tsconfig.json`: TypeScript build config
- `package.json`: local build script

## Quick Start

1. Copy this directory.
2. Update `plugin.json`:
   - `id`
   - `name`
   - `version`
   - `capabilities`
3. Edit `src/main.ts`.
4. Build:

```bash
pnpm install
pnpm build
```

5. Import the plugin directory from Settings -> Plugins.

The app will load `plugin.json`, then import `entries.main`.

## Current Entry Contract

Recommended export:

```ts
export const requestAdapter: RequestAdapterHooks = { ... }
export default { requestAdapter }
```

You only need to implement:

- `request({ request })`
- `parseResponse({ request, raw })`
- `parseStreamResponse({ request, chunk })` if the upstream API is streaming

## Build Output

This template builds to:

- `dist/main.js`

`plugin.json` already points to that file.

## Reference

- See `docs/plugins/request-adapter-plugin-api.md`
- See `plugins/google-gemini-compatible-adapter/` for a complete example
