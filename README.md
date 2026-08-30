# ✂ Snipwise — Screenshot, Multi-Page Editor & PDF

> Capture. Combine. Annotate. Export. Right in your browser.

A free, open-source Chrome extension for capturing screenshots, combining them into multi-image, multi-page compositions, annotating them, and exporting as PNG or a fully customizable PDF — 100% locally, with no uploads, no accounts, and no tracking.

[![Chrome Web Store](https://img.shields.io/badge/Chrome_Web_Store-Install-4285F4?style=flat-square&logo=googlechrome&logoColor=white)](https://chromewebstore.google.com/detail/snipwise)
[![License](https://img.shields.io/badge/license-MIT-7c3aed?style=flat-square)](LICENSE)
[![Manifest](https://img.shields.io/badge/manifest-v3-a78bfa?style=flat-square)]()
[![Version](https://img.shields.io/badge/version-2.0.0-c4b5fd?style=flat-square)]()

---

## Features

### 5 Ways to Start

| Mode | Description |
|------|-------------|
| 📷 **Visible Area** | Captures exactly what's on screen right now |
| 📄 **Full Page** | Scrolls and stitches the entire page automatically |
| ✂ **Crop Region** | Drag to select any area of the page |
| 🖨 **Save as PDF** | Quick one-click capture straight to a PDF file |
| 🗂 **Blank Workspace** | Open the editor with nothing loaded — build a composition entirely from local images, drag-drop, or paste |

### A Real Multi-Image, Multi-Page Editor

Capture opens a full editor in a new tab, built around **pages** and **layers** — not a single flat screenshot:

- **Pages** — a workspace can hold multiple pages, each its own canvas. Add pages, reorder them, delete them; each keeps its own layers, annotations, and undo history.
- **Image layers** — every image on a page (the original capture, or anything you add afterward) is a movable, resizable, reorderable, opacity-adjustable layer, not baked-in pixels. Select with the **Move tool (V)**, drag to reposition, drag a corner to resize.
- **Add images** three ways: file picker, drag-and-drop onto the canvas, or paste (**Ctrl+V**) — including screenshots copied from anywhere else.
- **Ratio-locked resize** — hold **Shift** while resizing to preserve aspect ratio, or toggle the padlock button to make it the default.
- **Zoom controls** — `−` / `100%` / `+` / **Fit**, in the status bar. Auto-fits when a page's content actually changes size; stays put when you switch pages.

### Annotation Tools

- **✏ Pen** — freehand drawing
- **↗ Arrow** — clean filled arrowhead, shaft stops before tip
- **─ Line** — straight line
- **▭ Rectangle** / **○ Circle** — shapes fitted to bounding box
- **T Text** — click to place, type, Enter to commit. **A real object**: select it with the Move tool to reposition/resize (font scales with the box), or double-click to edit the text in place.
- **💬 Callout Bubble** — typed text inside a speech bubble with tail. Same object behavior as Text — movable, resizable, double-click to edit.
- **① Step Markers** — auto-numbered circles for tutorials, resets on clear
- **🖍 Highlight** — translucent marker strokes
- **⬛ Blur / Redact** — pixelate sensitive information
- **✂ Crop Canvas** — trim the whole composition after capture
- **😀 Emoji Stamp** — pick from 30 emojis and stamp anywhere

Colors aren't limited to a preset palette — pick any color via the swatches, the native color picker, or by typing a hex code directly. Custom stroke sizes. **50-level undo**, unified across annotations, layer moves, and page structure. Full keyboard shortcuts.

### Export Options

- **⬇ Download PNG** — full resolution, lossless
- **📋 Copy Image** — paste directly into Slack, email, Figma, WhatsApp
- **🖨 Export PDF** — opens a settings dialog with a **live preview**: page size (A4/Letter/Legal), orientation, margins, and a fully customizable cover page (your own title, accent color, thumbnail toggle) or none at all. Each workspace page maps to its own PDF page by default — "Split tall pages" is available as an option for a genuinely tall full-page capture. Combines every page in the workspace into one document.

### Interface

- Light theme by default (plain, high-contrast, "mini Photoshop" styling), dark theme available via the toggle — both use real neutral tokens, not a tinted overlay.
- Hand-drawn SVG icon set throughout — no emoji-as-UI-chrome (the Emoji Stamp tool's own picker is the one legitimate exception, since that's content you're placing, not app chrome).
- Sidebar: a **Pages** panel (vertical cards with large thumbnails) stacked above a **Layers** panel (two-tier rows: thumbnail/name/visibility on top, opacity/reorder/delete below) — both refresh live as you work.

---

## Installation

### From Chrome Web Store
[![Install from Chrome Web Store](https://img.shields.io/badge/Available_on-Chrome_Web_Store-4285F4?style=flat-square&logo=googlechrome)](https://chromewebstore.google.com/detail/snipwise)

### Developer Mode (Local)

```bash
git clone https://github.com/AdnanTemurBarcha/snipwise.git
```

1. Open Chrome → go to `chrome://extensions`
2. Enable **Developer mode** (top-right toggle)
3. Click **Load unpacked**
4. Select the cloned `snipwise` folder

---

## How It Works

### Capture pipeline

```
Click mode in popup
        │
        ├── Visible Area ──→ background.captureVisibleTab() ──→ editor.html
        │
        ├── Full Page ──────→ content.js injects
        │                      ↓
        │                   Capture fixed elements (headers/footers)
        │                      ↓
        │                   Hide fixed elements
        │                      ↓
        │                   Scroll in viewport steps
        │                   Read actual window.scrollY after each step
        │                   Draw only new pixels onto canvas
        │                      ↓
        │                   Restore + composite fixed elements
        │                      ↓
        │                   Send to background → editor.html
        │
        ├── Crop Region ────→ content.js injects SVG mask overlay
        │                   User drags selection (clear cutout, dark surround)
        │                   Capture → crop → editor.html
        │
        ├── Save as PDF ────→ Same as Full Page
        │                   Routes to pdf.html instead of editor
        │                   jsPDF converts canvas → .pdf download → tab closes
        │
        └── Blank Workspace → Opens editor.html directly, no capture —
                            the canvas stays unsized until you add a
                            first image (file picker / drag-drop / paste)
```

Everything past "→ editor.html" is the modular editor described below — the capture pipeline itself (background.js, content.js, popup) is unchanged from how it always worked.

### Editor architecture

The editor (`editor.html` + `editor/`) is a set of native ES modules — no bundler, no npm, loaded directly via `<script type="module">`. It's organized around a strict boundary: business logic never touches the DOM, only `ui/*` and `main.js` do.

```
editor/
├── main.js              # wires everything together; the only place that owns
│                         #   both the workspace state and the live canvases
├── core/                 # pure logic — no `document` anywhere in this folder
│   ├── scene.js           # layer model: image/text/callout layers, hit-testing,
│   │                       #   reorder, resize (incl. proportional font scaling)
│   ├── workspace.js        # pages: create/remove/reorder, persisted snapshots
│   ├── history.js          # unified undo stack (annotations + layers + pages)
│   └── geometry.js         # bbox math, resize-handle hit-testing, arrow math
├── render/
│   └── compositor.js      # draws the scene (image/text/callout layers back-to-
│                           #   front + annotation raster on top); also the one
│                           #   place that knows how to flatten a scene for export
├── tools/                  # one file per tool — pen, arrow, line, rect, circle,
│                           #   text, callout, highlight, blur, step, emoji,
│                           #   crop-canvas, move — none of them touch `document`
├── ui/                     # all DOM wiring: toolbar, layers/pages panels,
│                           #   PDF export dialog, inline text editor, icons
└── io/                     # the only place that knows about chrome.* APIs and
                            #   jsPDF: capture import, PNG/clipboard export,
                            #   the PDF builder
```

**Why layers/pages are plain objects, not classes:** `core/scene.js`'s layer functions (`hitTestLayer`, `reorderLayer`, `resizeLayer`, `setLayerProp`, `cloneLayers`) work generically on `{id, x, y, width, height, ...}` regardless of layer *type*. Image layers, text layers, and callout layers all live in the same `scene.layers` array — the compositor just branches on `layer.type` when drawing. Pages work the same way one level up: a page is a persisted snapshot of a scene, and switching pages means flushing the live buffers into the outgoing page's snapshot and loading the incoming one back into the same shared objects everything else already holds references to. Adding a new *type* of thing (as happened when Text/Callout became real objects) is a small, contained change — not a new subsystem.

### Full page accuracy

The scroll-stitch reads `window.scrollY` **after** every `scrollTo()` call instead of trusting the requested position. Browsers clamp scrolling near the bottom, so using the actual position prevents the last strip from repeating. Fixed/sticky elements (navbars, footers) are captured separately at scroll=0, hidden during stitching, then composited back at their correct absolute positions.

### Injection dedup

Content script injection is guarded at three levels:
1. `window.__snipwiseLoaded` flag prevents re-registration of listeners
2. Pre-injection check in popup verifies flag before calling `executeScript`
3. Background ignores duplicate `captureReady` messages within 2 seconds

---

## File Structure

```
snipwise/
├── manifest.json       # MV3, no host permissions
├── popup.html/.js      # Mode selector UI — capture modes + Blank Workspace
├── background.js       # Service worker — captures, storage, tab routing
├── content.js           # Page-level — full page stitch, SVG crop overlay
├── editor.html          # Editor shell — loads editor/main.js as a module
├── editor/               # Modular editor — see "Editor architecture" above
├── pdf.html / pdf.js     # Silent one-click PDF converter (the popup's
│                         #   "Save as PDF" fast path — separate from the
│                         #   in-editor Export PDF dialog)
├── jspdf.min.js         # Bundled locally (no CDN, no CSP issues)
└── icons/
    ├── icon16.png
    ├── icon48.png
    └── icon128.png
```

**No build step. No npm. No dependencies to install.** Edit files and reload the extension directly.

---

## Keyboard Shortcuts

| Key | Tool |
|-----|------|
| `V` | Move / Select |
| `P` | Pen |
| `A` | Arrow |
| `L` | Line |
| `R` | Rectangle |
| `C` | Circle |
| `T` | Text |
| `H` | Highlight |
| `S` | Step Marker |
| `O` | Callout Bubble |
| `B` | Blur / Redact |
| `E` | Emoji Stamp |
| `X` | Crop Canvas |
| `Shift` (while resizing) | Lock aspect ratio |
| `Delete` / `Backspace` | Remove selected layer |
| Arrow keys (Move tool) | Nudge selected layer (`Shift` = 10px) |
| Double-click (Move tool) | Edit a Text/Callout layer's content |
| `Ctrl+Z` | Undo |
| `Ctrl+S` | Download PNG |
| `Ctrl+C` | Copy Image |

---

## Permissions

| Permission | Why |
|------------|-----|
| `activeTab` | Capture a screenshot of the current tab |
| `scripting` | Inject crop overlay and full-page scroll capture into the page |
| `tabs` | Open the editor and PDF exporter in new tabs |
| `storage` | Save theme preference and last capture reference locally |
| `downloads` | Save PNG and PDF files to the user's Downloads folder |

**No host permissions.** No external requests. No "Proceed with caution" warning on install.

---

## Privacy

Snipwise is 100% local. No data ever leaves your device.

- No analytics
- No tracking
- No crash reporting
- No cloud uploads
- No user accounts
- No external API calls

The only external resource is the Google Fonts stylesheet for editor typography — a standard browser request with no user identifiers.

Full privacy policy: [https://snipwise.nexylius.com/privacy/](https://snipwise.nexylius.com/privacy/)

---

## Modifying

### Change the color theme

Both themes are CSS variables at the top of `popup.html` and `editor.html` — light is the default (`:root`), dark is opt-in (`html.dark`):

```css
:root {
  --accent:  #6d4aff;   /* primary accent */
  --bg:      #e7e9ec;   /* canvas backdrop */
  --surface: #ffffff;   /* panels/toolbar */
}
html.dark {
  --accent:  #9583ff;
  --bg:      #18191c;
  --surface: #232427;
}
```

### Add a new annotation tool

1. Create `editor/tools/your-tool.js` exporting `defineTool({ id, cursor, onPointerDown, onPointerMove, onPointerUp })` from `tools/tool-base.js` — look at `editor/tools/rect.js` for the simplest example (or `text.js` if it should be a movable object rather than raster).
2. Register it in `editor/tools/index.js`.
3. Add a toolbar button in `editor.html` (`data-icon="..."` referencing an entry in `editor/ui/icons.js`, or add a new icon there first) and a shortcut key in `editor/keyboard.js`.

Tools never touch `document` directly — they receive an injected `ctx` (scene, annotation canvas, history, and a few UI callbacks) and a canvas-space pointer position.

### Change the test server for PDF / capture

Full page capture uses only browser APIs — no external server involved. PDF conversion uses bundled jsPDF with no network calls.

---

## Contributing

Pull requests welcome. A few things to keep in mind:

- **No build tooling** — keep it plain HTML/CSS/JS (native ES modules are fine), loadable directly as unpacked
- **No external libraries at runtime** — jsPDF is bundled, nothing else loads remotely
- **No host permissions** — the extension intentionally has none; keep it that way
- **Keep the module boundary** — `core/` and `render/` never import `document`; `tools/*` never touch it either (see "Editor architecture" above)
- No emoji as UI chrome — add an SVG icon to `editor/ui/icons.js` instead (the Emoji Stamp tool's own picker grid is the exception, since that's user content)
- Test on both Chrome and Brave before submitting

---

## Related

- [SwiftCheck](https://github.com/AdnanTemurBarcha/swift-check) — Internet speed test in MB/s, also built by the same developer

---

## License

MIT — do whatever you want, attribution appreciated.

---

## Credits

- PDF export: [jsPDF](https://github.com/parallax/jsPDF) — bundled locally
- Fonts: [Inter](https://fonts.google.com/specimen/Inter), [JetBrains Mono](https://fonts.google.com/specimen/JetBrains+Mono) via Google Fonts
- Built by [Adnan Temur Barcha](https://github.com/AdnanTemurBarcha)
