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

### image
\`type: "image"\` — embed an image on the canvas. Provide the image source as a \`src\` prop (base64 data URL or HTTP URL). The renderer handles asset creation automatically.

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

### Text Alignment (geo shapes)
\`align\`: \`start\` | \`middle\` | \`end\` — horizontal text alignment within the shape
\`verticalAlign\`: \`start\` | \`middle\` | \`end\` — vertical text alignment within the shape

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

**Arrow bending:** Add \`"bend": N\` to props to curve the arrow. Positive values curve right, negative curve left. Useful for separating overlapping parallel arrows.
\`\`\`json
{
  "id": "a-curved", "type": "arrow", "x": 0, "y": 0,
  "props": { "start": {"x":0,"y":0}, "end": {"x":200,"y":0}, "bend": 40, "arrowheadEnd": "arrow" },
  "bind": { "start": "box1", "end": "box2" }
}
\`\`\`

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

**IMPORTANT:** When a shape has \`parentId\` set to a frame's ID, its \`x,y\` coordinates are RELATIVE to the frame's top-left corner, not the canvas origin.
Example: A shape at \`x: 30, y: 40\` inside a frame at \`x: 200, y: 100\` appears at canvas position (230, 140).

### image shape
\`\`\`json
{
  "id": "img1", "type": "image", "x": 50, "y": 50,
  "props": {
    "w": 800, "h": 600,
    "src": "https://example.com/screenshot.png"
  }
}
\`\`\`
The \`src\` prop accepts HTTP URLs or base64 data URLs (\`data:image/png;base64,...\`). The renderer auto-creates tldraw asset records. MIME type is inferred from the URL extension. Both \`w\` and \`h\` are required — match the source image's aspect ratio to avoid stretching.

## Annotated UI Diagrams

**STRICT RULE: NEVER overlay shapes on top of raster images (screenshots, photos, base64 PNGs).**
LLMs cannot see the rendered image, so pixel-coordinate guessing for highlight boxes and arrows produces poor results. Instead, **rebuild the UI as a schematic using tldraw shapes**, then annotate that.

**How to annotate a UI:**
1. **Recreate the UI structure** using \`geo\` rectangles, \`text\` shapes, and \`frame\` shapes. Build a simplified wireframe — you don't need pixel-perfect fidelity, just recognizable structure (header bar, sidebar, content area, buttons, etc.).
2. **Use color and fill** to distinguish sections: \`fill: "solid"\` with \`color: "light-blue"\` for interactive elements, \`"grey"\` for backgrounds, \`"white"\` for content areas.
3. **Add annotations** as \`text\` shapes (2-5 words) in a column to the right, connected by \`arrow\` shapes with \`bind\` to the target elements. Since YOU built every shape, bindings land exactly where intended.
4. Use \`color: "red"\` for annotation arrows and labels to visually separate them from the UI wireframe.

**Why this works:** The LLM controls every shape's position, so arrows connect precisely. No blind guessing over opaque images.

**When to use the \`image\` shape type:** Only for content images that ARE the diagram subject (e.g., a photo gallery layout, an image comparison tool) — never as a background to annotate over.

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

These are recommended defaults. Choose dimensions that match your content's aspect ratio — portrait (e.g., 800x1400) works for tall flowcharts, wide (e.g., 1400x800) for horizontal layouts.

**Tight fit rule:** Set cameraUpdate width/height to your content's maximum extent plus ~80px padding. Oversized viewports create excess whitespace.

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
- WARNING: \`"size": "s"\` text is unreadable in diagrams wider than 800px. Use \`"m"\` or \`"l"\` for Camera L or larger.
- **Hub nodes** (shapes with 4+ arrows): increase shape size (w:250+), space neighbors 400+ px apart, keep arrow labels to 1-3 words, or use \`size: "s"\` for arrow text in dense areas. For scheduler/fan-out patterns, use bend deltas of 40+ or stagger targets vertically by 30-40px
- For multi-line text in \`mono\` font, set shape height to approximately (number of lines * 28) + 40 for \`size: "m"\`
- Frame name labels are small by default. For important section labels, add a separate \`text\` shape with \`size: "l"\` above or inside the frame
- **Dense arrow crossings** between two rows: increase the gap between rows to 120-150px, use \`size: "s"\` for arrows, or use a shared "bus" shape instead of N*M individual arrows
- Avoid arrows that span 3+ frames — use intermediate relay shapes or \`dash: "dashed"\` with \`size: "s"\` for long-distance connections
- Frame height minimum: child shape height + 80px (40px top for label, 20px padding each side). Tight frames cause arrow clipping at borders
- Arrow labels longer than ~8 characters may truncate on short arrows. Use a separate \`text\` shape near the midpoint for longer annotations
- Minimum shape width to avoid word-breaks: approximately \`character_count * 15 + 30\` pixels for \`size: "m"\` \`font: "sans"\`

## Pattern: Sequence Diagrams
- **Lifelines**: unbounded vertical dashed arrows — \`dash: "dashed"\`, \`arrowheadStart: "none"\`, \`arrowheadEnd: "none"\`, NO \`bind\`
- **Messages**: unbounded horizontal arrows at specific y-offsets, anchored to lifeline x-coordinates. NO \`bind\` — use coordinate positioning
- **Left-pointing messages**: use negative \`end.x\` values (e.g., \`"end": {"x": -160, "y": 0}\`)
- Color-code: blue for requests (rightward), green for responses (leftward)

## Pattern: Mind Maps (Radial Layout)
- **Center**: \`cloud\` geo shape with large dimensions (w:200+, h:120+), \`size: "l"\`
- **Branches**: \`ellipse\` shapes, connected with arrows using \`bend: 30-40\` for curved spokes
- **Leaves**: \`rectangle\` shapes, connected with \`bend: 12-18\` for subtle curves
- Space branches 400+ px apart radially from center

## Common Mistakes
- **Forgetting cameraUpdate** — without it the export may have wrong dimensions
- **Using hex colors** — tldraw uses named colors only (\`blue\`, \`red\`, etc.)
- **Using \`width\`/\`height\` on geo shapes** — use \`w\`/\`h\` in props instead
- **Overlapping elements** — check x,y coordinates carefully so shapes don't stack
- **Missing bind targets** — ensure the IDs in \`bind\` match actual shape IDs
- **Using scene coordinates for frame children** — shapes with \`parentId\` use coordinates relative to the parent frame's top-left, not the canvas origin
- **Self-referencing arrows** — binding an arrow's start and end to the same shape does not render. Use a text annotation or separate note instead
- **Image covering overlay shapes** — images are opaque. Place image shapes BEFORE any shapes that should appear on top (array order = z-order)
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
