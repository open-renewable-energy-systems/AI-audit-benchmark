// "Run audit" panel — calls OpenAI-compatible endpoints (OpenRouter, Ollama)
// directly from the browser with the frozen system prompt from prompts/.
// Keys live only in localStorage; results export in the runner's
// results/{Standard}--{model}--iteration_{n}.json format.

const RUN_STANDARDS = ["IEC 61850", "CIM", "OpenADR 3", "ISO 15118",
  "IEEE 1547", "SunSpec", "IEEE 2030.5"]; // mirrors runner/evaluate_model_knowledge.py
const RUNS_PER_MODEL = 3;
// Slot defaults and provider presets live in slots.js.

const MAX_DOC_CHARS = 150000; // keep pasted standard text within context limits

let systemPromptTemplate = null;
const runResults = []; // {standard, model, iteration, data}
const customStandards = []; // {name, text} — text = document-fed, else knowledge-only

async function listModels(i) {
  const endpoint = document.getElementById(`ep${i}`).value.trim();
  const key = document.getElementById(`key${i}`).value.trim();
  if (!endpoint) { logLine(`Slot ${i + 1}: enter an endpoint URL first.`, "bad"); return; }
  const url = endpoint.replace(/\/chat\/completions\/?$/, "") + "/models";
  try {
    const headers = key ? { Authorization: "Bearer " + key } : {};
    const res = await fetch(url, { headers });
    if (!res.ok) throw new Error("HTTP " + res.status);
    const ids = (await res.json()).data.map((m) => m.id).sort();
    document.getElementById(`models${i}`).innerHTML =
      ids.map((id) => `<option value="${id}">`).join("");
    logLine(`Slot ${i + 1}: ${ids.length} models available — pick from the model field's dropdown.`, "ok");
  } catch (e) {
    logLine(`Slot ${i + 1}: could not list models (${e.message}).`, "bad");
  }
}

function renderStandards() {
  const builtin = RUN_STANDARDS.map((s) =>
    `<label><input type="checkbox" class="std-check" value="${s}" checked> ${s}</label>`);
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
    endpoint: document.getElementById(`ep${i}`).value.trim(),
    model: document.getElementById(`model${i}`).value.trim(),
    key: document.getElementById(`key${i}`).value.trim(),
  })).filter((s) => s.endpoint && s.model);
}

function logLine(text, cls = "info") {
  const el = document.createElement("div");
  el.className = "runlog-line " + cls;
  el.textContent = text;
  const log = document.getElementById("runlog");
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
  const total = slots.length * standards.length * RUNS_PER_MODEL;
  let done = 0;
  for (const slot of slots) {
    for (const std of standards) {
      for (let i = 1; i <= RUNS_PER_MODEL; i++) {
        try {
          const data = await callModel(slot, std.name, std.text);
          data.audit_mode = std.text ? "document_fed" : "knowledge_only";
          runResults.push({ standard: std.name, model: slot.model, iteration: i, data });
          const scores = DIMENSIONS.map((d) => data[d.key].score).join("/");
          logLine(`[${++done}/${total}] ${slot.model} × ${std.name} run ${i}: ${scores}`, "ok");
        } catch (e) {
          done++;
          logLine(`[${done}/${total}] ${slot.model} × ${std.name} run ${i} FAILED: ${e.message}`, "bad");
        }
      }
    }
  }
  btn.disabled = false;
  const failed = total - runResults.length;
  logLine(`Done: ${runResults.length}/${total} runs succeeded${failed ? `, ${failed} FAILED (not exported — a failed run is a failure, not a result)` : ""}.`,
    failed ? "warn" : "ok");
  document.getElementById("exportBtn").disabled = !runResults.length;
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
  const saved = JSON.parse(localStorage.getItem("sage_slots") || "null");
  if (saved) [0, 1, 2].forEach((i) => {
    document.getElementById(`ep${i}`).value = saved[i]?.endpoint ?? "";
    document.getElementById(`model${i}`).value = saved[i]?.model ?? "";
    document.getElementById(`key${i}`).value = saved[i]?.key ?? "";
  });
  renderStandards();
  [0, 1, 2].forEach((i) => {
    document.getElementById(`list${i}`).onclick = () => listModels(i);
  });
  document.getElementById("addCustomBtn").onclick = addCustomStandard;
  document.getElementById("runAuditBtn").onclick = runAudit;
  document.getElementById("exportBtn").onclick = exportResults;
}

initRunPanel();
