import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import { z } from "zod/v4";
import { renderToPng, renderToSvg } from "./renderer.js";

// ============================================================
// RECALL: shared knowledge for the agent
// ============================================================
const RECALL_CHEAT_SHEET = `# tldraw Shape Format

Thanks for calling tldraw_read_me! Do NOT call it again in this conversation — you will not see anything new. Now use create_tldraw_diagram to draw.

## Color Palette (13 named colors)

| Name | Use |
|------|-----|
| \`black\` | Default text and strokes |
| \`grey\` | Subtle, secondary elements |
| \`light-violet\` | Soft accent |
| \`violet\` | Primary accent |
| \`blue\` | Primary actions, links |
| \`light-blue\` | Soft info, backgrounds |
| \`yellow\` | Warnings, highlights |
| \`orange\` | Attention, data series |
| \`green\` | Success, positive |
| \`light-green\` | Soft success |
| \`light-red\` | Soft error, alert |
| \`red\` | Error, critical |
| \`white\` | White fill/text on dark |

Use these exact string names in the \`color\` prop.

---

## Shape Types

### geo (geometric shapes)
\`type: "geo"\` with \`props.geo\` set to one of 20 subtypes:
\`rectangle\`, \`ellipse\`, \`triangle\`, \`diamond\`, \`pentagon\`, \`hexagon\`, \`octagon\`, \`star\`, \`rhombus\`, \`rhombus-2\`, \`oval\`, \`trapezoid\`, \`arrow-right\`, \`arrow-left\`, \`arrow-up\`, \`arrow-down\`, \`x-box\`, \`check-box\`, \`heart\`, \`cloud\`

### arrow
\`type: "arrow"\` — connectors between shapes. Use \`bind\` shorthand for automatic connections.

### text
\`type: "text"\` — standalone text labels and titles.

### note
\`type: "note"\` — sticky note (colored card with text).

### frame
\`type: "frame"\` — container frame to group shapes visually.

---

## Style Properties

### fill (geo shapes)
\`none\` | \`semi\` | \`solid\` | \`pattern\`

### dash (stroke style)
\`draw\` | \`solid\` | \`dashed\` | \`dotted\`

### size
\`s\` | \`m\` | \`l\` | \`xl\`

### font
\`draw\` | \`sans\` | \`serif\` | \`mono\`

---

## Arrowhead Types
\`arrow\` | \`triangle\` | \`square\` | \`dot\` | \`pipe\` | \`diamond\` | \`inverted\` | \`bar\` | \`none\`

Use in \`props.arrowheadStart\` and \`props.arrowheadEnd\`.

---

## Simplified Input Format

You provide a JSON array of shape objects. The renderer handles conversions automatically:

### Plain string IDs
Use simple strings like \`"box1"\` — they are auto-converted to \`createShapeId("box1")\`.

### text prop (auto-converted to richText)
Use \`"text": "Hello"\` in props — the renderer converts it to tldraw's \`richText\` format internally. Do NOT provide \`richText\` directly.

### Arrow bind shorthand
Add a \`"bind"\` object to arrow shapes to auto-create bindings:
\`"bind": { "start": "box1", "end": "box2" }\`
This creates proper tldraw binding records automatically.

---

## Shape Definitions

### geo shape
\`\`\`json
{
  "id": "box1", "type": "geo", "x": 100, "y": 100,
  "props": {
    "geo": "rectangle", "w": 200, "h": 100,
    "color": "blue", "fill": "solid", "dash": "draw", "size": "m",
    "font": "draw", "text": "Hello World"
  }
}
\`\`\`

### arrow shape
\`\`\`json
{
  "id": "a1", "type": "arrow", "x": 300, "y": 150,
  "props": {
    "start": { "x": 0, "y": 0 },
    "end": { "x": 200, "y": 0 },
    "color": "black",
    "arrowheadStart": "none",
    "arrowheadEnd": "arrow",
    "text": "label"
  },
  "bind": { "start": "box1", "end": "box2" }
}
\`\`\`
When using \`bind\`, the start/end props are still needed as fallback positions but will be overridden by the binding.

### text shape
\`\`\`json
{
  "id": "t1", "type": "text", "x": 100, "y": 50,
  "props": {
    "text": "Title Text",
    "color": "black", "size": "xl", "font": "sans"
  }
}
\`\`\`

### note shape
\`\`\`json
{
  "id": "n1", "type": "note", "x": 100, "y": 100,
  "props": {
    "color": "yellow", "size": "m", "text": "Remember this",
    "font": "draw"
  }
}
\`\`\`

### frame shape
\`\`\`json
{
  "id": "f1", "type": "frame", "x": 50, "y": 50,
  "props": { "w": 500, "h": 400, "name": "Section A" }
}
\`\`\`

---

## cameraUpdate (viewport control)

Use as the FIRST element to set output dimensions. Not a real tldraw shape — it's a rendering directive.

\`\`\`json
{ "type": "cameraUpdate", "width": 800, "height": 600, "x": 0, "y": 0 }
\`\`\`

- \`x, y\`: top-left corner of visible area (scene coordinates)
- \`width, height\`: output image dimensions

---

## Camera Sizing (CRITICAL for readability)

**Recommended sizes (4:3 aspect ratio ONLY):**
- Camera **S**: width 400, height 300 — close-up on 2-3 elements
- Camera **M**: width 600, height 450 — medium section view
- Camera **L**: width 800, height 600 — standard full diagram (DEFAULT)
- Camera **XL**: width 1200, height 900 — large overview. WARNING: small text unreadable
- Camera **XXL**: width 1600, height 1200 — panorama. WARNING: minimum readable font size is \`xl\`

ALWAYS use one of these exact sizes. Non-4:3 viewports cause distortion.

ALWAYS start with a \`cameraUpdate\` as the FIRST element.

---

## Full Example: Two connected boxes with arrow

\`\`\`json
[
  { "type": "cameraUpdate", "width": 800, "height": 600, "x": 0, "y": 0 },
  {
    "id": "title", "type": "text", "x": 250, "y": 30,
    "props": { "text": "Simple Flow", "color": "black", "size": "xl", "font": "sans" }
  },
  {
    "id": "box1", "type": "geo", "x": 100, "y": 150,
    "props": {
      "geo": "rectangle", "w": 200, "h": 100,
      "color": "blue", "fill": "solid", "text": "Input",
      "size": "l", "font": "sans"
    }
  },
  {
    "id": "box2", "type": "geo", "x": 500, "y": 150,
    "props": {
      "geo": "rectangle", "w": 200, "h": 100,
      "color": "green", "fill": "solid", "text": "Output",
      "size": "l", "font": "sans"
    }
  },
  {
    "id": "a1", "type": "arrow", "x": 300, "y": 200,
    "props": {
      "start": { "x": 0, "y": 0 },
      "end": { "x": 200, "y": 0 },
      "color": "black",
      "arrowheadEnd": "arrow",
      "size": "m",
      "text": "process"
    },
    "bind": { "start": "box1", "end": "box2" }
  },
  {
    "id": "note1", "type": "note", "x": 300, "y": 350,
    "props": {
      "color": "yellow", "size": "m",
      "text": "Data flows left to right", "font": "draw"
    }
  }
]
\`\`\`

---

## Tips
- Do NOT call tldraw_read_me again — you already have everything you need
- Use named colors consistently (not hex codes)
- Prefer \`geo\` shapes with \`text\` prop over separate \`text\` shapes for labeled boxes
- Use \`bind\` on arrows whenever connecting to existing shapes — it auto-snaps
- Keep arrow \`text\` labels short to avoid overflow
- Do NOT use emoji in text — they may not render correctly
- For geo shapes, \`w\` and \`h\` control size (not \`width\`/\`height\`)
- The \`size\` prop affects stroke width and text size (\`s\`/\`m\`/\`l\`/\`xl\`)
- Leave padding between content and camera edges (50-80px minimum)
- Draw background shapes first, then foreground — array order = z-order

## Common Mistakes
- **Forgetting cameraUpdate** — without it the export may have wrong dimensions
- **Using hex colors** — tldraw uses named colors only (\`blue\`, \`red\`, etc.)
- **Using \`width\`/\`height\` on geo shapes** — use \`w\`/\`h\` in props instead
- **Overlapping elements** — check x,y coordinates carefully so shapes don't stack
- **Missing bind targets** — ensure the IDs in \`bind\` match actual shape IDs
`;

