"use strict";

function show(id) {
  document.getElementById(id).style.display = "block";
}
function hide(id) {
  document.getElementById(id).style.display = "none";
}
function msg(text) {
  document.getElementById("msg").textContent = text;
}

async function generatePdf() {
  // Load capture from storage
  const result = await new Promise((res) =>
    chrome.storage.local.get(["pendingCapture"], res),
  );

  const capture = result.pendingCapture;
  if (!capture || !capture.dataUrl) {
    hide("spinner");
    show("err");
    document.getElementById("err").textContent =
      "No capture found. Please try again.";
    return;
  }

  // Clear storage so it doesn't linger
  chrome.storage.local.remove("pendingCapture");

  msg("Building PDF…");

  try {
    const img = await loadImage(capture.dataUrl);
    const pxW = img.naturalWidth;
    const pxH = img.naturalHeight;

    // Convert px → mm (1px = 0.2646mm at 96dpi)
    const mmW = Math.round(pxW * 0.2646);
    const mmH = Math.round(pxH * 0.2646);

    const { jsPDF } = window.jspdf;
    const doc = new jsPDF({
      orientation: pxW >= pxH ? "landscape" : "portrait",
      unit: "mm",
      format: [mmW, mmH],
      compress: true,
    });

    msg("Adding image to PDF…");
    doc.addImage(capture.dataUrl, "PNG", 0, 0, mmW, mmH, undefined, "NONE");

    const filename = `snipwise-${Date.now()}.pdf`;
    msg("Saving…");
    doc.save(filename);

    // Show success
    hide("spinner");
    hide("msg");
    show("done");

    // Auto-close after 2 seconds
    setTimeout(() => window.close(), 2000);
  } catch (e) {
    hide("spinner");
    show("err");
    document.getElementById("err").textContent = `PDF failed: ${e.message}`;
    console.error(e);
  }
}

function loadImage(src) {
  return new Promise((res, rej) => {
    const img = new Image();
    img.onload = () => res(img);
    img.onerror = () => rej(new Error("Image failed to load"));
    img.src = src;
  });
}

// Run immediately when page loads
generatePdf();
