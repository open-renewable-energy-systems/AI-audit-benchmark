// "Run audit" panel — calls OpenAI-compatible endpoints (OpenRouter, Ollama)
// directly from the browser with the frozen system prompt from prompts/.
// Keys live only in localStorage; results export in the runner's
// results/{Standard}--{model}--iteration_{n}.json format.

const RUN_STANDARDS = ["IEC 61850", "CIM", "OpenADR 3", "ISO 15118",
  "IEEE 1547", "SunSpec", "IEEE 2030.5"]; // mirrors runner/evaluate_model_knowledge.py
const RUNS_PER_MODEL = 3;
const OPENROUTER_URL = "https://openrouter.ai/api/v1/chat/completions";
const OLLAMA_URL = "http://localhost:11434/v1/chat/completions";
const DEFAULT_SLOTS = [
  { endpoint: OPENROUTER_URL, model: "anthropic/claude-sonnet-4.5" },
  { endpoint: OPENROUTER_URL, model: "openai/gpt-5" },
  { endpoint: OLLAMA_URL, model: "qwen2.5:32b" },
];

let systemPromptTemplate = null;
const runResults = []; // {standard, model, iteration, data}

function slotConfigs() {
  return [0, 1, 2].map((i) => ({
    endpoint: document.getElementById(`ep${i}`).value.trim(),
    model: document.getElementById(`model${i}`).value.trim(),
  })).filter((s) => s.endpoint && s.model);
}

function apiKey() { return document.getElementById("orKey").value.trim(); }

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

async function callModel(slot, standard) {
  const headers = { "Content-Type": "application/json" };
  if (slot.endpoint.includes("openrouter.ai")) {
    if (!apiKey()) throw new Error("OpenRouter key required");
    headers["Authorization"] = "Bearer " + apiKey();
  }
  const res = await fetch(slot.endpoint, {
    method: "POST", headers,
    body: JSON.stringify({
      model: slot.model, temperature: 0,
      messages: [
        { role: "system", content: systemPromptTemplate.replaceAll("{{STANDARD_NAME}}", standard) },
        { role: "user", content: `Assess the standard: ${standard}. Return only the JSON.` },
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
  const standards = [...document.querySelectorAll(".std-check:checked")].map((c) => c.value);
  if (!slots.length || !standards.length) {
    logLine("Configure at least one model slot and one standard.", "bad");
    return;
  }
  localStorage.setItem("sage_slots", JSON.stringify(slots));
  if (apiKey()) localStorage.setItem("sage_or_key", apiKey());
  btn.disabled = true;
  runResults.length = 0;
  const total = slots.length * standards.length * RUNS_PER_MODEL;
  let done = 0;
  for (const slot of slots) {
    for (const standard of standards) {
      for (let i = 1; i <= RUNS_PER_MODEL; i++) {
        try {
          const data = await callModel(slot, standard);
          runResults.push({ standard, model: slot.model, iteration: i, data });
          const scores = DIMENSIONS.map((d) => data[d.key].score).join("/");
          logLine(`[${++done}/${total}] ${slot.model} × ${standard} run ${i}: ${scores}`, "ok");
        } catch (e) {
          done++;
          logLine(`[${done}/${total}] ${slot.model} × ${standard} run ${i} FAILED: ${e.message}`, "bad");
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
  const saved = JSON.parse(localStorage.getItem("sage_slots") || "null") || DEFAULT_SLOTS;
  [0, 1, 2].forEach((i) => {
    document.getElementById(`ep${i}`).value = saved[i]?.endpoint ?? "";
    document.getElementById(`model${i}`).value = saved[i]?.model ?? "";
  });
  document.getElementById("orKey").value = localStorage.getItem("sage_or_key") || "";
  document.getElementById("standards-checks").innerHTML = RUN_STANDARDS.map((s) =>
    `<label><input type="checkbox" class="std-check" value="${s}" checked> ${s}</label>`).join("");
  document.getElementById("runAuditBtn").onclick = runAudit;
  document.getElementById("exportBtn").onclick = exportResults;
}

initRunPanel();
