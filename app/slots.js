// Slot configuration UI: Local mode (ollama / claude / codex via the
// bridge) vs Web mode (OpenRouter / any OpenAI-compatible URL).
// Selecting a provider fills the endpoint, auto-lists its models, and
// preselects a suggested default.

const BRIDGE = "http://localhost:8765";
const PROVIDERS = {
  local: {
    ollama: { endpoint: "http://localhost:11434/v1/chat/completions",
      defaultModel: "qwen2.5:32b", keyHint: "API key — not needed for local models" },
    claude: { endpoint: `${BRIDGE}/claude/chat/completions`,
      defaultModel: "sonnet", keyHint: "API key — not needed (uses your claude login)" },
    codex: { endpoint: `${BRIDGE}/codex/chat/completions`,
      defaultModel: "default", keyHint: "API key — not needed (uses your codex login)" },
  },
  web: {
    openrouter: { endpoint: "https://openrouter.ai/api/v1/chat/completions",
      defaultModel: "anthropic/claude-sonnet-5", keyHint: "OpenRouter API key (sk-or-…)" },
    mistral: { endpoint: "https://api.mistral.ai/v1/chat/completions",
      defaultModel: "mistral-large-latest", keyHint: "Mistral API key (console.mistral.ai)" },
    custom: { endpoint: "", defaultModel: "", keyHint: "API key for your endpoint (blank if none)" },
  },
};

// Fallback when the bridge isn't running (snapshot of ollama.com/api/tags,
// 2026-08-17, newest first); the bridge proxies the live catalog sorted by
// release date when available.
const OLLAMA_CLOUD_FALLBACK = ["deepseek-v4-pro:0813", "deepseek-v4-flash:0731",
  "kimi-k3", "glm-5.2", "kimi-k2.7-code", "nemotron-3-ultra", "glm-5.1",
  "qwen3.5:397b", "minimax-m3", "kimi-k2.6", "deepseek-v4-pro:preview",
  "deepseek-v4-flash:preview", "minimax-m2.7", "mistral-large-3:675b",
  "nemotron-3-super", "gpt-oss:120b", "gemma4:31b", "gpt-oss:20b",
  "nemotron-3-nano:30b"].map((n) => `${n}:cloud`);

async function appendOllamaCloud(i) {
  let ids;
  try {
    const res = await fetch(`${BRIDGE}/ollama-cloud/models`);
    if (!res.ok) throw new Error("bridge " + res.status);
    ids = (await res.json()).data.map((m) => m.id);
  } catch {
    ids = OLLAMA_CLOUD_FALLBACK; // bridge not running -> curated snapshot
  }
  const sel = document.getElementById(`modelsel${i}`);
  const have = new Set([...sel.options].map((o) => o.value));
  const fresh = ids.filter((id) => !have.has(id));
  if (fresh.length) {
    const og = document.createElement("optgroup");
    og.label = "Ollama cloud (subscription)";
    og.innerHTML = fresh.map((id) => `<option value="${id}">${id}</option>`).join("");
    sel.insertBefore(og, sel.querySelector(`option[value="${CUSTOM_MODEL}"]`));
  }
  logLine(`Added ${ids.length} Ollama cloud models (need ollama.com sign-in; big ones may need extra usage enabled).`, "info", i);
  if (ids.length) syncModelField(i, slotPreset[i] ?? pickBestCloud(ids));
}

// Default = most capable recent model. The catalog has no capability
// metadata, so rank by name tier (pro/ultra/large > base > flash/mini/nano);
// ids arrive newest-first, so recency breaks ties.
function cloudTier(id) {
  if (/pro|ultra|large|max/.test(id)) return 2;
  if (/flash|mini|nano|air|lite/.test(id)) return 0;
  return 1;
}

function pickBestCloud(ids) {
  return ids.reduce((best, id) => (cloudTier(id) > cloudTier(best) ? id : best), ids[0]);
}

