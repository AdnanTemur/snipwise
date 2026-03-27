"use strict";

// ── Theme ─────────────────────────────────────────────────────────────────────
function applyTheme(light) {
  document.documentElement.classList.toggle("light", light);
}
chrome.storage.local.get(["theme"], (r) => applyTheme(r.theme === "light"));
document.getElementById("themeBtn").addEventListener("click", () => {
  const light = !document.documentElement.classList.contains("light");
  applyTheme(light);
  chrome.storage.local.set({ theme: light ? "light" : "dark" });
});

// ── Canvas setup ──────────────────────────────────────────────────────────────
const baseCanvas = document.getElementById("baseCanvas");
const drawCanvas = document.getElementById("drawCanvas");
const baseCtx = baseCanvas.getContext("2d");
const drawCtx = drawCanvas.getContext("2d", { willReadFrequently: true });

// ── State ─────────────────────────────────────────────────────────────────────
const state = {
  tool: "pen",
  color: "#a78bfa",
  strokeSize: 3,
  drawing: false,
  startX: 0,
  startY: 0,
  snapshots: [],
};

// ── Load capture ──────────────────────────────────────────────────────────────
chrome.storage.local.get(["pendingCapture"], (r) => {
  if (!r.pendingCapture) {
    document
      .getElementById("loading")
      .querySelector(".loading-text").textContent = "No capture found.";
    return;
  }
  const { dataUrl, title, ts } = r.pendingCapture;
  const img = new Image();
  img.onload = () => {
    baseCanvas.width = drawCanvas.width = img.width;
    baseCanvas.height = drawCanvas.height = img.height;
    baseCtx.drawImage(img, 0, 0);
    pushUndo();

    document.getElementById("loading").style.display = "none";
    document.getElementById("toolbar").style.display = "flex";
    document.getElementById("canvasWrap").style.display = "flex";
    document.getElementById("statusbar").style.display = "flex";
    document.getElementById("sizeText").textContent =
      `${img.width} × ${img.height}px`;
    document.getElementById("statusText").textContent =
      `Captured: ${title || "Untitled"}`;

    chrome.storage.local.set({ lastCapture: { editorUrl: location.href, ts } });
    chrome.storage.local.remove("pendingCapture");
  };
  img.src = dataUrl;
});

// ── Tool buttons ──────────────────────────────────────────────────────────────
const toolMap = {
  toolPen: "pen",
  toolArrow: "arrow",
  toolLine: "line",
  toolRect: "rect",
  toolCircle: "circle",
  toolText: "text",
  toolHighlight: "highlight",
  toolBlur: "blur",
  toolStep: "step",
  toolCallout: "callout",
  toolEmoji: "emoji",
  toolCropCanvas: "cropcanvas",
};
Object.keys(toolMap).forEach((id) => {
  document.getElementById(id).addEventListener("click", () => {
    Object.keys(toolMap).forEach((t) =>
      document.getElementById(t).classList.remove("active"),
    );
    document.getElementById(id).classList.add("active");
    state.tool = toolMap[id];
    drawCanvas.style.cursor = state.tool === "text" ? "text" : "crosshair";
    setStatus(`Tool: ${state.tool}`);
  });
});

// ── Colors ────────────────────────────────────────────────────────────────────
document.getElementById("colorPicker").addEventListener("click", (e) => {
  const s = e.target.closest(".color-swatch");
  if (!s) return;
  document
    .querySelectorAll(".color-swatch")
    .forEach((x) => x.classList.remove("active"));
  s.classList.add("active");
  state.color = s.dataset.color;
});

document.getElementById("strokeSize").addEventListener("input", (e) => {
  state.strokeSize = parseInt(e.target.value) || 3;
});

// ── Undo ──────────────────────────────────────────────────────────────────────
function pushUndo() {
  if (!drawCanvas.width || !drawCanvas.height) return;
  state.snapshots.push(
    drawCtx.getImageData(0, 0, drawCanvas.width, drawCanvas.height),
  );
  if (state.snapshots.length > 50) state.snapshots.shift();
}

document.getElementById("toolUndo").addEventListener("click", () => {
  if (state.snapshots.length <= 1) return;
  state.snapshots.pop();
  drawCtx.putImageData(state.snapshots[state.snapshots.length - 1], 0, 0);
  setStatus("Undo");
});

