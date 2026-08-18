// "Run audit" panel — calls OpenAI-compatible endpoints (OpenRouter, Ollama)
// directly from the browser with the frozen system prompt from prompts/.
// Keys live only in localStorage; results export in the runner's
// results/{Standard}--{model}--iteration_{n}.json format.

const RUN_STANDARDS = ["IEC 61850", "CIM", "OpenADR 3", "ISO 15118",
  "IEEE 1547", "SunSpec", "IEEE 2030.5"]; // mirrors runner/evaluate_model_knowledge.py
const DEFAULT_STANDARD = "IEEE 2030.5";
function runsPerModel() { return Number(document.getElementById("runsSel").value); }
// Slot defaults and provider presets live in slots.js.

const MAX_DOC_CHARS = 150000; // keep pasted standard text within context limits

let systemPromptTemplate = null;
const runResults = []; // {standard, model, iteration, data}
const customStandards = []; // {name, text} — text = document-fed, else knowledge-only

const CUSTOM_MODEL = "__custom__";

function setModelOptions(i, groups, selected) {
  // groups: [{label, ids}]; keeps a "custom model id…" escape hatch.
  const sel = document.getElementById(`modelsel${i}`);
  sel.innerHTML = groups.map((g) =>
    `<optgroup label="${g.label}">` +
    g.ids.map((id) => `<option value="${id}">${id}</option>`).join("") +
    `</optgroup>`).join("") +
    `<option value="${CUSTOM_MODEL}">custom model id…</option>`;
  syncModelField(i, selected ?? groups[0]?.ids[0] ?? CUSTOM_MODEL);
}

function syncModelField(i, value) {
  const sel = document.getElementById(`modelsel${i}`);
  const input = document.getElementById(`model${i}`);
  if ([...sel.options].some((o) => o.value === value)) sel.value = value;
  else sel.value = CUSTOM_MODEL;
  input.hidden = sel.value !== CUSTOM_MODEL;
  if (sel.value !== CUSTOM_MODEL) input.value = value;
}

async function listModels(i) {
  const endpoint = document.getElementById(`ep${i}`).value.trim();
  const key = document.getElementById(`key${i}`).value.trim();
  if (!endpoint) { logLine("Enter an endpoint URL first.", "bad", i); return; }
  const url = endpoint.replace(/\/chat\/completions\/?$/, "") + "/models";
  try {
    const headers = key ? { Authorization: "Bearer " + key } : {};
    const res = await fetch(url, { headers });
    if (!res.ok) throw new Error("HTTP " + res.status);
    const ids = (await res.json()).data.map((m) => m.id).sort();
    setModelOptions(i, [{ label: "available models", ids }],
      document.getElementById(`model${i}`).value || undefined);
    logLine(`${ids.length} models listed.`, "ok", i);
  } catch (e) {
    logLine(`Could not list models (${e.message}).`, "bad", i);
  }
}

function renderStandards() {
  // Demo default: only one standard pre-checked (the talk's worked example);
  // check more for a full audit.
  const builtin = RUN_STANDARDS.map((s) =>
    `<label><input type="checkbox" class="std-check" value="${s}"${s === DEFAULT_STANDARD ? " checked" : ""}> ${s}</label>`);
  const custom = customStandards.map((c, i) =>
    `<label><input type="checkbox" class="std-check" value="__custom${i}" checked> ${c.name} <em>(${c.text ? "document-fed" : "knowledge-only"})</em></label>`);
  document.getElementById("standards-checks").innerHTML = builtin.concat(custom).join("");
}

function addCustomStandard() {
  const name = document.getElementById("customName").value.trim();
  let text = document.getElementById("customText").value.trim();
  if (!name) { logLine("Custom standard needs a name.", "bad"); return; }
  if (text.length > MAX_DOC_CHARS) {
    text = text.slice(0, MAX_DOC_CHARS);
    logLine(`Pasted text truncated to ${MAX_DOC_CHARS} chars — the audit sees only that portion.`, "warn");
  }
  customStandards.push({ name, text });
  document.getElementById("customName").value = "";
  document.getElementById("customText").value = "";
  renderStandards();
}

function resolveStandard(value) {
  const m = value.match(/^__custom(\d+)$/);
  return m ? customStandards[Number(m[1])] : { name: value, text: "" };
}

function slotConfigs() {
  return [0, 1, 2].map((i) => ({
    idx: i,
    endpoint: document.getElementById(`ep${i}`).value.trim(),
    model: document.getElementById(`model${i}`).value.trim(),
    key: document.getElementById(`key${i}`).value.trim(),
  })).filter((s) => s.endpoint && s.model);
}

function ts() {
  return new Date().toLocaleTimeString([], { hour12: false });
}

// slot = 0..2 routes the line to that slot's log column; omit for run-wide lines.
function logLine(text, cls = "info", slot = null) {
  const el = document.createElement("div");
  el.className = "runlog-line " + cls;
  el.innerHTML = `<span class="lt">${ts()}</span> `;
  el.appendChild(document.createTextNode(text));
  let log;
  if (slot === null) {
    log = document.getElementById("runlog");
  } else {
    const col = document.getElementById(`slotlog${slot}`);
    col.hidden = false;
    log = col.querySelector(".lines");
  }
  log.appendChild(el);
  log.scrollTop = log.scrollHeight;
}

