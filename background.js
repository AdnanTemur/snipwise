"use strict";

const background = {};
let pendingCapture = null; // in-memory — no storage quota issues

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  // ── Content script: needs a tab screenshot during scroll-stitch ───────────
  if (msg.action === "captureTab") {
    setTimeout(() => {
      chrome.tabs.captureVisibleTab(
        null,
        { format: "png", quality: 100 },
        (dataUrl) => {
          sendResponse(dataUrl);
        },
      );
    }, 300); // slight delay to ensure capture reflects latest scroll position
    return true;
  }

  // ── Editor/PDF tab requests the capture data ─────────────────────────────
  if (msg.action === "getCaptureData") {
    sendResponse(pendingCapture);
    pendingCapture = null; // clear after handoff
    return;
  }

  // ── Popup: visible area capture ───────────────────────────────────────────
  if (msg.action === "captureVisible") {
    setTimeout(() => {
      chrome.tabs.captureVisibleTab(
        null,
        { format: "png", quality: 100 },
        (dataUrl) => {
          if (chrome.runtime.lastError || !dataUrl) {
            console.error("captureVisible failed:", chrome.runtime.lastError);
            return;
          }
          pendingCapture = {
            dataUrl,
            title: msg.title || "Screenshot",
            url: msg.url || "",
            mode: msg.mode || "screenshot",
            ts: Date.now(),
          };
          chrome.tabs.create({ url: chrome.runtime.getURL("editor.html") });
        },
      );
    }, 300); // slight delay to allow popup to close and capture to update
    return true;
  }

  // ── Content script: full page / crop capture complete ─────────────────────
  if (msg.action === "captureReady") {
    const now = Date.now();
    if (background._lastCaptureTs && now - background._lastCaptureTs < 2000) {
      console.log("Snipwise: duplicate captureReady ignored");
      return;
    }
    background._lastCaptureTs = now;

    const mode = msg.mode || "screenshot";
    pendingCapture = {
      dataUrl: msg.dataUrl,
      title: msg.title || "Capture",
      url: msg.url || "",
      mode,
      ts: now,
    };

    if (mode === "pdf") {
      chrome.tabs.create({ url: chrome.runtime.getURL("pdf.html") });
    } else {
      chrome.tabs.create({ url: chrome.runtime.getURL("editor.html") });
    }
  }
});
