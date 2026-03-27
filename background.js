"use strict";

const background = {}; // dedup state for captureReady

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  // ── Content script: needs a tab screenshot during scroll-stitch ───────────
  if (msg.action === "captureTab") {
    chrome.tabs.captureVisibleTab(
      null,
      { format: "png", quality: 100 },
      (dataUrl) => {
        sendResponse(dataUrl);
      },
    );
    return true;
  }

  // ── Popup: visible area capture ───────────────────────────────────────────
  // Write storage first, open editor only after write is confirmed — no race.
  if (msg.action === "captureVisible") {
    chrome.tabs.captureVisibleTab(
      null,
      { format: "png", quality: 100 },
      (dataUrl) => {
        if (chrome.runtime.lastError || !dataUrl) {
          console.error("captureVisible failed:", chrome.runtime.lastError);
          return;
        }
        const payload = {
          dataUrl,
          title: msg.title || "Screenshot",
          mode: msg.mode || "screenshot",
          ts: Date.now(),
        };
        chrome.storage.local.set({ pendingCapture: payload }, () => {
          chrome.tabs.create({ url: chrome.runtime.getURL("editor.html") });
        });
      },
    );
    return true;
  }

  // ── Content script: full page / crop capture complete ─────────────────────
  // Dedup guard: ignore duplicate captureReady messages arriving within 2s.
  // Caused by multiple content script listeners stacking up on re-injection.
  if (msg.action === "captureReady") {
    const now = Date.now();
    if (background._lastCaptureTs && now - background._lastCaptureTs < 2000) {
      console.log("Snipwise: duplicate captureReady ignored");
      return;
    }
    background._lastCaptureTs = now;

    const mode = msg.mode || "screenshot";
    const payload = {
      dataUrl: msg.dataUrl,
      title: msg.title || "Capture",
      mode,
      ts: now,
    };
    chrome.storage.local.set({ pendingCapture: payload }, () => {
      if (mode === "pdf") {
        chrome.tabs.create({ url: chrome.runtime.getURL("pdf.html") });
      } else {
        chrome.tabs.create({ url: chrome.runtime.getURL("editor.html") });
      }
    });
  }
});