document.getElementById("toolClear").addEventListener("click", () => {
  drawCtx.clearRect(0, 0, drawCanvas.width, drawCanvas.height);
  state.snapshots = [];
  stepCounter = 1; // reset step numbering
  pushUndo();
  setStatus("Cleared");
});

// ── Drawing ───────────────────────────────────────────────────────────────────
let lastSnap = null;

function getPos(e) {
  const r = drawCanvas.getBoundingClientRect();
  return {
    x: (e.clientX - r.left) * (drawCanvas.width / r.width),
    y: (e.clientY - r.top) * (drawCanvas.height / r.height),
  };
}

drawCanvas.addEventListener("mousedown", (e) => {
  if (e.button !== 0) return;
  const { x, y } = getPos(e);

  // Click-based tools (no drag)
  if (state.tool === "text") {
    addTextInput(x, y, e.clientX, e.clientY);
    return;
  }
  if (state.tool === "step") {
    drawStep(x, y);
    return;
  }
  if (state.tool === "callout") {
    addCallout(x, y, e.clientX, e.clientY);
    return;
  }
  if (state.tool === "emoji") {
    if (state.pendingEmoji) {
      stampEmoji(x, y);
    } else showEmojiPicker(e.clientX, e.clientY);
    return;
  }
  if (state.tool === "cropcanvas") {
    startCanvasCrop();
    return;
  }

  state.drawing = true;
  state.startX = x;
  state.startY = y;
  lastSnap = drawCtx.getImageData(0, 0, drawCanvas.width, drawCanvas.height);
  drawCtx.beginPath();
  drawCtx.moveTo(x, y);
});

drawCanvas.addEventListener("mousemove", (e) => {
  if (!state.drawing) return;
  const { x, y } = getPos(e);

  if (state.tool === "pen") {
    setupCtx(drawCtx, state.color, state.strokeSize, 1);
    drawCtx.lineTo(x, y);
    drawCtx.stroke();
    return;
  }
  if (state.tool === "highlight") {
    setupCtx(drawCtx, state.color, Math.max(state.strokeSize * 4, 16), 0.35);
    drawCtx.lineTo(x, y);
    drawCtx.stroke();
    return;
  }

  // Shape preview — restore snapshot then draw preview
  drawCtx.putImageData(lastSnap, 0, 0);
  if (state.tool === "arrow") drawArrow(state.startX, state.startY, x, y);
  if (state.tool === "line") drawLine(state.startX, state.startY, x, y);
  if (state.tool === "rect") drawRect(state.startX, state.startY, x, y);
  if (state.tool === "circle") drawCircle(state.startX, state.startY, x, y);
  if (state.tool === "blur") blurPreview(state.startX, state.startY, x, y);
});

drawCanvas.addEventListener("mouseup", (e) => {
  if (!state.drawing) return;
  state.drawing = false;
  const { x, y } = getPos(e);
  if (state.tool === "blur") blurCommit(state.startX, state.startY, x, y);
  // Line and circle are already drawn in preview — just push undo
  pushUndo();
  drawCtx.beginPath();
});

drawCanvas.addEventListener("mouseleave", () => {
  state.drawing = false;
});

// ── Draw helpers ──────────────────────────────────────────────────────────────
function setupCtx(ctx, color, width, alpha) {
  ctx.strokeStyle = color;
  ctx.fillStyle = color;
  ctx.lineWidth = width;
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  ctx.globalAlpha = alpha;
}

function drawArrow(x1, y1, x2, y2) {
  const angle = Math.atan2(y2 - y1, x2 - x1);
  const headLen = Math.max(14, state.strokeSize * 5);

  // Shaft ends before the tip so it doesn't poke through arrowhead
  const shaftEndX = x2 - headLen * 0.75 * Math.cos(angle);
  const shaftEndY = y2 - headLen * 0.75 * Math.sin(angle);

  // Draw shaft
  drawCtx.globalAlpha = 1;
  drawCtx.strokeStyle = state.color;
  drawCtx.lineWidth = state.strokeSize;
  drawCtx.lineCap = "round";
  drawCtx.beginPath();
  drawCtx.moveTo(x1, y1);
  drawCtx.lineTo(shaftEndX, shaftEndY);
  drawCtx.stroke();

  // Draw clean filled triangle arrowhead
  drawCtx.beginPath();
  drawCtx.moveTo(x2, y2);
  drawCtx.lineTo(
    x2 - headLen * Math.cos(angle - Math.PI / 7),
    y2 - headLen * Math.sin(angle - Math.PI / 7),
  );
  drawCtx.lineTo(
    x2 - headLen * Math.cos(angle + Math.PI / 7),
    y2 - headLen * Math.sin(angle + Math.PI / 7),
  );
  drawCtx.closePath();
  drawCtx.fillStyle = state.color;
  drawCtx.globalAlpha = 1;
  drawCtx.fill();
}

