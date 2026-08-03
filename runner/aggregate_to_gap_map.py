"""
Aggregate per-run result JSONs into gapmap/gap-map.json.

Input:  results/{Standard}--{model}--iteration_{n}.json  (schema per
        prompts/eval_system_prompt.md: 4 dimensions, each with score,
        evidence, rationale, confidence)
Output: gapmap/gap-map.json consumed by app/ — per standard x dimension:
        a convergent score (or contested), plus per-model detail with
        self-consistency across iterations.

Rules (docs/rubric-and-deliverables.md):
- self-consistent  : a model's scores for one cell spread <= 1 across runs
- convergent       : model medians for one cell spread <= 1 across models
- contested        : otherwise -> score is null, reported not claimed
Convergence is only claimable with >= 2 models; the JSON carries
model_count so the app can caveat single-model data.
"""

import json
import statistics
from pathlib import Path

DIMENSIONS = [
    "capability_declaration",
    "bounded_authority",
    "decision_auditability",
    "data_governance",
]

REPO_ROOT = Path(__file__).parent.parent
RESULTS_DIR = REPO_ROOT / "results"
GAPMAP_DIR = REPO_ROOT / "gapmap"


def load_runs():
    """{standard: {model: [run_dict, ...]}} from results/*.json."""
    runs = {}
    for path in sorted(RESULTS_DIR.glob("*.json")):
        standard, model, _iteration = path.stem.split("--")
        with open(path) as f:
            data = json.load(f)
        missing = [d for d in DIMENSIONS if d not in data]
        if missing:
            raise ValueError(f"{path.name} is missing dimensions: {missing}")
        runs.setdefault(standard, {}).setdefault(model, []).append(data)
    if not runs:
        raise FileNotFoundError(f"no result JSONs found in {RESULTS_DIR}")
    return runs


def summarize_model_cell(model, model_runs, dim):
    """Per-model stats for one standard x dimension cell."""
    cells = [r[dim] for r in model_runs]
    scores = [c["score"] for c in cells]
    median = statistics.median(scores)
    # Representative evidence/rationale: the run whose score is closest to the median
    rep = min(cells, key=lambda c: abs(c["score"] - median))
    return {
        "model": model,
        "median_score": median,
        "min_score": min(scores),
        "max_score": max(scores),
        "runs": len(scores),
        "self_consistent": max(scores) - min(scores) <= 1,
        "evidence": rep["evidence"],
        "rationale": rep["rationale"],
        "mean_confidence": round(statistics.fmean(c["confidence"] for c in cells), 2),
    }


def aggregate_cell(model_runs_by_model, dim):
    """Cross-model aggregation for one cell -> convergent score or contested."""
    per_model = [
        summarize_model_cell(m, r, dim) for m, r in sorted(model_runs_by_model.items())
    ]
    medians = [p["median_score"] for p in per_model]
    contested = max(medians) - min(medians) > 1
    return {
        "score": None if contested else round(statistics.median(medians)),
        "contested": contested,
        "per_model": per_model,
    }


def build_gap_map(runs):
    models = sorted({m for by_model in runs.values() for m in by_model})
    return {
        "generated_by": "runner/aggregate_to_gap_map.py",
        "model_count": len(models),
        "models": models,
        "convergence_claimable": len(models) >= 2,
        "dimensions": DIMENSIONS,
        "standards": [
            {
                "standard": standard,
                "display_name": standard.replace("_", " "),
                "cells": {dim: aggregate_cell(by_model, dim) for dim in DIMENSIONS},
            }
            for standard, by_model in sorted(runs.items())
        ],
    }


def main():
    gap_map = build_gap_map(load_runs())
    GAPMAP_DIR.mkdir(exist_ok=True)
    out = GAPMAP_DIR / "gap-map.json"
    with open(out, "w") as f:
        json.dump(gap_map, f, indent=2)
    n_cells = len(gap_map["standards"]) * len(DIMENSIONS)
    contested = sum(
        c["contested"] for s in gap_map["standards"] for c in s["cells"].values()
    )
    print(
        f"wrote {out} — {len(gap_map['standards'])} standards x "
        f"{len(DIMENSIONS)} dimensions ({n_cells} cells, {contested} contested) "
        f"from {gap_map['model_count']} model(s): {', '.join(gap_map['models'])}"
    )
    if not gap_map["convergence_claimable"]:
        print("WARNING: only 1 model — cross-model convergence is not claimable yet.")


if __name__ == "__main__":
    main()
