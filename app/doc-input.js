// Document inputs for custom standards: URL fetch (best-effort) and PDF
// upload (client-side pdf.js extraction). Both fill the customText box —
// nothing ever leaves the browser.

async function fetchStandardUrl() {
  const url = document.getElementById("customUrl").value.trim();
  if (!url) { logLine("Enter a URL to fetch.", "bad"); return; }
  try {
    const res = await fetch(url);
    if (!res.ok) throw new Error("HTTP " + res.status);
    let text = await res.text();
    if ((res.headers.get("content-type") || "").includes("html") || /^\s*</.test(text)) {
      const doc = new DOMParser().parseFromString(text, "text/html");
      doc.querySelectorAll("script,style,nav,header,footer").forEach((n) => n.remove());
      text = doc.body?.innerText ?? "";
    }
    text = text.trim();
    if (!text) throw new Error("no extractable text");
    document.getElementById("customText").value = text;
    logLine(`Fetched ${text.length} chars from URL into the text box — review it, then Add standard.`, "ok");
  } catch (e) {
    logLine(`URL fetch FAILED (${e.message}) — most standards sites block cross-origin reads or are paywalled. Paste the text instead.`, "bad");
  }
}

async function extractPdf(file) {
  const pdfjs = await import("./vendor/pdf.min.mjs");
  pdfjs.GlobalWorkerOptions.workerSrc = "vendor/pdf.worker.min.mjs";
  const pdf = await pdfjs.getDocument({ data: await file.arrayBuffer() }).promise;
  const pages = [];
  for (let p = 1; p <= pdf.numPages; p++) {
    const content = await (await pdf.getPage(p)).getTextContent();
    pages.push(content.items.map((i) => i.str).join(" "));
  }
  return pages.join("\n\n").trim();
}

async function onPdfChosen(ev) {
  const file = ev.target.files[0];
  if (!file) return;
  logLine(`Extracting text from ${file.name} (${(file.size / 1e6).toFixed(1)} MB) — stays in your browser…`, "info");
  try {
    const text = await extractPdf(file);
    if (!text) throw new Error("no extractable text (scanned/image-only PDF?)");
    document.getElementById("customText").value = text;
    if (!document.getElementById("customName").value.trim()) {
      document.getElementById("customName").value = file.name.replace(/\.pdf$/i, "");
    }
    logLine(`Extracted ${text.length} chars from ${file.name} — review it, then Add standard.`, "ok");
  } catch (e) {
    logLine(`PDF extraction FAILED: ${e.message}. Paste the text instead.`, "bad");
  } finally {
    ev.target.value = "";
  }
}

document.getElementById("fetchUrlBtn").onclick = fetchStandardUrl;
document.getElementById("pdfFile").onchange = onPdfChosen;
