# SAGE — Standards Audit & Gap Evaluator

An open, multi-model auditor that scores an interoperability standard for **AI-agent readiness** and maps where it falls short. Built by the [ORES](https://github.com/open-renewable-energy-systems) community.

> **SAGE finds the gaps, [GAIFARE](#gaifare) fills them.**

**▶ Try it now: https://open-renewable-energy-systems.github.io/AI-audit-benchmark/app/** — view the gap map, or run your own audit from the browser (OpenRouter/Mistral key, or your local Ollama).

Today's microgrid / DER standards describe *what a device can do* — not *what an autonomous agent may do, what it did, or who owns the data.* SAGE runs the **same prompt and metrics across multiple AI models** so the gaps it reports are the ones models *agree* on, not one model's hallucination. GAIFARE is the companion interface contract that fills those gaps while reusing what the standards already do well.

First presented at **LF Energy Summit Europe 2026** — *"AI-Audited: An Open Interface for Autonomous DER Agents on the Microgrid"* (Sept 16, Berlin).

---

## What SAGE does

1. Sends a **frozen system prompt** to several models (identical wording, only the standard name changes).
2. Scores each standard **0–3** on four dimensions, with a **clause citation** and **confidence** per score.
3. Aggregates runs into **convergent findings** (where models agree) and a **gap map** (heatmap of coverage).
4. Everything — prompts, metrics, raw outputs, gap map — is **public and reproducible**.

**The four dimensions:** capability declaration, bounded authority, decision auditability, data governance.

---

## Repo structure

```
AI-audit-benchmark/
  .pre-commit-config.yaml   <- pre-commits to cleanup code on commit
  README.md                 <- this file
  rubric/                   <- frozen system prompt + metrics + JSON schema
  standards/                <- corpus: notes + source pointers per standard
  prompts/                  <- versioned prompt iterations
  runner/                   <- the tool: one prompt -> many models -> JSON
  results/                  <- raw model outputs (standard x model x run)
  gapmap/                   <- aggregated matrix + heatmap
  app/                      <- web UI: view gap map, audit a new standard
  gaifare/                  <- the v0 interface contract that fills the gaps
  docs/                     <- rubric-and-deliverables.md, worked-example.md
```

---

## Quick start (planned)

Note: you'll need to have [UV](https://docs.astral.sh/uv/) installed on your computer for this to work (install instructions are [here](https://docs.astral.sh/uv/getting-started/installation/)).

```bash
cd runner/
cp .env.example .env                # add API keys (Claude, OpenAI, OpenRouter, Mistral) and model targets
uv run evaluate_model_knowledge.py  # Run the comparison
uv run aggregate_to_gap_map.py      # build the gap map
cd ..
open app/index.html             # explore results
```

### Web app — run audits from the browser

The hosted app (https://open-renewable-energy-systems.github.io/AI-audit-benchmark/app/)
can run audits directly: each model slot takes any OpenAI-compatible endpoint —
OpenRouter, Mistral, etc. (your key, stored only in your browser), or local
Ollama (no key). Custom standards can be added by name (knowledge-only) or
document-fed via pasted text, a URL (best-effort; many spec sites block it),
or a PDF (text extracted client-side; nothing is uploaded).

### Run the app locally — step by step

Requirements: Python 3 (any recent version; used only as a static file server)
and a browser. For local models, [Ollama](https://ollama.com/download).

```bash
# 1. Get the code
git clone https://github.com/open-renewable-energy-systems/AI-audit-benchmark.git
cd AI-audit-benchmark

# 2. Serve the repo root (the app loads prompts/ and gapmap/ from here —
#    opening app/index.html as a file will NOT work)
uv run python -m http.server 8642

# 3. Open the app
open http://localhost:8642/app/        # or paste the URL into your browser
```

Then pick a mode in **⚙ Model settings**:

**Local mode (no API keys)** — install [Ollama](https://ollama.com/download),
then pull at least one model:

```bash
ollama pull qwen3:8b        # small/fast local model, or any from ollama.com/library
```

With an ollama.com sign-in (`ollama signin`), the subscription **cloud models**
(deepseek-v4, gpt-oss, mistral-large, kimi, …) also work through the same local
endpoint — the app lists them automatically. On localhost no extra setup is
needed; only when using the *hosted* page against your local Ollama must you
start it with `OLLAMA_ORIGINS=https://open-renewable-energy-systems.github.io`.

Optional — use your claude-code / codex CLI logins as models via the bridge:

```bash
uv run runner/bridge.py   # exposes http://localhost:8765/{claude,codex}/chat/completions
```

CLI-wrapped models run inside the vendor's agent loop — fine for demos, but
use raw API slots for official audit numbers.

**Web mode (API keys)** — no install beyond steps 1–3: choose your provider among:
- [Openrouter](https://openrouter.ai/)
- [Mistral AI](https://mistral.ai/pricing/api/)

If you don't have an account with any of them, you'll first have to create one. Then generate an API key (note: usage of this API key will incur costs, so keep it safe). Then copy/paste your key (stored only in your browser), or pick
*custom* for any other OpenAI-compatible endpoint.

Finally:
- **Test** each model until it shows ✓,
- pick standards and runs-per-model,
- **▶ Run audit**,
- and export the result JSONs into `results/`

(note: `uv run runner/aggregate_to_gap_map.py` folds the JSON results into the published gap map.)

---

## Status

Early development ahead of the LF Energy Summit. Roadmap:

- [ ] `rubric/` frozen (system prompt + metrics)
- [ ] `runner/` sends one prompt to N models, writes JSON
- [ ] `results/` for the initial standards corpus
- [ ] `gapmap/` aggregation + heatmap
- [ ] `app/` gap-map viewer + "audit a new standard" form
- [ ] `gaifare/` v0 spec + Hyphae example

## <a name="gaifare"></a>GAIFARE

The interface contract that fills the gaps SAGE finds — adding the layer between *what a device can do* and *what an agent is allowed to do* (bounded authority, decision auditability, data governance), while mapping onto existing standards rather than replacing them. See `gaifare/spec-v0.md`.

## Contributing

SAGE is designed to be pointed at **any** interoperability standard, not just the microgrid corpus. To audit a new standard, add it under `standards/`, run the auditor, and open a PR with the results. Issues and discussion in the [ORES repo](https://github.com/open-renewable-energy-systems/ores).

## License

The code is licensed under Apache-2.0 for the code. The docs and Gap Map is licensed under CC-BY-4.0.
