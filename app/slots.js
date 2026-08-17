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
      defaultModel: "gpt-5.2", keyHint: "API key — not needed (uses your codex login)" },
  },
  web: {
    openrouter: { endpoint: "https://openrouter.ai/api/v1/chat/completions",
      defaultModel: "anthropic/claude-sonnet-5", keyHint: "OpenRouter API key (sk-or-…)" },
    custom: { endpoint: "", defaultModel: "", keyHint: "API key for your endpoint (blank if none)" },
  },
};

// Fallback when the bridge isn't running (snapshot of ollama.com/api/tags,
// 2026-08-17); the bridge proxies the live catalog when available.
const OLLAMA_CLOUD_FALLBACK = ["deepseek-v4-flash:preview", "deepseek-v4-flash:0731",
  "minimax-m2.7", "mistral-large-3:675b", "nemotron-3-super", "glm-5.2",
  "deepseek-v4-pro:preview", "minimax-m3", "nemotron-3-ultra", "gpt-oss:120b",
  "gemma4:31b", "kimi-k2.6", "kimi-k2.7-code", "qwen3.5:397b", "glm-5.1",
  "deepseek-v4-pro:0813", "gpt-oss:20b", "kimi-k3", "nemotron-3-nano:30b"]
  .map((n) => `${n}:cloud`);

async function appendOllamaCloud(i) {
  let ids;
  try {
    const res = await fetch(`${BRIDGE}/ollama-cloud/models`);
    if (!res.ok) throw new Error("bridge " + res.status);
    ids = (await res.json()).data.map((m) => m.id);
  } catch {
    ids = OLLAMA_CLOUD_FALLBACK; // bridge not running -> curated snapshot
  }
  const dl = document.getElementById(`models${i}`);
  const have = new Set([...dl.options].map((o) => o.value));
  dl.innerHTML += ids.filter((id) => !have.has(id))
    .map((id) => `<option value="${id}" label="cloud">`).join("");
  logLine(`Slot ${i + 1}: added ${ids.length} Ollama cloud models (need ollama.com sign-in; big ones may need extra usage enabled).`, "info");
}

async function testSlot(i) {
  const slot = {
    endpoint: document.getElementById(`ep${i}`).value.trim(),
    model: document.getElementById(`model${i}`).value.trim(),
    key: document.getElementById(`key${i}`).value.trim(),
  };
  if (!slot.endpoint || !slot.model) { logLine(`Slot ${i + 1}: set endpoint and model first.`, "bad"); return; }
  logLine(`Slot ${i + 1}: testing ${slot.model}…`, "info");
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
    logLine(`Slot ${i + 1} ✓ ${slot.model} responded in ${((performance.now() - t0) / 1000).toFixed(1)}s: ${text.slice(0, 60)}`, "ok");
  } catch (e) {
    logLine(`Slot ${i + 1} ✗ ${slot.model} FAILED: ${e.message}`, "bad");
  }
}

function currentMode() {
  return document.querySelector('input[name="mode"]:checked')?.value ?? "web";
}

function fillProviderOptions(i) {
  const sel = document.getElementById(`prov${i}`);
  const names = Object.keys(PROVIDERS[currentMode()]);
  sel.innerHTML = `<option value="">— none —</option>` +
    names.map((n) => `<option value="${n}">${n}</option>`).join("");
}

function onProviderChange(i) {
  const mode = currentMode();
  const name = document.getElementById(`prov${i}`).value;
  const ep = document.getElementById(`ep${i}`);
  const model = document.getElementById(`model${i}`);
  const key = document.getElementById(`key${i}`);
  if (!name) { ep.value = ""; model.value = ""; return; }
  const p = PROVIDERS[mode][name];
  ep.value = p.endpoint;
  ep.hidden = name !== "custom";
  model.value = p.defaultModel;
  key.placeholder = p.keyHint;
  if (p.endpoint) {
    const listed = listModels(i); // auto-list; suggested default stays selected
    if (name === "ollama") listed.then(() => appendOllamaCloud(i));
  }
}

function onModeChange() {
  const mode = currentMode();
  localStorage.setItem("sage_mode", mode);
  [0, 1, 2].forEach((i) => {
    fillProviderOptions(i);
    const ep = document.getElementById(`ep${i}`);
    ep.hidden = true; ep.value = "";
    document.getElementById(`model${i}`).value = "";
    document.getElementById(`models${i}`).innerHTML = "";
  });
  // sensible starting point: slot 1 gets the mode's first provider
  document.getElementById("prov0").selectedIndex = 1;
  onProviderChange(0);
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
  });
  // restore saved slots if any; otherwise seed slot 1 from the mode default
  const savedSlots = JSON.parse(localStorage.getItem("sage_slots") || "null");
  if (!savedSlots?.some((s) => s.endpoint)) {
    document.getElementById("prov0").selectedIndex = 1;
    onProviderChange(0);
  }
}

initSlotModes();
