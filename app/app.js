// SAGE demo app — renders the gap map + Hyphae scenario replay.
// Loads gapmap/gap-map.json (built by runner/aggregate_to_gap_map.py) when
// served from the repo root; falls back to the mock data in data.js.

let usingRealData = false;
let badgeText = "MOCK DATA"; // what the badge says when published results are shown
const liveRows = [];       // rows produced by this session's runs
let committedRows = null;  // published rows (repo gap map or mock), shown on demand

function visibleRows() {
  const showPub = document.getElementById("showPublished").checked;
  return (showPub ? committedRows ?? [] : []).concat(liveRows);
}

async function loadRealGapmap() {
  try {
    const res = await fetch("../gapmap/gap-map.json");
    if (!res.ok) return false;
    const g = await res.json();
    committedRows = [];
    Object.keys(CELL_DETAIL).forEach((k) => delete CELL_DETAIL[k]);
    g.standards.forEach((s) => {
      committedRows.push({
        standard: s.display_name,
        scores: DIMENSIONS.map((d) => {
          const c = s.cells[d.key];
          return c.contested ? null : c.score;
        }),
      });
      DIMENSIONS.forEach((d) => {
        CELL_DETAIL[`${s.display_name}|${d.key}`] = s.cells[d.key].per_model.map(
          (p) => ({
            model: p.model + (p.self_consistent ? "" : " ⚠unstable"),
            score: p.median_score,
            evidence: p.evidence,
            rationale: p.rationale,
            confidence: p.mean_confidence,
          })
        );
      });
    });
    usingRealData = true;
    badgeText = g.convergence_claimable ? "" : `REAL DATA · ${g.model_count} MODEL — CONVERGENCE NEEDS ≥2`;
    return true;
  } catch {
    return false; // no server / no gap map yet -> mock fallback is the feature
  }
}