function drawRect(x1, y1, x2, y2) {
  setupCtx(drawCtx, state.color, state.strokeSize, 1);
  drawCtx.beginPath();
  drawCtx.strokeRect(x1, y1, x2 - x1, y2 - y1);
}

// ── Line ──────────────────────────────────────────────────────────────────────
function drawLine(x1, y1, x2, y2) {
  drawCtx.globalAlpha = 1;
  drawCtx.strokeStyle = state.color;
  drawCtx.lineWidth = state.strokeSize;
  drawCtx.lineCap = "round";
  drawCtx.beginPath();
  drawCtx.moveTo(x1, y1);
  drawCtx.lineTo(x2, y2);
  drawCtx.stroke();
}

// ── Circle ────────────────────────────────────────────────────────────────────
function drawCircle(x1, y1, x2, y2) {
  const cx = (x1 + x2) / 2,
    cy = (y1 + y2) / 2;
  const rx = Math.abs(x2 - x1) / 2,
    ry = Math.abs(y2 - y1) / 2;
  drawCtx.globalAlpha = 1;
  drawCtx.strokeStyle = state.color;
  drawCtx.lineWidth = state.strokeSize;
  drawCtx.beginPath();
  drawCtx.ellipse(cx, cy, rx, ry, 0, 0, Math.PI * 2);
  drawCtx.stroke();
}

// ── Step marker ①②③ ──────────────────────────────────────────────────────────
let stepCounter = 1;
function drawStep(x, y) {
  const r = Math.max(16, state.strokeSize * 5);
  const num = stepCounter++;
  drawCtx.globalAlpha = 1;
  // Filled circle
  drawCtx.beginPath();
  drawCtx.arc(x, y, r, 0, Math.PI * 2);
  drawCtx.fillStyle = state.color;
  drawCtx.fill();
  // Number
  drawCtx.fillStyle = "#fff";
  drawCtx.font = `bold ${Math.round(r * 1.1)}px Inter,sans-serif`;
  drawCtx.textAlign = "center";
  drawCtx.textBaseline = "middle";
  drawCtx.fillText(num > 9 ? "9+" : String(num), x, y + 1);
  drawCtx.textAlign = "left";
  drawCtx.textBaseline = "alphabetic";
  pushUndo();
  setStatus(`Step ${num} placed`);
}

// ── Callout bubble ────────────────────────────────────────────────────────────
function addCallout(canvasX, canvasY, clientX, clientY) {
  const container = document.getElementById("canvasContainer");
  const rect = drawCanvas.getBoundingClientRect();
  const sX = rect.width / drawCanvas.width;
  const sY = rect.height / drawCanvas.height;
  const fontSize = Math.max(13, state.strokeSize * 3);
  const pad = fontSize * 0.6;

  const wrap = document.createElement("div");
  Object.assign(wrap.style, {
    position: "absolute",
    left: canvasX * sX + "px",
    top: canvasY * sY - 4 + "px",
    zIndex: "200",
    minWidth: "100px",
  });

  const input = document.createElement("input");
  Object.assign(input.style, {
    background: state.color,
    color: "#fff",
    border: "none",
    borderRadius: "6px",
    fontSize: `${fontSize * Math.min(sX, sY)}px`,
    fontFamily: "Inter,sans-serif",
    fontWeight: "600",
    outline: "none",
    padding: "4px 10px",
    width: "160px",
  });

  wrap.appendChild(input);
  container.appendChild(wrap);
  setTimeout(() => input.focus(), 50);

  let committed = false;
  function commit() {
    if (committed) return;
    committed = true;
    const text = input.value.trim();
    wrap.remove();
    if (!text) return;

    // Measure text
    drawCtx.font = `600 ${fontSize}px Inter,sans-serif`;
    const tw = drawCtx.measureText(text).width;
    const bw = tw + pad * 2,
      bh = fontSize + pad * 2;
    const bx = canvasX - bw / 2,
      by = canvasY - bh - 10;
    const br = 8; // border-radius

    // Bubble background
    drawCtx.globalAlpha = 1;
    drawCtx.fillStyle = state.color;
    drawCtx.beginPath();
    drawCtx.roundRect(bx, by, bw, bh, br);
    drawCtx.fill();

    // Tail triangle pointing down
    drawCtx.beginPath();
    drawCtx.moveTo(canvasX - 8, by + bh);
    drawCtx.lineTo(canvasX + 8, by + bh);
    drawCtx.lineTo(canvasX, by + bh + 10);
    drawCtx.closePath();
    drawCtx.fill();

    // Text
    drawCtx.fillStyle = "#fff";
    drawCtx.fillText(text, bx + pad, by + pad + fontSize * 0.78);
    pushUndo();
    setStatus("Callout added");
  }

  input.addEventListener("keydown", (e) => {
    e.stopPropagation();
    if (e.key === "Enter") commit();
    if (e.key === "Escape") {
      committed = true;
      wrap.remove();
    }
  });
  input.addEventListener("blur", () => setTimeout(commit, 150));
}