/**
 * Registers all tldraw tools on the given McpServer.
 */
export function registerTools(server: McpServer): void {
  // ============================================================
  // Tool 1: read_me (call before drawing)
  // ============================================================
  server.registerTool(
    "tldraw_read_me",
    {
      description: "Returns the tldraw shape format reference with color palettes, examples, and tips. Call this BEFORE using create_tldraw_diagram for the first time.",
      annotations: { readOnlyHint: true },
    },
    async (): Promise<CallToolResult> => {
      return { content: [{ type: "text", text: RECALL_CHEAT_SHEET }] };
    },
  );

  // ============================================================
  // Tool 2: create_diagram (headless render to PNG or SVG)
  // ============================================================
  server.registerTool(
    "create_tldraw_diagram",
    {
      description: `Renders a tldraw diagram to a PNG or SVG file.
Call tldraw_read_me first to learn the shape format.
Returns the file path of the saved file.`,
      inputSchema: z.object({
        shapes: z.string().describe(
          "JSON array string of tldraw shapes. Must be valid JSON — no comments, no trailing commas. Keep compact. Call tldraw_read_me first for format reference."
        ),
        outputPath: z.string().optional().describe(
          "Optional absolute file path for the output file. If omitted, saves to a temp file."
        ),
        format: z.enum(["png", "svg"]).optional().describe(
          "Output format: 'png' (default, rasterized) or 'svg' (vector, scalable). SVG is best for high-quality output that needs to scale to any size."
        ),
      }),
      annotations: { readOnlyHint: true },
    },
    async ({ shapes, outputPath, format }): Promise<CallToolResult> => {
      // Validate JSON before attempting render
      try {
        const parsed = JSON.parse(shapes);
        if (!Array.isArray(parsed)) {
          return {
            content: [{ type: "text", text: "shapes must be a JSON array." }],
            isError: true,
          };
        }
      } catch (e) {
        return {
          content: [{ type: "text", text: `Invalid JSON in shapes: ${(e as Error).message}. Ensure no comments, no trailing commas, and proper quoting.` }],
          isError: true,
        };
      }

      try {
        const outputFormat = format ?? "png";
        const filePath = outputFormat === "svg"
          ? await renderToSvg(shapes, outputPath)
          : await renderToPng(shapes, outputPath);
        return {
          content: [{ type: "text", text: `Diagram saved to: ${filePath}` }],
        };
      } catch (e) {
        return {
          content: [{ type: "text", text: `Render failed: ${(e as Error).message}` }],
          isError: true,
        };
      }
    },
  );
}

/**
 * Creates a new MCP server instance with tldraw drawing tools.
 */
export function createServer(): McpServer {
  const server = new McpServer({
    name: "tldraw",
    version: "1.0.0",
  });
  registerTools(server);
  return server;
}
