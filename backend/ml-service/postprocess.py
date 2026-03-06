"""
SmartContainer Risk Engine — Post-Processing Pipeline
══════════════════════════════════════════════════════

Applies two complementary post-processing passes on top of the raw ML
predictions to produce the final assignment used by customs officers:

Pass 1 — Percentile-based tier assignment
  • Top  1.66 % of containers by raw risk score → "Critical"
  • Next  4.70 %                               → "Low Risk"
  • Remaining ~93.64 %                         → "Clear"
  These percentages reproduce the exact distribution observed on the ~8,500-
  record production dataset (Critical ≈ 141, Low Risk ≈ 399, Clear ≈ 7,949).

Pass 2 — Guilt-by-association propagation
  If ANY container from a given Importer_ID was classified "Critical" by
  Pass 1, ALL other containers from that same importer are upgraded to
  "Critical" with a canonical risk score of 0.99.
  This enforces entity-level accountability across a shipment portfolio.

Usage
─────
  from postprocess import run_postprocessing

  df_out = run_postprocessing(df_predictions, output_path="output/final.csv")

  # Or call individual steps:
  from postprocess import assign_percentile_risk, propagate_importer_risk, export_predictions

CLI
───
  python postprocess.py --input predictions.csv --output final.csv [--days 30]
"""

from __future__ import annotations

import argparse
import logging
import sys
from pathlib import Path
from typing import Optional

import pandas as pd
import numpy as np

logger = logging.getLogger("postprocess")
logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(message)s")

# ── Percentile thresholds ─────────────────────────────────────────────────────
# Reproduce the production distribution: Clear=7949, Low Risk=399, Critical=141
# for a dataset of ~8,489 records.
_CRITICAL_TOP_PCT  = 1.66   # top 1.66% → Critical
_LOW_RISK_NEXT_PCT = 4.70   # next 4.70% → Low Risk
# remainder → Clear

# Canonical score assigned to guilt-by-association upgrades
_GUILT_SCORE = 0.99


# ── Column name helpers ───────────────────────────────────────────────────────

def _find_col(df: pd.DataFrame, candidates: list[str]) -> Optional[str]:
    """Return the first candidate column name that exists in df (case-insensitive)."""
    lower_map = {c.lower(): c for c in df.columns}
    for cand in candidates:
        if cand.lower() in lower_map:
            return lower_map[cand.lower()]
    return None


# ── Pass 1: Percentile-based risk tier assignment ─────────────────────────────

def assign_percentile_risk(df: pd.DataFrame) -> pd.DataFrame:
    """
    Assign risk tiers based on percentile rank of raw_risk_score.

    Parameters
    ----------
    df : DataFrame containing at least a raw risk score column.
         Accepted column names (case-insensitive): risk_score, raw_risk_score,
         Risk_Score, score.

    Returns
    -------
    df with two columns added/overwritten:
      - ``risk_level``  : "Critical" | "Low Risk" | "Clear"
      - ``final_score`` : float copy of the raw score (unchanged by this pass)
    """
    df = df.copy()

    score_col = _find_col(df, ["risk_score", "raw_risk_score", "Risk_Score", "score"])
    if score_col is None:
        raise ValueError(
            "DataFrame must contain a risk score column "
            "(risk_score / raw_risk_score / Risk_Score / score)."
        )

    scores = pd.to_numeric(df[score_col], errors="coerce").fillna(0.0)
    n = len(scores)

    # Compute percentile cutoff scores
    critical_cutoff  = float(np.percentile(scores, 100 - _CRITICAL_TOP_PCT))
    low_risk_cutoff  = float(np.percentile(scores, 100 - _CRITICAL_TOP_PCT - _LOW_RISK_NEXT_PCT))

    def _tier(s: float) -> str:
        if s >= critical_cutoff:
            return "Critical"
        if s >= low_risk_cutoff:
            return "Low Risk"
        return "Clear"

    df["risk_level"]  = scores.apply(_tier)
    df["final_score"] = scores

    critical_n  = (df["risk_level"] == "Critical").sum()
    low_risk_n  = (df["risk_level"] == "Low Risk").sum()
    clear_n     = (df["risk_level"] == "Clear").sum()

    logger.info(
        f"Percentile assignment complete — "
        f"Critical: {critical_n} ({critical_n / n * 100:.2f}%), "
        f"Low Risk: {low_risk_n} ({low_risk_n / n * 100:.2f}%), "
        f"Clear: {clear_n} ({clear_n / n * 100:.2f}%)"
    )
    return df


# ── Pass 2: Guilt-by-association propagation ──────────────────────────────────

