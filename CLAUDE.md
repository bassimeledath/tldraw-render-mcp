# tldraw MCP Server (Headless PNG/SVG)

MCP server that renders tldraw diagrams as PNG or SVG files via headless Chromium. Designed for Claude Code CLI (no browser UI required).

## Architecture

```
server.ts      → 2 tools (tldraw_read_me, create_tldraw_diagram) + cheat sheet
renderer.ts    → Headless browser singleton (agent-browser/Playwright) + embedded React/tldraw init
main.ts        → stdio transport entry point
```

## Tools

### `tldraw_read_me` (text tool)
Returns a cheat sheet with shape format, color palettes, style enums, examples, and tips. Call before `create_tldraw_diagram`.

### `create_tldraw_diagram` (render tool)
Takes `shapes` (JSON string), optional `outputPath`, and optional `format` (png/svg). Renders the diagram in headless Chromium and returns the file path.

## Setup

```bash
npm install
npm run setup    # Downloads Chromium via agent-browser
npm run build
```

## Running

```bash
# stdio (for Claude Code CLI)
node dist/index.js
```

## Claude Code config

Add to `~/.claude.json`:

```json
{
  "mcpServers": {
    "tldraw": {
      "command": "node",
      "args": ["/absolute/path/to/tldraw-render-mcp/dist/index.js"]
    }
  }
}
```

## Build

```bash
npm run build
```

Build pipeline: `tsc -p tsconfig.server.json` → `bun build` (server + renderer + index).

## Key Design Decisions

### Headless PNG/SVG rendering (no UI surface)
Claude Code CLI has no browser rendering surface. Instead of `ui://` resources, we render diagrams server-side in headless Chromium and save as PNG/SVG files.

### React + tldraw in headless browser
Unlike Excalidraw (which exposes stateless `exportToSvg()`), tldraw requires a live React component (`<Tldraw>`) to get an `Editor` instance. The browser init script mounts a hidden React app, captures the Editor ref on mount, then uses it for all shape creation and SVG export.

### Browser singleton
The headless browser is lazily initialized on first `create_tldraw_diagram` call and reused for subsequent renders. First render is slow (~5-8s for React + tldraw bundle) but subsequent renders are fast (~100ms). Health checks detect crashes and re-launch automatically.

### tldraw from CDN
The headless browser dynamically imports React 18 + tldraw from `esm.sh` CDN at initialization time — no npm dependency needed server-side.

### Simplified input format
The input format is simplified vs raw tldraw: plain string IDs auto-convert to `createShapeId()`, `text` props auto-convert to `richText`, and arrow `bind` shorthand auto-creates binding records.

### Viewport via cameraUpdate
The `cameraUpdate` pseudo-element controls the output viewport/dimensions. The SVG `viewBox` is adjusted to crop to the camera's scene-space rectangle.

## Debugging

### Common issues
- **Browser launch fails:** Run `npm run setup` to install Chromium
- **Render times out:** Check internet access to esm.sh — the headless browser loads React + tldraw from CDN
- **First render slow:** Expected (~5-8s). Subsequent renders reuse the browser singleton and are fast.
- **Empty PNG:** Shapes array had no drawable shapes (only cameraUpdates)
- **Shapes not appearing:** Check that shape `type` and `props.geo` values are valid tldraw types
- **Colors wrong:** tldraw uses named colors (`blue`, `red`, etc.), not hex codes
