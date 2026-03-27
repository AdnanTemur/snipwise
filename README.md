# ✂ Snipwise — Screenshot & PDF

> Capture. Annotate. Export. Right in your browser.

A free, open-source Chrome extension for capturing screenshots, annotating them, and exporting as PNG or PDF — 100% locally, with no uploads, no accounts, and no tracking.

[![Chrome Web Store](https://img.shields.io/badge/Chrome_Web_Store-Install-4285F4?style=flat-square&logo=googlechrome&logoColor=white)](https://chromewebstore.google.com/detail/snipwise)
[![License](https://img.shields.io/badge/license-MIT-7c3aed?style=flat-square)](LICENSE)
[![Manifest](https://img.shields.io/badge/manifest-v3-a78bfa?style=flat-square)]()
[![Version](https://img.shields.io/badge/version-1.0.0-c4b5fd?style=flat-square)]()

---

## Features

### 4 Capture Modes

| Mode | Description |
|------|-------------|
| 📷 **Visible Area** | Captures exactly what's on screen right now |
| 📄 **Full Page** | Scrolls and stitches the entire page automatically |
| ✂ **Crop Region** | Drag to select any area of the page |
| 🖨 **Save as PDF** | Captures full page and exports directly to PDF |

### 10+ Annotation Tools

After capture, a full editor opens in a new tab:

- **✏ Pen** — freehand drawing
- **↗ Arrow** — clean filled arrowhead, shaft stops before tip
- **─ Line** — straight line
- **○ Circle** — ellipse fitted to bounding box
- **T Text** — click to place, type, Enter to commit
- **① Step Markers** — auto-numbered circles for tutorials, resets on clear
- **💬 Callout Bubble** — typed text in a speech bubble with tail
- **⬛ Blur / Redact** — pixelate sensitive information
- **✂ Crop Canvas** — trim the image after capture
- **😀 Emoji Stamp** — 30 common emojis, click to stamp

All tools support **7 colors** and **custom stroke sizes**. **50-level undo**. Full keyboard shortcuts.

### Export Options

- **⬇ Download PNG** — full resolution, lossless
- **📋 Copy Image** — paste directly into Slack, email, Figma, WhatsApp
- **🖨 Save PDF** — proper PDF file sized to match your capture (via bundled jsPDF)

---

## Installation

### From Chrome Web Store
[![Install from Chrome Web Store](https://img.shields.io/badge/Available_on-Chrome_Web_Store-4285F4?style=flat-square&logo=googlechrome)](https://chromewebstore.google.com/detail/snipwise)

### Developer Mode (Local)

```bash
git clone https://github.com/AdnanTemur/snipwise.git
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
        └── Save as PDF ────→ Same as Full Page
                            Routes to pdf.html instead of editor
                            jsPDF converts canvas → .pdf download → tab closes
```

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
├── popup.html          # Mode selector UI — flat violet dark theme
├── popup.js            # Mode routing, injection guard, theme
├── background.js       # Service worker — captures, storage, tab routing
├── content.js          # Page-level — full page stitch, SVG crop overlay
├── editor.html         # Annotation editor UI — full tab
├── editor.js           # All drawing tools, undo, export
├── pdf.html            # Silent PDF converter page
├── pdf.js              # Reads capture → jsPDF → download → self-close
├── jspdf.min.js        # Bundled locally (no CDN, no CSP issues)
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
| `P` | Pen |
| `A` | Arrow |
| `L` | Line |
| `C` | Circle |
| `T` | Text |
| `S` | Step Marker |
| `O` | Callout Bubble |
| `B` | Blur / Redact |
| `E` | Emoji Stamp |
| `X` | Crop Canvas |
| `Ctrl+Z` | Undo |
| `Ctrl+S` | Download PNG |
| `Ctrl+C` | Copy Image |

---

## Permissions

| Permission | Why |
|------------|-----|
| `activeTab` | Capture a screenshot of the current tab |
| `scripting` | Inject crop overlay and full-page scroll capture into the page |
| `tabs` | Open annotation editor and PDF exporter in new tabs |
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

Full privacy policy: [https://adnantemur.github.io/snipwise/privacy](https://adnantemur.github.io/snipwise/privacy)

---

## Modifying

### Change the color theme

All colors are CSS variables at the top of `popup.html` and `editor.html`:

```css
:root {
  --accent:  #a78bfa;   /* primary violet */
  --accent2: #7c3aed;   /* deeper violet */
  --bg:      #0a080f;   /* background */
  --surface: #16121f;   /* card surface */
}
```

### Add a new annotation tool

1. Add a button to the toolbar in `editor.html`
2. Add the tool ID to `toolMap` in `editor.js`
3. Handle it in the `mousedown` / `mousemove` / `mouseup` listeners
4. Add a keyboard shortcut to the `sc` object at the bottom

### Change the test server for PDF / capture

Full page capture uses only browser APIs — no external server involved. PDF conversion uses bundled jsPDF with no network calls.

---

## Contributing

Pull requests welcome. A few things to keep in mind:

- **No build tooling** — keep it plain HTML/CSS/JS, loadable directly as unpacked
- **No external libraries at runtime** — jsPDF is bundled, nothing else loads remotely
- **No host permissions** — the extension intentionally has none; keep it that way
- Test on both Chrome and Brave before submitting

---

## Related

- [SwiftCheck](https://github.com/AdnanTemur/swiftcheck) — Internet speed test in MB/s, also built by the same developer

---

## License

MIT — do whatever you want, attribution appreciated.

---

## Credits

- PDF export: [jsPDF](https://github.com/parallax/jsPDF) — bundled locally
- Fonts: [Inter](https://fonts.google.com/specimen/Inter), [JetBrains Mono](https://fonts.google.com/specimen/JetBrains+Mono) via Google Fonts
- Built by [Adnan Temur Barcha](https://github.com/AdnanTemur) — Gilgit-Baltistan, Pakistan