// ── Emoji picker + stamp ──────────────────────────────────────────────────────
const EMOJIS = [
  "😀",
  "😂",
  "❤️",
  "👍",
  "👎",
  "🔥",
  "⭐",
  "✅",
  "❌",
  "⚠️",
  "💡",
  "📌",
  "🎯",
  "🚀",
  "💬",
  "🔍",
  "📷",
  "🖊️",
  "✂️",
  "📋",
  "👀",
  "💥",
  "🎉",
  "🤔",
  "😱",
  "👉",
  "☝️",
  "🙌",
  "💪",
  "🛑",
];

let emojiPanel = null;

function showEmojiPicker(clientX, clientY) {
  closeEmojiPanel();
  emojiPanel = document.getElementById("emojiPanel");
  emojiPanel.style.display = "grid";
  emojiPanel.style.left = clientX + "px";
  emojiPanel.style.top = clientY + 8 + "px";
  emojiPanel.innerHTML = "";

  EMOJIS.forEach((em) => {
    const btn = document.createElement("button");
    Object.assign(btn.style, {
      width: "30px",
      height: "30px",
      fontSize: "18px",
      cursor: "pointer",
      background: "transparent",
      border: "1px solid transparent",
      borderRadius: "6px",
    });
    btn.textContent = em;
    btn.addEventListener(
      "mouseenter",
      () => (btn.style.background = "var(--surface2)"),
    );
    btn.addEventListener(
      "mouseleave",
      () => (btn.style.background = "transparent"),
    );
    btn.addEventListener("mousedown", (ev) => {
      ev.preventDefault();
      state.pendingEmoji = em;
      closeEmojiPanel();
      setStatus(`Click canvas to stamp ${em}`);
    });
    emojiPanel.appendChild(btn);
  });

  setTimeout(
    () =>
      document.addEventListener("mousedown", closeEmojiPanel, { once: true }),
    50,
  );
}

function closeEmojiPanel() {
  if (emojiPanel) {
    emojiPanel.style.display = "none";
    emojiPanel.innerHTML = "";
  }
}

function stampEmoji(x, y) {
  if (!state.pendingEmoji) return;
  const size = Math.max(24, state.strokeSize * 8);
  drawCtx.globalAlpha = 1;
  drawCtx.font = `${size}px serif`;
  drawCtx.textBaseline = "middle";
  drawCtx.fillText(state.pendingEmoji, x - size / 2, y);
  drawCtx.textBaseline = "alphabetic";
  state.pendingEmoji = null;
  pushUndo();
  setStatus("Emoji stamped");
}

