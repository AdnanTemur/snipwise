"use strict";

const $ = (id) => document.getElementById(id);

// ── Theme ─────────────────────────────────────────────────────────────────────
function applyTheme(light) {
  document.documentElement.classList.toggle("light", light);
}
chrome.storage.local.get(["theme"], (r) => applyTheme(r.theme === "light"));
$("themeBtn").addEventListener("click", () => {
  const light = !document.documentElement.classList.contains("light");
  applyTheme(light);
  chrome.storage.local.set({ theme: light ? "light" : "dark" });
});

// ── Last capture ──────────────────────────────────────────────────────────────
chrome.storage.local.get(["lastCapture"], (r) => {
  if (!r.lastCapture) return;
  $("lastInfo").textContent = `Last capture ${fmtAge(r.lastCapture.ts)}`;
  $("lastView").style.display = "block";
  $("lastView").addEventListener("click", () => {
    chrome.tabs.create({ url: chrome.runtime.getURL("editor.html") });
  });
});

function fmtAge(ts) {
  const s = Math.floor((Date.now() - ts) / 1000);
  if (s < 60) return `${s}s ago`;
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  return `${Math.floor(s / 3600)}h ago`;
}

// ── Helpers ───────────────────────────────────────────────────────────────────
async function getActiveTab() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  return tab;
}

function isInjectableTab(tab) {
  if (!tab || !tab.url) return false;
  return tab.url.startsWith("http://") || tab.url.startsWith("https://");
}

async function injectContentScript(tabId) {
  // Check if content script is already loaded before injecting
  // This prevents stacked listeners from multiple rapid clicks
  try {
    const results = await chrome.scripting.executeScript({
      target: { tabId },
      func: () => window.__snipwiseLoaded === true,
    });
    if (results && results[0] && results[0].result === true) {
      return; // already injected — skip
    }
  } catch (_) {}
  await chrome.scripting.executeScript({
    target: { tabId },
    files: ["content.js"],
  });
}

// ── Visible area ──────────────────────────────────────────────────────────────
// FIX: Don't pre-write pendingCapture. Just tell background to capture+store+open.
// Background does all three atomically in the right order.
$("modeVisible").addEventListener("click", async () => {
  const tab = await getActiveTab();
  chrome.runtime.sendMessage({
    action: "captureVisible",
    title: tab.title,
    mode: "screenshot",
  });
  window.close();
});

// ── Full page ─────────────────────────────────────────────────────────────────
$("modeFull").addEventListener("click", async () => {
  const tab = await getActiveTab();
  if (!isInjectableTab(tab)) {
    alert(
      "Snipwise cannot capture this page.\nNavigate to a regular website first.",
    );
    return;
  }
  await injectContentScript(tab.id);
  chrome.tabs.sendMessage(tab.id, { action: "fullPage" });
  window.close();
});

// ── Crop ──────────────────────────────────────────────────────────────────────
$("modeCrop").addEventListener("click", async () => {
  const tab = await getActiveTab();
  if (!isInjectableTab(tab)) {
    alert(
      "Snipwise cannot capture this page.\nNavigate to a regular website first.",
    );
    return;
  }
  await injectContentScript(tab.id);
  chrome.tabs.sendMessage(tab.id, { action: "crop" });
  window.close();
});

// ── PDF ───────────────────────────────────────────────────────────────────────
// FIX: PDF mode uses fullPage capture but routes to pdf.html not editor.html
// The editor's own "Save PDF" button handles in-editor PDF — this is the
// standalone "capture full page → direct PDF" flow with no editor stop.
$("modePdf").addEventListener("click", async () => {
  const tab = await getActiveTab();
  if (!isInjectableTab(tab)) {
    alert(
      "Snipwise cannot capture this page.\nNavigate to a regular website first.",
    );
    return;
  }
  await injectContentScript(tab.id);
  chrome.tabs.sendMessage(tab.id, { action: "pdf" });
  window.close();
});
