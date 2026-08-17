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
  if (p.endpoint) listModels(i); // auto-list; suggested default stays selected
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
  const saved = localStorage.getItem("sage_mode") ||
    (["localhost", "127.0.0.1"].includes(location.hostname) ? "local" : "web");
  document.querySelector(`input[name="mode"][value="${saved}"]`).checked = true;
  document.querySelectorAll('input[name="mode"]').forEach((r) => (r.onchange = onModeChange));
  [0, 1, 2].forEach((i) => {
    fillProviderOptions(i);
    document.getElementById(`prov${i}`).onchange = () => onProviderChange(i);
  });
  // restore saved slots if any; otherwise seed slot 1 from the mode default
  const savedSlots = JSON.parse(localStorage.getItem("sage_slots") || "null");
  if (!savedSlots?.some((s) => s.endpoint)) {
    document.getElementById("prov0").selectedIndex = 1;
    onProviderChange(0);
  }
}

initSlotModes();
