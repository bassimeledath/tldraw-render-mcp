# tldraw-render

Headless tldraw diagram renderer for **Claude Code CLI** and other MCP clients. Renders diagrams as PNG or SVG — all rendering happens locally, not on tldraw's servers.

Uses headless Chromium (via [agent-browser](https://github.com/vercel-labs/agent-browser)) to render diagrams server-side. First render takes ~5-8s (browser launch + React/tldraw CDN import), subsequent renders ~100ms.

## How it works

1. A headless Chromium browser is launched as a singleton
2. The browser navigates to [esm.sh](https://esm.sh) and dynamically imports React 18 + tldraw v4
3. A hidden `<Tldraw>` React component is mounted to obtain an `Editor` instance
4. Shapes are created via `editor.createShapes()` with automatic ID conversion, `text`→`richText` mapping, and arrow binding shorthand
5. SVG is exported via `editor.getSvgString()`. For PNG: Playwright screenshots the SVG element. For SVG: the markup is written directly to file.
6. The browser stays alive for subsequent renders (~100ms each)

## Install

### One command (npm)

```bash
# Claude Code
claude mcp add --scope user --transport stdio tldraw -- npx -y tldraw-render

# Or with any MCP client
npx -y tldraw-render
```

### From source

```bash
git clone https://github.com/bassimeledath/tldraw-render-mcp.git
cd tldraw-render-mcp
npm install
npm run build

# Add to Claude Code
claude mcp add --scope user --transport stdio tldraw -- node /absolute/path/to/tldraw-render-mcp/dist/index.js
```

### Claude Desktop / other clients

Add to your MCP config:

```json
{
  "mcpServers": {
    "tldraw": {
      "command": "npx",
      "args": ["-y", "tldraw-render"]
    }
  }
}
```

## Tools

| Tool | Description |
|------|-------------|
| `tldraw_read_me` | Returns the tldraw shape format reference (colors, shape types, style enums, examples). Call once before drawing. |
| `create_tldraw_diagram` | Renders a tldraw shape JSON array to a PNG or SVG file. Returns the file path. |

## Usage

After installing, ask Claude to draw:

- "Draw an architecture diagram showing microservices connected to a message queue"
- "Create a tldraw diagram of the git branching model"
- "Sketch a flowchart for user authentication"

Claude will call `tldraw_read_me` to learn the shape format, then `create_tldraw_diagram` with the shape JSON. The file is saved to disk and the path is returned.

### `create_tldraw_diagram` parameters

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `shapes` | string | yes | JSON array of tldraw shapes (see format reference from `tldraw_read_me`) |
| `outputPath` | string | no | Absolute path for the output file. Defaults to a temp file. |
| `format` | string | no | `"png"` (default) or `"svg"`. SVG outputs vector graphics that scale to any size without quality loss. |

### Simplified input format

The input format is simplified compared to raw tldraw — the renderer handles conversions automatically:

- **Plain string IDs** (`"box1"`) are auto-converted to `createShapeId("box1")`
- **`text` prop** is auto-converted to tldraw's `richText` format internally
- **Arrow `bind` shorthand** (`"bind": { "start": "box1", "end": "box2" }`) creates proper binding records automatically
- **`cameraUpdate` pseudo-element** controls viewport dimensions without being a real tldraw shape

## Privacy

Diagrams are rendered locally in a headless Chromium instance on your machine. The only network request is fetching the React and tldraw JavaScript libraries from esm.sh at startup — no diagram content is sent to third-party servers.

## Requirements

- Node.js 18+
- Chromium is installed automatically via `agent-browser install` (runs as a postinstall hook)

## How it differs from excalidraw-render

This project follows the same architecture as [excalidraw-render](https://github.com/bassimeledath/excalidraw-render-mcp), but uses tldraw instead of Excalidraw.

| | excalidraw-render | tldraw-render |
|---|---|---|
| **Rendering engine** | Excalidraw (`exportToSvg`) | tldraw (`Editor.getSvgString`) |
| **Browser init** | Stateless module import | React app mount (needs `<Tldraw>` component) |
| **Shape format** | Excalidraw elements with labels | tldraw shapes with `geo` subtypes, named colors |
| **First render** | ~3s | ~5-8s (React + tldraw bundle) |
| **Subsequent renders** | ~60ms | ~100ms |

Built with [tldraw](https://github.com/tldraw/tldraw) and [agent-browser](https://github.com/vercel-labs/agent-browser).

## License

MIT