function parseModelJson(text) {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  const raw = fenced ? fenced[1] : text;
  const start = raw.indexOf("{");
  const data = JSON.parse(raw.slice(start, raw.lastIndexOf("}") + 1));
  const bad = DIMENSIONS.filter((d) => typeof data[d.key]?.score !== "number");
  if (bad.length) throw new Error("missing dimensions: " + bad.map((d) => d.key));
  return data;
}

function slotHeaders(slot) {
  const headers = { "Content-Type": "application/json" };
  if (slot.key) {
    headers["Authorization"] = "Bearer " + slot.key;
  } else if (!slot.endpoint.includes("localhost") && !slot.endpoint.includes("127.0.0.1")) {
    throw new Error("API key required for remote endpoint");
  }
  return headers;
}

async function callModel(slot, standard, docText = "") {
  const headers = slotHeaders(slot);
  const res = await fetch(slot.endpoint, {
    method: "POST", headers,
    body: JSON.stringify({
      model: slot.model, temperature: 0,
      messages: [
        { role: "system", content: systemPromptTemplate.replaceAll("{{STANDARD_NAME}}", standard) },
        { role: "user", content: docText
            ? `Assess the standard: ${standard}. Base your assessment on the standard document text below, citing its clauses.\n\nSTANDARD DOCUMENT TEXT:\n${docText}\n\nReturn only the JSON.`
            : `Assess the standard: ${standard}. Return only the JSON.` },
      ],
    }),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}: ${(await res.text()).slice(0, 160)}`);
  return parseModelJson((await res.json()).choices[0].message.content);
}

function fileSafe(s) { return s.replaceAll(" ", "_").replaceAll("/", "_").replaceAll(":", "_"); }

// One slot's full sequential pass (a provider handles one request at a time
// kindly); slots themselves run concurrently in runAudit.
async function runSlot(slot, standards) {
  const total = standards.length * runsPerModel();
  let done = 0;
  const slotT0 = performance.now();
  logLine(`${slot.model}: starting ${total} runs`, "info", slot.idx);
  for (const std of standards) {
    for (let i = 1; i <= runsPerModel(); i++) {
      const t0 = performance.now();
      const dur = () => ((performance.now() - t0) / 1000).toFixed(1) + "s";
      try {
        const data = await callModel(slot, std.name, std.text);
        data.audit_mode = std.text ? "document_fed" : "knowledge_only";
        runResults.push({ standard: std.name, model: slot.model, iteration: i, data });
        const scores = DIMENSIONS.map((d) => data[d.key].score).join("/");
        logLine(`[${++done}/${total}] ${std.name} run ${i}: ${scores} (${dur()})`, "ok", slot.idx);
      } catch (e) {
        done++;
        logLine(`[${done}/${total}] ${std.name} run ${i} FAILED after ${dur()}: ${e.message}`, "bad", slot.idx);
      }
    }
  }
  logLine(`${slot.model}: finished in ${((performance.now() - slotT0) / 1000).toFixed(1)}s`, "info", slot.idx);
}

async function runAudit() {
  const btn = document.getElementById("runAuditBtn");
  const slots = slotConfigs();
  const standards = [...document.querySelectorAll(".std-check:checked")].map((c) => resolveStandard(c.value));
  if (!slots.length || !standards.length) {
    logLine("Configure at least one model slot and one standard.", "bad");
    return;
  }
  localStorage.setItem("sage_slots", JSON.stringify(slots));
  btn.disabled = true;
  runResults.length = 0;
  await Promise.all(slots.map((slot) => runSlot(slot, standards)));
  btn.disabled = false;
  const total = slots.length * standards.length * runsPerModel();
  const failed = total - runResults.length;
  logLine(`Done: ${runResults.length}/${total} runs succeeded${failed ? `, ${failed} FAILED (not exported — a failed run is a failure, not a result)` : ""}.`,
    failed ? "warn" : "ok");
  document.getElementById("exportBtn").disabled = !runResults.length;
  if (runResults.length) {
    mergeLiveResults(runResults);
    logLine("Gap map above updated with this session's results (● rows).", "info");
    document.getElementById("gapmap-section").scrollIntoView({ behavior: "smooth" });
  }
}

function exportResults() {
  runResults.forEach((r, idx) => {
    const name = `${fileSafe(r.standard)}--${fileSafe(r.model)}--iteration_${r.iteration}.json`;
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([JSON.stringify(r.data, null, 2)], { type: "application/json" }));
    a.download = name;
    setTimeout(() => { a.click(); URL.revokeObjectURL(a.href); }, idx * 300);
  });
  logLine(`Exporting ${runResults.length} files — move them into results/ and run runner/aggregate_to_gap_map.py.`, "info");
}

async function initRunPanel() {
  try {
    const res = await fetch("../prompts/eval_system_prompt.md");
    if (!res.ok) throw new Error("HTTP " + res.status);
    systemPromptTemplate = await res.text();
  } catch {
    document.getElementById("run-section").innerHTML =
      "<h2>Run an audit</h2><p class='hint'>Unavailable: prompts/eval_system_prompt.md could not be loaded (serve the repo root, not app/ alone).</p>";
    return;
  }
  // Saved-slot restore lives in slots.js (it also drives the dropdowns).
  renderStandards();
  [0, 1, 2].forEach((i) => {
    document.getElementById(`list${i}`).onclick = () => listModels(i);
  });
  document.getElementById("addCustomBtn").onclick = addCustomStandard;
  document.getElementById("runAuditBtn").onclick = runAudit;
  document.getElementById("exportBtn").onclick = exportResults;
}

initRunPanel();
