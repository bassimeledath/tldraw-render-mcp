/**
 * Headless renderer for tldraw diagrams (PNG and SVG).
 * Uses agent-browser (Playwright wrapper) to render diagrams in headless Chromium.
 * Singleton pattern: browser is lazily initialized on first call and reused.
 *
 * Navigates to esm.sh and dynamically imports React + tldraw modules via page.evaluate(),
 * since tldraw requires a live React component (<Tldraw>) to get an Editor instance.
 */

import { BrowserManager } from "agent-browser/dist/browser.js";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

let browser: BrowserManager | null = null;

/**
 * Browser-side initialization script. Runs inside headless Chromium.
 * Sets up DOM, loads React + tldraw from esm.sh, mounts a hidden <Tldraw> component,
 * captures the Editor reference, and exposes renderDiagram().
 */
const BROWSER_INIT_SCRIPT = `
(async () => {
  // Set up DOM
  document.body.innerHTML = '<div id="tldraw-host" style="position:fixed;top:0;left:0;width:1920px;height:1080px;opacity:0;pointer-events:none;z-index:-1"></div><div id="canvas" style="display:inline-block"></div>';
  document.body.style.margin = "0";
  document.body.style.padding = "0";
  document.body.style.background = "white";

  // Load tldraw CSS
  const link = document.createElement("link");
  link.rel = "stylesheet";
  link.href = "https://esm.sh/tldraw@4/tldraw.css";
  document.head.appendChild(link);
  await new Promise(function(r) { link.onload = r; link.onerror = r; });

  // Import React + ReactDOM + tldraw from esm.sh
  const React = await import("https://esm.sh/react@18");
  const ReactDOMClient = await import("https://esm.sh/react-dom@18/client?deps=react@18");
  const tldraw = await import("https://esm.sh/tldraw@4?deps=react@18,react-dom@18");

  const { Tldraw, createShapeId, toRichText } = tldraw;
  const { createElement } = React;

  // Store editor reference globally
  window.__tldraw_editor__ = null;

  // Create and mount the tldraw app
  const editorPromise = new Promise(function(resolve) {
    const app = createElement(Tldraw, {
      hideUi: true,
      onMount: function(editor) {
        window.__tldraw_editor__ = editor;
        resolve(editor);
      }
    });

    const root = ReactDOMClient.createRoot(document.getElementById("tldraw-host"));
    root.render(app);
  });

  // Wait for editor to mount
  const editor = await editorPromise;

  // Wait for fonts to load
  try {
    await Promise.race([
      document.fonts.ready,
      new Promise(function(r) { setTimeout(r, 3000); })
    ]);
  } catch(e) { /* ignore font loading errors */ }

  // Wait for tldraw internal initialization (editor store, shape utils, etc.)
  await new Promise(function(r) { setTimeout(r, 1500); });

  const EXPORT_PADDING = 20;

  function resizeSvg(markup, newW, newH) {
    const doc = new DOMParser().parseFromString(markup, "image/svg+xml");
    const svg = doc.documentElement;
    svg.setAttribute("width", String(newW));
    svg.setAttribute("height", String(newH));
    return new XMLSerializer().serializeToString(svg);
  }

  window.renderDiagram = async function(shapesJson, options) {
    options = options || {};
    const shapes = JSON.parse(shapesJson);
    const ed = window.__tldraw_editor__;
    if (!ed) throw new Error("tldraw editor not initialized");

    // Extract viewport and drawable shapes
    let viewport = null;
    const drawShapes = [];
    for (let i = 0; i < shapes.length; i++) {
      const el = shapes[i];
      if (el.type === "cameraUpdate") {
        viewport = { x: el.x || 0, y: el.y || 0, width: el.width || 800, height: el.height || 600 };
      } else {
        drawShapes.push(el);
      }
    }

    if (drawShapes.length === 0) throw new Error("No drawable shapes provided");

    // Clear all existing shapes (bindings are cleaned up automatically)
    const existingIds = ed.getCurrentPageShapeIds();
    if (existingIds.size > 0) {
      ed.deleteShapes([...existingIds]);
    }

    // Collect binding info from the bind shorthand
    const bindings = [];

    // Convert simplified shapes to tldraw format
    const tldrawShapes = [];
    for (let j = 0; j < drawShapes.length; j++) {
      const shape = drawShapes[j];
      const id = createShapeId(shape.id);
      const converted = {
        id: id,
        type: shape.type,
        x: shape.x || 0,
        y: shape.y || 0,
      };

      // Copy props, converting text -> richText
      if (shape.props) {
        const props = {};
        const propKeys = Object.keys(shape.props);
        for (let k = 0; k < propKeys.length; k++) {
          const key = propKeys[k];
          if (key === "text") {
            props.richText = toRichText(shape.props.text);
          } else {
            props[key] = shape.props[key];
          }
        }
        converted.props = props;
      }

      // Handle parentId (frame children)
      if (shape.parentId) {
        converted.parentId = createShapeId(shape.parentId);
      }

      // Collect bind info for arrows
      if (shape.bind) {
        ["start", "end"].forEach(function(terminal) {
          if (shape.bind[terminal]) {
            bindings.push({
              fromId: id,
              toId: createShapeId(shape.bind[terminal]),
              type: "arrow",
              props: {
                terminal: terminal,
                normalizedAnchor: { x: 0.5, y: 0.5 },
                isExact: false,
                isPrecise: false
              }
            });
          }
        });
      }

      tldrawShapes.push(converted);
    }

    // Create all shapes
    ed.createShapes(tldrawShapes);

    // Create bindings (after shapes exist)
    if (bindings.length > 0) {
      ed.createBindings(bindings);
    }

    // Get all shape IDs for export
    const shapeIds = tldrawShapes.map(function(s) { return s.id; });

    // Export to SVG
    const result = await ed.getSvgString(shapeIds, {
      background: true,
      padding: EXPORT_PADDING
    });

    if (!result) throw new Error("SVG export returned undefined");

    let svgMarkup = result.svg;
    const scale = options.scale || 2;

    // If viewport specified, use it for output dimensions but ensure all content is visible.
    // The viewport acts as a minimum size, auto-expanding if shapes extend beyond it.
    if (viewport) {
      // Compute scene-space bounding box of all shapes
      let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
      for (let si = 0; si < drawShapes.length; si++) {
        const ds = drawShapes[si];
        const sx = ds.x || 0;
        const sy = ds.y || 0;
        const sw = (ds.props && ds.props.w) || 100;
        const sh = (ds.props && ds.props.h) || 100;
        minX = Math.min(minX, sx);
        minY = Math.min(minY, sy);
        maxX = Math.max(maxX, sx + sw);
        maxY = Math.max(maxY, sy + sh);
      }

      // Auto-expand viewport to union of camera bounds and shape bounds (with padding)
      const PAD = 40;
      const fitW = Math.max(viewport.x + viewport.width, maxX + PAD) - Math.min(viewport.x, minX - PAD);
      const fitH = Math.max(viewport.y + viewport.height, maxY + PAD) - Math.min(viewport.y, minY - PAD);

      svgMarkup = resizeSvg(svgMarkup, Math.round(fitW * scale), Math.round(fitH * scale));
    } else if (scale !== 1) {
      // Scale up for retina if PNG
      const doc = new DOMParser().parseFromString(svgMarkup, "image/svg+xml");
      const svg = doc.documentElement;
      const w = parseFloat(svg.getAttribute("width") || result.width);
      const h = parseFloat(svg.getAttribute("height") || result.height);
      svgMarkup = resizeSvg(svgMarkup, w * scale, h * scale);
    }

    // Insert SVG into canvas div for PNG screenshot
    const canvas = document.getElementById("canvas");
    canvas.innerHTML = svgMarkup;

    return {
      width: viewport ? viewport.width * scale : result.width,
      height: viewport ? viewport.height * scale : result.height,
      svg: svgMarkup
    };
  };

  window.__RENDER_READY__ = true;
})()
`;

