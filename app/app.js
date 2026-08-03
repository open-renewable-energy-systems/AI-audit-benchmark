// SAGE demo app — renders the gap map + Hyphae scenario replay from data.js.

function scoreClass(s) {
  return s === null ? "contested" : "s" + s;
}

function renderGapmap() {
  const table = document.getElementById("gapmap");
  const head = document.createElement("tr");
  head.innerHTML =
    "<th></th>" + DIMENSIONS.map((d) => `<th>${d.label}</th>`).join("");
  table.appendChild(head);

  GAPMAP.forEach((row) => {
    const tr = document.createElement("tr");
    tr.innerHTML = `<th class="rowhead">${row.standard}</th>`;
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
  html += `<table><tr><th>Model</th><th>Score</th><th>Evidence</th><th>Rationale</th><th>Conf.</th></tr>`;
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
if (!MOCK) document.getElementById("mockBadge").hidden = true;

renderGapmap();
renderGrant();
replay();