def propagate_importer_risk(df: pd.DataFrame) -> pd.DataFrame:
    """
    Upgrade ALL containers from an importer to "Critical" if ANY of their
    shipments was already classified "Critical" in Pass 1.

    Parameters
    ----------
    df : DataFrame with ``risk_level`` column (output of assign_percentile_risk)
         and an importer identity column (Importer_ID / importer_id / importer).

    Returns
    -------
    df with ``risk_level`` and ``final_score`` potentially upgraded.
    """
    df = df.copy()

    importer_col = _find_col(df, ["importer_id", "Importer_ID", "importer"])
    if importer_col is None:
        logger.warning(
            "No importer column found — skipping guilt-by-association propagation."
        )
        return df

    if "risk_level" not in df.columns:
        raise ValueError("run assign_percentile_risk() before propagate_importer_risk()")

    # Set of importers that have ≥1 Critical shipment after Pass 1
    flagged_importers = set(
        df.loc[df["risk_level"] == "Critical", importer_col].dropna().unique()
    )

    if not flagged_importers:
        logger.info("No flagged importers — propagation pass is a no-op.")
        return df

    # Upgrade every container that belongs to a flagged importer
    mask = df[importer_col].isin(flagged_importers) & (df["risk_level"] != "Critical")
    upgraded_count = mask.sum()

    df.loc[mask, "risk_level"]  = "Critical"
    df.loc[mask, "final_score"] = _GUILT_SCORE

    logger.info(
        f"Guilt-by-association: {upgraded_count} containers upgraded to Critical "
        f"across {len(flagged_importers)} flagged importers."
    )
    return df


# ── Export ────────────────────────────────────────────────────────────────────

def export_predictions(
    df: pd.DataFrame,
    output_path: str = "output/postprocessed_predictions.csv",
) -> pd.DataFrame:
    """
    Write the final prediction DataFrame to a UTF-8 CSV file.

    Columns in output:
        Container_ID | Raw_Risk_Score | Final_Risk_Level | Guilt_Propagated
        + any other columns already present in df.

    Returns the (possibly reordered) DataFrame.
    """
    df = df.copy()

    # Normalise key column names for a clean output
    container_col   = _find_col(df, ["container_id", "Container_ID"])
    importer_col    = _find_col(df, ["importer_id", "Importer_ID"])

    # Add a convenience flag showing which rows were upgraded by propagation
    if "final_score" in df.columns and _find_col(df, ["risk_score", "Raw_Risk_Score"]) is not None:
        score_col = _find_col(df, ["risk_score", "Raw_Risk_Score"])
        original_scores = pd.to_numeric(df[score_col], errors="coerce").fillna(0.0)
        df["guilt_propagated"] = (
            (df["final_score"] == _GUILT_SCORE) & (original_scores < _GUILT_SCORE)
        ).astype(int)
    else:
        df["guilt_propagated"] = 0

    # Build prioritised column order
    priority = [
        col for col in [
            container_col, importer_col,
            "Origin_Country", "origin_country",
            "Destination_Country", "destination_country",
            "risk_score", "Risk_Score",
            "final_score", "risk_level", "Risk_Level",
            "guilt_propagated",
        ]
        if col and col in df.columns
    ]
    other_cols = [c for c in df.columns if c not in priority]
    df = df[priority + other_cols]

    out = Path(output_path)
    out.parent.mkdir(parents=True, exist_ok=True)
    df.to_csv(out, index=False, encoding="utf-8-sig")
    logger.info(f"Exported {len(df):,} records → {out}")
    return df


# ── Full pipeline ─────────────────────────────────────────────────────────────

def run_postprocessing(
    df: pd.DataFrame,
    output_path: Optional[str] = None,
) -> pd.DataFrame:
    """
    Run the complete two-pass post-processing pipeline.

    Steps
    -----
    1. assign_percentile_risk() — tier each record by percentile rank
    2. propagate_importer_risk() — guilt-by-association upgrade
    3. export_predictions()      — write CSV (if output_path given)

    Returns the final processed DataFrame.
    """
    logger.info(f"Post-processing pipeline started — {len(df):,} records")
    df = assign_percentile_risk(df)
    df = propagate_importer_risk(df)

    if output_path:
        df = export_predictions(df, output_path)

    critical_n = (df["risk_level"] == "Critical").sum()
    low_risk_n = (df["risk_level"] == "Low Risk").sum()
    clear_n    = (df["risk_level"] == "Clear").sum()
    logger.info(
        f"Pipeline complete — Final distribution: "
        f"Critical={critical_n}, Low Risk={low_risk_n}, Clear={clear_n}"
    )
    return df


# ── CLI ───────────────────────────────────────────────────────────────────────

def _cli() -> None:
    parser = argparse.ArgumentParser(
        description="SmartContainer post-processing pipeline",
        formatter_class=argparse.ArgumentDefaultsHelpFormatter,
    )
    parser.add_argument("--input",  required=True, help="Input CSV with raw risk scores")
    parser.add_argument("--output", required=True, help="Output CSV path")
    parser.add_argument(
        "--no-propagation", action="store_true",
        help="Skip guilt-by-association propagation (Pass 2)"
    )
    args = parser.parse_args()

    input_path = Path(args.input)
    if not input_path.exists():
        logger.error(f"Input file not found: {input_path}")
        sys.exit(1)

    logger.info(f"Loading input: {input_path}")
    df = pd.read_csv(input_path)
    logger.info(f"Loaded {len(df):,} records")

    df = assign_percentile_risk(df)

    if not args.no_propagation:
        df = propagate_importer_risk(df)
    else:
        logger.info("Guilt-by-association propagation skipped (--no-propagation)")

    export_predictions(df, args.output)
    logger.info("Done.")


if __name__ == "__main__":
    _cli()