function median(arr) {
  const s = [...arr].sort((a, b) => a - b);
  const m = s.length >> 1;
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

// Merge this session's run results into the gap map (same rules as the
// aggregator: per-model median across runs; cross-model spread <=1 ->
// convergent, else contested). Rows touched this session are marked ●.
function mergeLiveResults(results) {
  const byStd = {};
  results.forEach((r) => {
    ((byStd[r.standard] ??= {})[r.model] ??= []).push(r.data);
  });
  Object.entries(byStd).forEach(([std, byModel]) => {
    const scores = DIMENSIONS.map((d) => {
      const medians = Object.values(byModel).map((runs) => median(runs.map((x) => x[d.key].score)));
      return Math.max(...medians) - Math.min(...medians) > 1 ? null : Math.round(median(medians));
    });
    DIMENSIONS.forEach((d) => {
      CELL_DETAIL[`${std}|${d.key}`] = Object.entries(byModel).map(([m, runs]) => {
        const ss = runs.map((x) => x[d.key].score);
        const md = median(ss);
        const rep = runs.reduce((b, x) => (Math.abs(x[d.key].score - md) < Math.abs(b[d.key].score - md) ? x : b));
        return {
          model: m + (Math.max(...ss) - Math.min(...ss) <= 1 ? "" : " ⚠unstable"),
          score: md, evidence: rep[d.key].evidence,
          rationale: rep[d.key].rationale, confidence: rep[d.key].confidence,
        };
      });
    });
    const row = liveRows.find((r) => r.standard === std);
    if (row) row.scores = scores;
    else liveRows.push({ standard: std, scores, live: true });
  });
  renderGapmap();
}

function scoreClass(s) {
  return s === null ? "contested" : "s" + s;
}

function renderGapmap() {
  const table = document.getElementById("gapmap");
  table.innerHTML = "";
  const rows = visibleRows();
  if (!rows.length) {
    table.innerHTML = `<tr><td class="empty-hint">No results yet — configure slots in "Run an audit" below and run one, or tick "show published results".</td></tr>`;
    return;
  }
  const head = document.createElement("tr");
  head.innerHTML =
    "<th></th>" + DIMENSIONS.map((d) => `<th class="dimhead" data-key="${d.key}" title="Click for definition">${d.label} ⓘ</th>`).join("");
  head.querySelectorAll("th.dimhead").forEach((th) => {
    th.onclick = () => showDimensionInfo(DIMENSIONS.find((d) => d.key === th.dataset.key));
  });
  table.appendChild(head);

  rows.forEach((row) => {
    const tr = document.createElement("tr");
    tr.innerHTML = `<th class="rowhead${row.live ? " live" : ""}" ${row.live ? 'title="updated by this session\'s run"' : ""}>${row.standard}${row.live ? " ●" : ""}</th>`;
    row.scores.forEach((s, i) => {
      const td = document.createElement("td");
      td.className = "cell " + scoreClass(s);
      td.textContent = s === null ? "contested" : s;
      td.onclick = () => showDetail(row.standard, DIMENSIONS[i], s, td);
      tr.appendChild(td);
    });
    table.appendChild(tr);
  });
}

function showDimensionInfo(dim) {
  const box = document.getElementById("detail");
  box.hidden = false;
  box.innerHTML =
    `<h3>${dim.label} — what the models are asked</h3>
     <p class="verdict">${dim.desc}</p>
     <p class="verdict">Scale: ${SCORE_SCALE.join(" · ")}. Each model also cites the clause it relied on (or "none") and reports its own confidence.</p>
     <p class="verdict">The definitions are frozen in <code>prompts/eval_system_prompt.md</code> — every model gets them verbatim, which is what makes cross-model agreement meaningful.</p>`;
}

function showDetail(standard, dim, score, td) {
  document.querySelectorAll("td.cell.selected").forEach((c) => c.classList.remove("selected"));
  td.classList.add("selected");
  const box = document.getElementById("detail");
  box.hidden = false;
  const key = `${standard}|${dim.key}`;
  const rows = CELL_DETAIL[key];
  let html = `<h3>${standard} × ${dim.label}</h3>`;
  if (!rows) {
    html += `<p class="verdict">Per-model detail not yet in the mock set — real runs land in <code>results/</code>.</p>`;
    box.innerHTML = html;
    return;
  }
  html += `<table><tr><th>Model</th><th title="Median of the model's runs; ⚠unstable if its runs spread more than 1">Score</th><th>Evidence</th><th>Rationale</th><th title="The model's self-reported confidence (0–1), averaged over its runs — a signal, not proof">Conf.</th></tr>`;
  rows.forEach((r) => {
    html += `<tr><td>${r.model}</td><td class="score">${r.score}</td><td>${r.evidence}</td><td>${r.rationale}</td><td>${r.confidence}</td></tr>`;
  });
  html += `</table>`;
  const scores = rows.map((r) => r.score);
  const spread = Math.max(...scores) - Math.min(...scores);
  if (spread > 1) {
    html += `<p class="verdict contested">⚠ Contested — models disagree (spread ${spread}). Reported, not claimed.</p>`;
  } else if (Math.max(...scores) <= 1) {
    html += `<p class="verdict gap">✗ Convergent gap — every model scores ≤1 and none can cite a clause. Agreement across models = not a hallucination.</p>`;
  } else {
    html += `<p class="verdict covered">✓ Convergent coverage — models agree this is handled. GAIFARE reuses it instead of reinventing it.</p>`;
  }
  html += `<p class="verdict">How this cell is computed: each model scores 0–3 itself (with a clause citation); per model = median of its runs; the cell = median of the model medians when they agree within ±1, otherwise "contested". Conf. is the model's self-reported confidence — the evidence citation and cross-model agreement are the real checks.</p>`;
  box.innerHTML = html;
}

// --- Scenario replay ---
let gaifareOn = false;

function renderGrant() {
  const g = SCENARIO.grant;
  document.getElementById("grantYaml").textContent =
`grant_id:    ${g.grant_id}
granted_by:  ${g.granted_by}
granted_to:  ${g.granted_to}
scope:       [${g.scope.join(", ")}]
ceilings:
  active_power_kw: { min: ${g.ceilings.active_power_kw.min}, max: ${g.ceilings.active_power_kw.max} }
  soc_floor_pct:   ${g.ceilings.soc_floor_pct}
constraints:
  quiet_hours: "${g.constraints.quiet_hours}"
  max_actions_per_hour: ${g.constraints.max_actions_per_hour}
valid_until: "${g.valid_until}"
capability_ref: "${g.capability_ref}"`;
}

function replay() {
  const events = gaifareOn ? SCENARIO.withGaifare : SCENARIO.withoutGaifare;
  const tl = document.getElementById("timeline");
  tl.innerHTML = "";
  events.forEach((e, i) => {
    const div = document.createElement("div");
    div.className = "evt " + e.cls;
    div.style.animationDelay = i * 0.7 + "s";
    div.innerHTML = `<span class="t">${e.t}</span><span class="msg">${e.text}</span>`;
    tl.appendChild(div);
  });
}

function setToggle(on) {
  gaifareOn = on;
  const t = document.getElementById("gaifareToggle");
  t.classList.toggle("on", on);
  t.setAttribute("aria-checked", String(on));
  replay();
}

document.getElementById("gaifareToggle").onclick = () => setToggle(!gaifareOn);
document.getElementById("gaifareToggle").onkeydown = (e) => {
  if (e.key === " " || e.key === "Enter") setToggle(!gaifareOn);
};
document.getElementById("replayBtn").onclick = replay;
function updateBadge() {
  const badge = document.getElementById("mockBadge");
  const showPub = document.getElementById("showPublished").checked;
  badge.hidden = !(showPub && badgeText);
  if (!badge.hidden) badge.textContent = badgeText;
}

async function init() {
  await loadRealGapmap();
  if (!committedRows) committedRows = MOCK_GAPMAP; // no served gap map -> mock set
  document.getElementById("showPublished").onchange = () => { renderGapmap(); updateBadge(); };
  updateBadge();
  renderGapmap();
  renderGrant();
  replay();
}
init();