// ── Crop canvas ───────────────────────────────────────────────────────────────
function startCanvasCrop() {
  setStatus(
    "Drag to select the area to keep · Enter to confirm · Esc to cancel",
  );
  const overlay = document.createElement("div");
  Object.assign(overlay.style, {
    position: "absolute",
    inset: "0",
    zIndex: "500",
    cursor: "crosshair",
    background: "transparent",
  });

  const sel = document.createElement("div");
  Object.assign(sel.style, {
    position: "absolute",
    display: "none",
    border: "2px dashed #a78bfa",
    boxShadow: "0 0 0 9999px rgba(0,0,0,0.5)",
    pointerEvents: "none",
  });
  overlay.appendChild(sel);
  document.getElementById("canvasContainer").appendChild(overlay);

  let sx,
    sy,
    ex,
    ey,
    dragging = false;
  const rect = drawCanvas.getBoundingClientRect();
  const scX = drawCanvas.width / rect.width;
  const scY = drawCanvas.height / rect.height;

  overlay.addEventListener("mousedown", (e) => {
    sx = e.clientX;
    sy = e.clientY;
    dragging = true;
    sel.style.display = "block";
    Object.assign(sel.style, {
      left: sx + "px",
      top: sy + "px",
      width: "0",
      height: "0",
    });
  });

  overlay.addEventListener("mousemove", (e) => {
    if (!dragging) return;
    ex = e.clientX;
    ey = e.clientY;
    const x = Math.min(sx, ex),
      y = Math.min(sy, ey),
      w = Math.abs(ex - sx),
      h = Math.abs(ey - sy);
    Object.assign(sel.style, {
      left: x + "px",
      top: y + "px",
      width: w + "px",
      height: h + "px",
    });
    setStatus(
      `Crop area: ${Math.round(w * scX)} × ${Math.round(h * scY)}px · Enter to apply`,
    );
  });

  overlay.addEventListener("mouseup", () => {
    dragging = false;
  });

  function applyCrop() {
    if (!ex || !ey) {
      overlay.remove();
      return;
    }
    const x = Math.min(sx, ex),
      y = Math.min(sy, ey);
    const w = Math.abs(ex - sx),
      h = Math.abs(ey - sy);
    const r = document
      .getElementById("canvasContainer")
      .getBoundingClientRect();
    // Convert client coords to canvas coords
    const cx = (x - r.left) * scX,
      cy = (y - r.top) * scY;
    const cw = w * scX,
      ch = h * scY;
    if (cw < 10 || ch < 10) {
      overlay.remove();
      return;
    }

    // Create new canvases at cropped size
    const merged = mergedCanvas();
    [baseCanvas, drawCanvas].forEach((c) => {
      c.width = cw;
      c.height = ch;
    });
    baseCtx.drawImage(merged, cx, cy, cw, ch, 0, 0, cw, ch);
    drawCtx.clearRect(0, 0, cw, ch);
    state.snapshots = [];
    pushUndo();
    overlay.remove();
    document.getElementById("sizeText").textContent =
      `${Math.round(cw)} × ${Math.round(ch)}px`;
    setStatus(`Canvas cropped to ${Math.round(cw)} × ${Math.round(ch)}px`);
  }

  document.addEventListener(
    "keydown",
    (e) => {
      if (e.key === "Enter") {
        applyCrop();
      }
      if (e.key === "Escape") {
        overlay.remove();
        setStatus("Crop cancelled");
      }
    },
    { once: true },
  );
}

function blurPreview(x1, y1, x2, y2) {
  const x = Math.min(x1, x2),
    y = Math.min(y1, y2),
    w = Math.abs(x2 - x1),
    h = Math.abs(y2 - y1);
  drawCtx.globalAlpha = 1;
  drawCtx.strokeStyle = "#a78bfa";
  drawCtx.lineWidth = 2;
  drawCtx.setLineDash([6, 3]);
  drawCtx.strokeRect(x, y, w, h);
  drawCtx.setLineDash([]);
}

function blurCommit(x1, y1, x2, y2) {
  const x = Math.min(x1, x2),
    y = Math.min(y1, y2),
    w = Math.abs(x2 - x1),
    h = Math.abs(y2 - y1);
  if (w < 4 || h < 4) return;
  const merged = mergedCanvas();
  const pixel = 12;
  const tmp = document.createElement("canvas");
  tmp.width = Math.max(1, Math.round(w / pixel));
  tmp.height = Math.max(1, Math.round(h / pixel));
  const tCtx = tmp.getContext("2d");
  tCtx.imageSmoothingEnabled = false;
  tCtx.drawImage(merged, x, y, w, h, 0, 0, tmp.width, tmp.height);
  drawCtx.imageSmoothingEnabled = false;
  drawCtx.globalAlpha = 1;
  drawCtx.drawImage(tmp, 0, 0, tmp.width, tmp.height, x, y, w, h);
  drawCtx.imageSmoothingEnabled = true;
}

