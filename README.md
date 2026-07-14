# SAGE — Standards Audit & Gap Evaluator

An open, multi-model auditor that scores an interoperability standard for **AI-agent readiness** and maps where it falls short. Built by the [ORES](https://github.com/open-renewable-energy-systems) community.

> **SAGE finds the gaps, [GAIFARE](#gaifare) fills them.**

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

                    ```bash
                    cp runner/.env.example runner/.env     # add API keys (Claude, OpenAI, OpenRouter, Mistral)
                    python runner/run.py --standard "IEEE 2030.5" --models all --runs 3
                    python runner/aggregate.py             # build the gap map
                    open app/index.html                    # explore results
                    ```

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

                    TBD (recommend Apache-2.0 for the code, CC-BY-4.0 for the docs/gap map).
                    
