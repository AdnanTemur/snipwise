"use strict";

// Hard guard — if already injected, do nothing. Prevents duplicate listeners
// from multiple injectContentScript calls stacking up and firing multiple times.
if (window.__snipwiseLoaded) {
  // Already running — swallow silently
} else {
  window.__snipwiseLoaded = true;

  chrome.runtime.onMessage.addListener((msg) => {
    if (msg.action === "fullPage") fullPageCapture("screenshot");
    if (msg.action === "crop") startCrop();
    if (msg.action === "pdf") fullPageCapture("pdf");
  });
}

function send(dataUrl, mode = "screenshot") {
  chrome.runtime.sendMessage({
    action: "captureReady",
    dataUrl,
    title: document.title,
    url: location.href,
    mode,
  });
}

function captureTab() {
  return new Promise((res) =>
    chrome.runtime.sendMessage({ action: "captureTab" }, res),
  );
}

function delay(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

function loadImg(src) {
  return new Promise((res, rej) => {
    const i = new Image();
    i.onload = () => res(i);
    i.onerror = rej;
    i.src = src;
  });
}

// ── Full page capture ─────────────────────────────────────────────────────────
//
// Approach:
//  1. Scroll to top, measure true document dimensions
//  2. Find & hide fixed/sticky elements (they repeat on every scroll strip)
//  3. Capture fixed elements once from the top position for compositing later
//  4. Scroll through the page in viewport-height steps
//     - Each step: scroll, wait for paint, capture, draw ONLY the new pixels
//     - "New pixels" = pixels from scrollY to scrollY+viewportH, clipped to totalH
//     - Last strip is clipped to exactly remaining height — no repeat
//  5. Restore fixed elements
//  6. Composite fixed elements at top and bottom of the final canvas

async function fullPageCapture(mode = "screenshot") {
  const dpr = window.devicePixelRatio || 1;
  const vw = window.innerWidth;
  const vh = window.innerHeight;

  // Scroll to top first so measurements are consistent
  window.scrollTo(0, 0);
  await delay(200);

  const totalH = Math.max(
    document.documentElement.scrollHeight,
    document.body.scrollHeight,
    document.documentElement.offsetHeight,
  );
  const totalW = Math.max(
    document.documentElement.scrollWidth,
    document.body.scrollWidth,
  );

  // ── 1. Capture fixed/sticky elements at scroll=0 ───────────────────────────
  const fixedEls = [];
  document.querySelectorAll("*").forEach((el) => {
    const pos = window.getComputedStyle(el).position;
    if (pos !== "fixed" && pos !== "sticky") return;
    const r = el.getBoundingClientRect();
    if (r.width < 2 || r.height < 2) return;
    fixedEls.push({
      el,
      r,
      origVis: el.style.visibility,
      origDisp: el.style.display,
    });
  });

  // Capture fixed elements while they're still visible
  let fixedShot = null;
  if (fixedEls.length > 0) {
    fixedShot = await captureTab();
  }

  // ── 2. Hide fixed/sticky elements ─────────────────────────────────────────
  fixedEls.forEach(({ el }) =>
    el.style.setProperty("visibility", "hidden", "important"),
  );
  await delay(60);

  // ── 3. Build final canvas ──────────────────────────────────────────────────
  const canvas = document.createElement("canvas");
  canvas.width = totalW * dpr;
  canvas.height = totalH * dpr;
  const ctx = canvas.getContext("2d");

  // ── 4. Scroll strips ───────────────────────────────────────────────────────
  // KEY FIX: read window.scrollY AFTER scrollTo — the browser clamps scrolling
  // near the bottom, so window.scrollY tells us where we actually are.
  // If actualY == lastActualY, the browser couldn't scroll further — stop.

  let targetY = 0;
  let lastActualY = -1;

  while (targetY < totalH) {
    window.scrollTo(0, targetY);
    await delay(160);

    const actualY = Math.round(window.scrollY);

    // Browser didn't move — we're at the bottom. Stop before duplicating.
    if (actualY === lastActualY) break;
    lastActualY = actualY;

    const shot = await captureTab();
    const img = await loadImg(shot);

    // Only draw pixels from actualY to min(actualY+vh, totalH)
    const stripBottom = Math.min(actualY + vh, totalH);
    const stripH = stripBottom - actualY;
    if (stripH <= 0) break;

    ctx.drawImage(
      img,
      0,
      0, // src: top of screenshot = actualY in document
      vw * dpr,
      stripH * dpr, // src: only the new content rows
      0,
      actualY * dpr, // dest: correct Y on final canvas
      totalW * dpr,
      stripH * dpr,
    );

    targetY = actualY + vh;
  }

  // ── 5. Restore fixed elements ──────────────────────────────────────────────
  fixedEls.forEach(({ el, origVis }) => (el.style.visibility = origVis));
  window.scrollTo(0, 0);
  await delay(60);

  // ── 6. Composite fixed elements ────────────────────────────────────────────
  if (fixedShot && fixedEls.length > 0) {
    const fixedImg = await loadImg(fixedShot);
    for (const { r } of fixedEls) {
      // Classify: is this a bottom-anchored element?
      const isBottomAnchored = r.top > vh * 0.55;

      // Where to place it on the final canvas
      const destY = isBottomAnchored
        ? totalH - vh + r.top // bottom-fixed: place at bottom of document
        : r.top; // top-fixed: place at top of document

      ctx.drawImage(
        fixedImg,
        r.left * dpr,
        r.top * dpr,
        r.width * dpr,
        r.height * dpr,
        r.left * dpr,
        destY * dpr,
        r.width * dpr,
        r.height * dpr,
      );
    }
  }

  send(canvas.toDataURL("image/png"), mode);
}

// ── Crop overlay — SVG-based for clear selection rectangle ────────────────────
function startCrop() {
  document.getElementById("__snipwise_overlay")?.remove();

  const W = window.innerWidth,
    H = window.innerHeight;

  // Use SVG so we can cut a clear hole in the dark overlay
  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  svg.id = "__snipwise_overlay";
  svg.setAttribute("width", W);
  svg.setAttribute("height", H);
  Object.assign(svg.style, {
    position: "fixed",
    inset: "0",
    zIndex: "2147483647",
    cursor: "crosshair",
    pointerEvents: "all",
  });

  // Defs: clipPath cuts a hole for the selection
  svg.innerHTML = `
    <defs>
      <mask id="snip_mask">
        <rect width="${W}" height="${H}" fill="white"/>
        <rect id="snip_hole" x="0" y="0" width="0" height="0" fill="black"/>
      </mask>
    </defs>
    <rect width="${W}" height="${H}" fill="rgba(0,0,0,0.48)" mask="url(#snip_mask)"/>
    <rect id="snip_border" x="0" y="0" width="0" height="0"
          fill="none" stroke="#a78bfa" stroke-width="2"
          stroke-dasharray="6 3"/>
    <rect id="snip_handles_tl" x="0" y="0" width="8" height="8" fill="#a78bfa" rx="1"/>
    <rect id="snip_handles_tr" x="0" y="0" width="8" height="8" fill="#a78bfa" rx="1"/>
    <rect id="snip_handles_bl" x="0" y="0" width="8" height="8" fill="#a78bfa" rx="1"/>
    <rect id="snip_handles_br" x="0" y="0" width="8" height="8" fill="#a78bfa" rx="1"/>
  `;
  document.body.appendChild(svg);

  const hole = svg.getElementById("snip_hole");
  const border = svg.getElementById("snip_border");
  const htl = svg.getElementById("snip_handles_tl");
  const htr = svg.getElementById("snip_handles_tr");
  const hbl = svg.getElementById("snip_handles_bl");
  const hbr = svg.getElementById("snip_handles_br");

  const tip = document.createElement("div");
  Object.assign(tip.style, {
    position: "fixed",
    top: "14px",
    left: "50%",
    transform: "translateX(-50%)",
    background: "#1e1829",
    color: "#c4b5fd",
    padding: "7px 14px",
    borderRadius: "6px",
    fontSize: "12px",
    fontFamily: "Inter,sans-serif",
    border: "1px solid #4c3d6e",
    pointerEvents: "none",
    zIndex: "2147483648",
    whiteSpace: "nowrap",
  });
  tip.textContent = "Drag to select area · Esc to cancel";
  document.body.appendChild(tip);

  let sx,
    sy,
    dragging = false;

  function updateRect(x, y, w, h) {
    [hole, border].forEach((el) => {
      el.setAttribute("x", x);
      el.setAttribute("y", y);
      el.setAttribute("width", w);
      el.setAttribute("height", h);
    });
    // Corner handles
    htl.setAttribute("x", x - 4);
    htl.setAttribute("y", y - 4);
    htr.setAttribute("x", x + w - 4);
    htr.setAttribute("y", y - 4);
    hbl.setAttribute("x", x - 4);
    hbl.setAttribute("y", y + h - 4);
    hbr.setAttribute("x", x + w - 4);
    hbr.setAttribute("y", y + h - 4);
  }

  svg.addEventListener("mousedown", (e) => {
    e.preventDefault();
    sx = e.clientX;
    sy = e.clientY;
    dragging = true;
    updateRect(sx, sy, 0, 0);
  });

  svg.addEventListener("mousemove", (e) => {
    if (!dragging) return;
    const x = Math.min(e.clientX, sx),
      y = Math.min(e.clientY, sy);
    const w = Math.abs(e.clientX - sx),
      h = Math.abs(e.clientY - sy);
    updateRect(x, y, w, h);
    tip.textContent = `${Math.round(w)} × ${Math.round(h)}px · Release to capture`;
  });

  svg.addEventListener("mouseup", async (e) => {
    if (!dragging) return;
    dragging = false;
    const x = Math.min(e.clientX, sx),
      y = Math.min(e.clientY, sy);
    const w = Math.abs(e.clientX - sx),
      h = Math.abs(e.clientY - sy);
    svg.remove();
    tip.remove();
    if (w < 8 || h < 8) return;
    await delay(40);
    const shot = await captureTab();
    const img = await loadImg(shot);
    const dpr = window.devicePixelRatio || 1;
    const c = document.createElement("canvas");
    c.width = w * dpr;
    c.height = h * dpr;
    c.getContext("2d").drawImage(
      img,
      x * dpr,
      y * dpr,
      w * dpr,
      h * dpr,
      0,
      0,
      w * dpr,
      h * dpr,
    );
    send(c.toDataURL("image/png"));
  });

  document.addEventListener(
    "keydown",
    (e) => {
      if (e.key === "Escape") {
        svg.remove();
        tip.remove();
      }
    },
    { once: true },
  );
}