async function ensureBrowser(): Promise<BrowserManager> {
  if (browser) {
    try {
      const page = browser.getPage();
      await page.evaluate(() => true);
      return browser;
    } catch {
      try { await browser.close(); } catch { /* ignore */ }
      browser = null;
    }
  }

  browser = new BrowserManager();
  await browser.launch({ id: "tldraw", action: "launch", headless: true });

  const page = browser.getPage();

  // Navigate to esm.sh so relative module imports resolve correctly
  await page.goto("https://esm.sh", { waitUntil: "domcontentloaded" });

  // Initialize tldraw in the browser context — this is slow (~5-8s for React + tldraw first load)
  await page.evaluate(BROWSER_INIT_SCRIPT);

  // Verify initialization succeeded
  const ready = await page.evaluate(() => (globalThis as any).__RENDER_READY__ === true);
  if (!ready) {
    throw new Error("tldraw initialization failed in headless browser");
  }

  return browser;
}

/**
 * Render shapes in headless browser and return the result.
 * Shared by renderToPng and renderToSvg.
 */
async function renderInBrowser(
  shapesJson: string,
  scale: number,
): Promise<{ page: any; svgMarkup: string }> {
  const mgr = await ensureBrowser();
  const page = mgr.getPage();

  const result = await page.evaluate(
    async ({ json, opts }: { json: string; opts: { scale: number } }) => {
      return await (globalThis as any).renderDiagram(json, opts);
    },
    { json: shapesJson, opts: { scale } },
  );

  return { page, svgMarkup: result.svg };
}

/**
 * Resolve output path and ensure its parent directory exists.
 */
function resolveOutput(outputPath: string | undefined, ext: string): string {
  const dest = outputPath
    ? path.resolve(outputPath)
    : path.join(os.tmpdir(), `tldraw-${Date.now()}.${ext}`);
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  return dest;
}

/**
 * Render tldraw shapes JSON to a PNG file.
 *
 * @param shapesJson - JSON array string of tldraw shapes
 * @param outputPath - Optional output file path. If not provided, uses a temp file.
 * @param options - { scale?: number } - Scale factor for retina output (default: 2)
 * @returns Absolute path to the saved PNG file
 */
export async function renderToPng(
  shapesJson: string,
  outputPath?: string,
  options?: { scale?: number },
): Promise<string> {
  const scale = options?.scale ?? 2;
  const { page } = await renderInBrowser(shapesJson, scale);

  const svgLocator = page.locator("#canvas > svg");
  await svgLocator.waitFor({ state: "visible", timeout: 10_000 });

  const dest = resolveOutput(outputPath, "png");
  await svgLocator.screenshot({ path: dest, type: "png" });

  return dest;
}

/**
 * Render tldraw shapes JSON to an SVG file.
 *
 * @param shapesJson - JSON array string of tldraw shapes
 * @param outputPath - Optional output file path. If not provided, uses a temp file.
 * @returns Absolute path to the saved SVG file
 */
export async function renderToSvg(
  shapesJson: string,
  outputPath?: string,
): Promise<string> {
  const { svgMarkup } = await renderInBrowser(shapesJson, 1);

  const dest = resolveOutput(outputPath, "svg");
  await fs.promises.writeFile(dest, svgMarkup, "utf-8");

  return dest;
}

/**
 * Close the headless browser. Call on process shutdown.
 */
export async function closeBrowser(): Promise<void> {
  if (browser) {
    try { await browser.close(); } catch { /* ignore */ }
    browser = null;
  }
}