async function testSlot(i) {
  const slot = {
    endpoint: document.getElementById(`ep${i}`).value.trim(),
    model: document.getElementById(`model${i}`).value.trim(),
    key: document.getElementById(`key${i}`).value.trim(),
  };
  if (!slot.endpoint || !slot.model) { logLine("Set endpoint and model first.", "bad", i); return; }
  logLine(`Testing ${slot.model}…`, "info", i);
  const t0 = performance.now();
  try {
    const res = await fetch(slot.endpoint, {
      method: "POST", headers: slotHeaders(slot),
      body: JSON.stringify({ model: slot.model, max_tokens: 20,
        messages: [{ role: "user", content: "Reply with exactly: OK" }] }),
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}: ${(await res.text()).slice(0, 140)}`);
    const msg = (await res.json()).choices[0].message;
    const text = (msg.content || "").trim() || "(empty text — reasoning-only reply, still working)";
    logLine(`✓ ${slot.model} responded in ${((performance.now() - t0) / 1000).toFixed(1)}s: ${text.slice(0, 60)}`, "ok", i);
  } catch (e) {
    logLine(`✗ ${slot.model} FAILED: ${e.message}`, "bad", i);
  }
}

// Regional defaults — one model per region per slot (CN / US / EU), so the
// convergence claim spans different training pipelines by default.
const MODE_DEFAULTS = {
  local: [
    { prov: "ollama", model: "deepseek-v4-pro:0813:cloud" },      // China
    { prov: "ollama", model: "gpt-oss:120b:cloud" },               // US (OpenAI open-weights)
    { prov: "ollama", model: "mistral-large-3:675b:cloud" },       // Europe
  ],
  web: [
    { prov: "openrouter", model: "deepseek/deepseek-v4-pro" },     // China
    { prov: "openrouter", model: "openai/gpt-5.6-luna" },          // US
    { prov: "openrouter", model: "mistralai/mistral-large-2512" }, // Europe
  ],
};
const slotPreset = [null, null, null]; // regional preset per slot, if seeded

function seedDefaults() {
  MODE_DEFAULTS[currentMode()].forEach((d, i) => {
    document.getElementById(`prov${i}`).value = d.prov;
    slotPreset[i] = d.model;
    onProviderChange(i, d.model);
  });
}

function currentMode() {
  return document.querySelector('input[name="mode"]:checked')?.value ?? "web";
}

// Compact always-visible summary of the configured slots (settings collapse).
function renderSlotSummary() {
  const configured = slotConfigs();
  document.getElementById("slotSummary").innerHTML = [0, 1, 2].map((i) => {
    const c = configured.find((x) => x.idx === i);
    const prov = document.getElementById(`prov${i}`).value;
    return c
      ? `<span class="chip-slot on">Slot ${i + 1}: ${c.model}${prov ? ` <em>(${prov})</em>` : ""}</span>`
      : `<span class="chip-slot">Slot ${i + 1}: not set</span>`;
  }).join("");
}

function initOnboarding() {
  const seen = localStorage.getItem("sage_onboarded");
  const banner = document.getElementById("onboarding");
  banner.hidden = !!seen;
  if (!seen) document.getElementById("slotSettings").open = true;
  document.getElementById("onboardDismiss").onclick = () => {
    banner.hidden = true;
    localStorage.setItem("sage_onboarded", "1");
  };
}

// Returns true if at least one saved slot was reflected into the UI.
function restoreSavedSlots(savedSlots) {
  if (!savedSlots?.some((s) => s?.endpoint && s?.model)) return false;
  const provs = PROVIDERS[currentMode()];
  let restored = 0;
  savedSlots.forEach((s) => {
    const i = s?.idx;
    if (i === undefined || !s.endpoint || !s.model) return;
    const name = Object.keys(provs).find((n) => provs[n].endpoint === s.endpoint) ??
      ("custom" in provs ? "custom" : null);
    if (!name) return;
    document.getElementById(`prov${i}`).value = name;
    onProviderChange(i, s.model);
    if (name === "custom") document.getElementById(`ep${i}`).value = s.endpoint;
    document.getElementById(`key${i}`).value = s.key ?? "";
    restored++;
  });
  return restored > 0;
}

function fillProviderOptions(i) {
  const sel = document.getElementById(`prov${i}`);
  const names = Object.keys(PROVIDERS[currentMode()]);
  sel.innerHTML = `<option value="">— none —</option>` +
    names.map((n) => `<option value="${n}">${n}</option>`).join("");
}

function onProviderChange(i, presetModel = null) {
  const mode = currentMode();
  const name = document.getElementById(`prov${i}`).value;
  const ep = document.getElementById(`ep${i}`);
  const model = document.getElementById(`model${i}`);
  const key = document.getElementById(`key${i}`);
  slotPreset[i] = presetModel; // seeded/restored model sticks; manual change clears it
  if (!name) { ep.value = ""; setModelOptions(i, [], ""); return; }
  const p = PROVIDERS[mode][name];
  ep.value = p.endpoint;
  ep.hidden = name !== "custom";
  model.value = presetModel ?? p.defaultModel;
  key.placeholder = p.keyHint;
  if (p.endpoint) {
    const listed = listModels(i); // auto-list; suggested default stays selected
    if (name === "ollama") listed.then(() => appendOllamaCloud(i)).then(renderSlotSummary);
    else listed.then(renderSlotSummary);
  } else {
    setModelOptions(i, [], ""); // custom endpoint -> free-typed model id
  }
  renderSlotSummary();
}

function onModeChange() {
  const mode = currentMode();
  localStorage.setItem("sage_mode", mode);
  [0, 1, 2].forEach((i) => {
    fillProviderOptions(i);
    const ep = document.getElementById(`ep${i}`);
    ep.hidden = true; ep.value = "";
    document.getElementById(`model${i}`).value = "";
    setModelOptions(i, [], "");
  });
  seedDefaults();
}

function initSlotModes() {
  // Default: Local when running on this machine, Web when launched from
  // the hosted GitHub Pages site. User's explicit choice is remembered.
  const saved = localStorage.getItem("sage_mode") ||
    (["localhost", "127.0.0.1", ""].includes(location.hostname) ? "local" : "web");
  document.querySelector(`input[name="mode"][value="${saved}"]`).checked = true;
  document.querySelectorAll('input[name="mode"]').forEach((r) => (r.onchange = onModeChange));
  [0, 1, 2].forEach((i) => {
    fillProviderOptions(i);
    document.getElementById(`prov${i}`).onchange = () => onProviderChange(i);
    document.getElementById(`test${i}`).onclick = () => testSlot(i);
    document.getElementById(`modelsel${i}`).onchange = () => {
      const v = document.getElementById(`modelsel${i}`).value;
      const input = document.getElementById(`model${i}`);
      input.hidden = v !== CUSTOM_MODEL;
      input.value = v === CUSTOM_MODEL ? "" : v;
      renderSlotSummary();
    };
  });
  // Reflect saved slots into the provider/model dropdowns; anything that
  // can't be reconciled falls back to the regional defaults.
  const savedSlots = JSON.parse(localStorage.getItem("sage_slots") || "null");
  if (!restoreSavedSlots(savedSlots)) seedDefaults();
  renderSlotSummary();
  initOnboarding();
}

initSlotModes();
