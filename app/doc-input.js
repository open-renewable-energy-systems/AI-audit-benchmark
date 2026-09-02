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

// Documents beyond this size skip the textarea (rendering ~1MB there
// freezes the page) and are held in memory until Add standard.
const TEXTAREA_LIMIT = 50000;
let pendingDoc = null; // {name, text} from an uploaded file

function acceptDocText(name, text) {
  const box = document.getElementById("customText");
  if (!document.getElementById("customName").value.trim()) {
    document.getElementById("customName").value = name.replace(/\.(pdf|txt|md)$/i, "");
  }
  if (text.length > TEXTAREA_LIMIT) {
    pendingDoc = { name, text };
    box.value = "";
    box.placeholder = `${name} loaded (${text.length.toLocaleString()} chars, held in memory — too large to display).`;
    logLine(`Loaded ${text.length.toLocaleString()} chars from ${name}. Note: audits use the first ${MAX_DOC_CHARS.toLocaleString()} chars.`, text.length > MAX_DOC_CHARS ? "warn" : "ok");
  } else {
    pendingDoc = null;
    box.value = text;
    logLine(`Loaded ${text.length.toLocaleString()} chars from ${name}.`, "ok");
  }
}

async function onPdfChosen(ev) {
  const file = ev.target.files[0];
  if (!file) return;
  const isText = /\.(txt|md)$/i.test(file.name);
  logLine(`Reading ${file.name} (${(file.size / 1e6).toFixed(1)} MB) — stays in your browser…`, "info");
  try {
    const text = (isText ? await file.text() : await extractPdf(file)).trim();
    if (!text) throw new Error(isText ? "file is empty" : "no extractable text (scanned/image-only PDF?)");
    acceptDocText(file.name, text);
    addCustomStandard(); // an upload is explicit intent — no second click needed
  } catch (e) {
    logLine(`File read FAILED: ${e.message}. Paste the text instead.`, "bad");
  } finally {
    ev.target.value = "";
  }
}

document.getElementById("fetchUrlBtn").onclick = fetchStandardUrl;
document.getElementById("pdfFile").onchange = onPdfChosen;