// ── Text input — fixed focus/blur race condition ───────────────────────────────
function addTextInput(canvasX, canvasY, clientX, clientY) {
  const container = document.getElementById("canvasContainer");
  const rect = drawCanvas.getBoundingClientRect();
  const sX = rect.width / drawCanvas.width;
  const sY = rect.height / drawCanvas.height;
  const fontSize = Math.max(14, state.strokeSize * 4);

  const wrap = document.createElement("div");
  Object.assign(wrap.style, {
    position: "absolute",
    left: canvasX * sX + "px",
    top: canvasY * sY - 4 + "px",
    zIndex: "200",
    minWidth: "120px",
  });

  const input = document.createElement("input");
  Object.assign(input.style, {
    background: "rgba(0,0,0,0.6)",
    border: "none",
    borderBottom: `2px solid ${state.color}`,
    color: state.color,
    fontSize: `${fontSize * Math.min(sX, sY)}px`,
    fontFamily: "Inter,sans-serif",
    fontWeight: "600",
    outline: "none",
    padding: "2px 6px",
    width: "200px",
    borderRadius: "2px",
  });

  wrap.appendChild(input);
  container.appendChild(wrap);

  // Small delay before focusing — prevents immediate blur on mouseup
  setTimeout(() => input.focus(), 50);

  let committed = false;

  function commit() {
    if (committed) return;
    committed = true;
    const text = input.value.trim();
    wrap.remove();
    if (!text) return;
    drawCtx.font = `600 ${fontSize}px Inter,sans-serif`;
    drawCtx.fillStyle = state.color;
    drawCtx.globalAlpha = 1;
    drawCtx.fillText(text, canvasX, canvasY + fontSize * 0.85);
    pushUndo();
    setStatus("Text added");
  }

  input.addEventListener("keydown", (e) => {
    e.stopPropagation();
    if (e.key === "Enter") commit();
    if (e.key === "Escape") {
      committed = true;
      wrap.remove();
    }
  });

  // Only commit on blur if user clicked elsewhere (not just tabbed away momentarily)
  input.addEventListener("blur", () => setTimeout(commit, 150));
}

// ── Merge canvases ────────────────────────────────────────────────────────────
function mergedCanvas() {
  const c = document.createElement("canvas");
  c.width = baseCanvas.width;
  c.height = baseCanvas.height;
  const ctx = c.getContext("2d");
  ctx.drawImage(baseCanvas, 0, 0);
  ctx.drawImage(drawCanvas, 0, 0);
  return c;
}

// ── Save: PNG ─────────────────────────────────────────────────────────────────
document.getElementById("btnDownload").addEventListener("click", () => {
  const merged = mergedCanvas();
  const a = document.createElement("a");
  a.download = `snipwise-${Date.now()}.png`;
  a.href = merged.toDataURL("image/png", 1.0);
  a.click();
  setStatus(`Downloaded PNG ✓ — ${merged.width}×${merged.height}px`);
});

// ── Save: Copy ────────────────────────────────────────────────────────────────
document.getElementById("btnCopy").addEventListener("click", async () => {
  mergedCanvas().toBlob(
    async (blob) => {
      try {
        await navigator.clipboard.write([
          new ClipboardItem({ "image/png": blob }),
        ]);
        setStatus("Copied to clipboard ✓");
      } catch (_) {
        setStatus("Copy failed — use Download instead");
      }
    },
    "image/png",
    1.0,
  );
});

// PDF is handled by the popup's dedicated PDF mode (full page → direct download)

// ── Status ────────────────────────────────────────────────────────────────────
function setStatus(text) {
  document.getElementById("statusText").textContent = text;
}

// ── Keyboard shortcuts ────────────────────────────────────────────────────────
document.addEventListener("keydown", (e) => {
  if (e.target.tagName === "INPUT") return;
  if ((e.ctrlKey || e.metaKey) && e.key === "z") {
    document.getElementById("toolUndo").click();
    return;
  }
  if ((e.ctrlKey || e.metaKey) && e.key === "s") {
    e.preventDefault();
    document.getElementById("btnDownload").click();
    return;
  }
  if ((e.ctrlKey || e.metaKey) && !e.shiftKey && e.key === "c") {
    document.getElementById("btnCopy").click();
    return;
  }
  if (e.ctrlKey || e.metaKey) return;
  const sc = {
    p: "toolPen",
    a: "toolArrow",
    l: "toolLine",
    r: "toolRect",
    c: "toolCircle",
    t: "toolText",
    h: "toolHighlight",
    b: "toolBlur",
    s: "toolStep",
    o: "toolCallout",
    e: "toolEmoji",
    x: "toolCropCanvas",
  };
  if (sc[e.key]) document.getElementById(sc[e.key]).click();
});
