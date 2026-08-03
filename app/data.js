// MOCK DATA — illustrative placeholders until the real SAGE runs land.
// Shapes mirror docs/rubric-and-deliverables.md; numbers are the doc's
// illustrative gap map, NOT audit results.
const DIMENSIONS = [
  { key: "capability_declaration", label: "Capability declaration" },
  { key: "bounded_authority", label: "Bounded authority" },
  { key: "decision_auditability", label: "Decision auditability" },
  { key: "data_governance", label: "Data governance" },
];

const MODELS = ["claude", "gpt", "gemini", "mistral", "open-8b"];

// Convergent gap map (rows = standards). null = contested.
const GAPMAP = [
  { standard: "IEEE 2030.5", scores: [3, 1, 1, 0] },
  { standard: "IEC 61850",   scores: [3, 0, null, 0] },
  { standard: "CIM",         scores: [2, 0, 1, 0] },
  { standard: "OpenADR 3",   scores: [2, 2, 2, 1] },
  { standard: "ISO 15118",   scores: [3, 2, 1, 2] },
  { standard: "IEEE 1547",   scores: [3, 0, 0, 0] },
  { standard: "SunSpec",     scores: [3, 0, 0, 0] },
];

// Per-model detail for drill-down cells (mock; evidence per rubric schema).
const CELL_DETAIL = {
  "IEEE 2030.5|capability_declaration": MODELS.map((m) => ({
    model: m, score: 3, evidence: "DERCapability resource, sec 10.10",
    rationale: "Device advertises supported modes and operating limits.",
    confidence: 0.9,
  })),
  "IEEE 2030.5|bounded_authority": MODELS.map((m, i) => ({
    model: m, score: i === 3 ? 0 : 1, evidence: "none",
    rationale: "DERControl issues commands; no grant of authority with scope, ceilings, expiry, or revocation for a delegated agent.",
    confidence: [0.7, 0.8, 0.7, 0.6, 0.6][i],
  })),
  "IEC 61850|decision_auditability": [
    { model: "claude", score: 2, evidence: "Part 7-2, logging services",
      rationale: "Logging services exist but no agent attribution.", confidence: 0.6 },
    { model: "gpt", score: 1, evidence: "none",
      rationale: "Event logs inferable, not agent-scoped.", confidence: 0.5 },
    { model: "gemini", score: 1, evidence: "none",
      rationale: "No decision-level attribution.", confidence: 0.5 },
    { model: "mistral", score: 0, evidence: "none",
      rationale: "No coverage found.", confidence: 0.6 },
    { model: "open-8b", score: 1, evidence: "none",
      rationale: "Implicit only.", confidence: 0.4 },
  ],
};

// Village scenario replay (worked-example.md): 18:30 price spike.
const SCENARIO = {
  request: { time: "18:30", action: "discharge", kw: 5.0, price: "0.42 EUR/kWh" },
  grant: {
    grant_id: "grant:01JA7F3K",
    granted_by: "did:ores:operator:village-coop",
    granted_to: "did:ores:agent:7f3a",
    scope: ["active_power_setpoint"],
    ceilings: { active_power_kw: { min: -3.0, max: 3.0 }, soc_floor_pct: 30 },
    constraints: { quiet_hours: "17:00-21:00", max_actions_per_hour: 4 },
    valid_until: "2026-09-30T00:00:00Z",
    capability_ref: "IEEE2030.5:DERCapability/der:hyphae:battery:03",
  },
  withoutGaifare: [
    { t: "18:30:01", cls: "info", text: "Price spike detected (0.42 EUR/kWh). Agent decides: discharge at full 5 kW." },
    { t: "18:30:02", cls: "ok", text: "Authenticated credential sends valid DERControl setpoint: -5.0 kW. Protocol followed perfectly." },
    { t: "18:30:05", cls: "bad", text: "Village browns out at dinner. 15 houses affected." },
    { t: "post", cls: "bad", text: "Who authorized 5 kW? Was there a 3 kW cap? Did the agent exceed its bounds? Unanswerable — no bound ever existed in the data model." },
  ],
  withGaifare: [
    { t: "18:30:01", cls: "info", text: "Price spike detected (0.42 EUR/kWh). Agent decides: discharge at full 5 kW." },
    { t: "18:30:02", cls: "warn", text: "Command references grant:01JA7F3K — envelope check runs before execution." },
    { t: "18:30:02", cls: "bad", text: "REJECTED ×2: 5.0 kW exceeds 3.0 kW ceiling AND 18:30 falls in quiet hours (17:00–21:00)." },
    { t: "18:30:03", cls: "ok", text: "Rejection logged as signed decision_record (agent, model, inputs_hash, authority_ref). Brownout never happens." },
    { t: "post", cls: "ok", text: "Battery is still physically capable of 5 kW — only the agent's permission became narrower, expirable, revocable." },
  ],
};
