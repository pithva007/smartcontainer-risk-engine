"""
ML Training Pipeline
Trains a Hybrid Ensemble (XGBoost + Random Forest + Isolation Forest) on container
shipment data to predict risk scores.  Mirrors the pipeline in the Jupyter notebook
(smartcontainerfinal.ipynb) so that POST /train produces the same model artefacts
that the notebook saves in cell 7b.

Usage:
    python train_model.py                         # train on synthetic data
    python train_model.py --data path/to/data.csv # train on real dataset
"""

import os
import sys
import logging
import pickle
import json
import argparse
import numpy as np
import pandas as pd
from pathlib import Path
from datetime import datetime, timezone

import joblib
from sklearn.ensemble import RandomForestClassifier, IsolationForest
from sklearn.model_selection import train_test_split, cross_val_score
from sklearn.preprocessing import LabelEncoder, StandardScaler
from sklearn.metrics import (
    accuracy_score,
    f1_score,
    roc_auc_score,
    roc_curve,
    classification_report,
)
try:
    from xgboost import XGBClassifier
    _HAS_XGB = True
except ImportError:
    _HAS_XGB = False

logger = logging.getLogger("train_model")

# ── Paths ─────────────────────────────────────────────────────────────────────
BASE_DIR   = Path(__file__).parent
MODELS_DIR = BASE_DIR / "models"
MODELS_DIR.mkdir(exist_ok=True)

# Legacy RF paths (kept for backward compat)
RISK_MODEL_PATH = MODELS_DIR / "risk_model.pkl"
SCALER_PATH     = MODELS_DIR / "scaler.pkl"
ENCODER_PATH    = MODELS_DIR / "encoders.pkl"
METRICS_PATH    = MODELS_DIR / "training_metrics.json"

# Ensemble paths (primary)
ENSEMBLE_XGB_PATH = MODELS_DIR / "ensemble_xgb_model.pkl"
ENSEMBLE_RF_PATH  = MODELS_DIR / "ensemble_rf_model.pkl"
ENSEMBLE_ISO_PATH = MODELS_DIR / "ensemble_iso_model.pkl"
ENSEMBLE_ART_PATH = MODELS_DIR / "ensemble_artifacts.pkl"

# ── Notebook-mirror constants ────────────────────────────────────────────────
EPS           = 1e-5
LAPLACE_ALPHA = 10
THRESHOLD     = 30          # score ≥ 30/100 → risky
W_XGB, W_RF, W_IF = 0.50, 0.30, 0.20

RISK_STATUSES = {"critical", "hold", "inspect", "detained", "flagged"}

NUM_COLS = ["Declared_Value", "Declared_Weight", "Measured_Weight", "Dwell_Time_Hours"]
CAT_COLS = [
    "Trade_Regime", "Origin_Country", "Destination_Country",
    "Destination_Port", "Shipping_Line",
]
IF_FEATURES = [
    "weight_diff", "weight_ratio", "density",
    "commodity_weight_zscore", "dwell_time_zscore", "value_per_weight",
]
FEATURE_COLS = [
    "Trade_Regime", "Origin_Country", "Destination_Country",
    "Destination_Port", "Shipping_Line",
    "Declared_Value", "Declared_Weight", "Measured_Weight",
    "Dwell_Time_Hours", "declaration_month", "declaration_dow",
    "weight_diff", "weight_ratio", "weight_deviation_pct",
    "commodity_weight_zscore", "exporter_weight_deviation",
    "density", "value_per_weight", "dwell_time_zscore",
    "exporter_risk_rate", "importer_risk_rate", "route_risk_score",
]

# Column rename map for raw notebook CSVs
_COL_RENAME = {
    "Declaration_Date (YYYY-MM-DD)":            "Declaration_Date",
    "Trade_Regime (Import / Export / Transit)": "Trade_Regime",
}

# ── Legacy feature columns (used only when saving the RF fallback) ────────────
LEGACY_NUMERIC_FEATURES = [
    "declared_value", "declared_weight", "measured_weight", "dwell_time_hours",
    "weight_difference", "weight_mismatch_percentage", "value_to_weight_ratio",
    "high_dwell_time_flag", "importer_frequency", "exporter_frequency", "trade_route_risk",
]
LEGACY_CATEGORICAL_FEATURES = ["origin_country", "destination_country",
                                "trade_regime", "clearance_status"]
ALL_LEGACY_FEATURES = LEGACY_NUMERIC_FEATURES + [
    f"{c}_encoded" for c in LEGACY_CATEGORICAL_FEATURES
]

# ── Legacy feature engineering helpers (used for synthetic-data fallback) ─────

def _legacy_engineer(df: pd.DataFrame) -> pd.DataFrame:
    """Simple feature engineering for the legacy RF fallback model."""
    df = df.copy()
    for col in ["declared_weight", "measured_weight", "declared_value", "dwell_time_hours"]:
        df[col] = pd.to_numeric(df[col], errors="coerce").fillna(0)

    df["weight_difference"] = (df["declared_weight"] - df["measured_weight"]).abs()
    df["weight_mismatch_percentage"] = np.where(
        df["declared_weight"] > 0,
        (df["weight_difference"] / df["declared_weight"]) * 100,
        0,
    )
    ref_w = np.where(df["measured_weight"] > 0, df["measured_weight"], df["declared_weight"])
    df["value_to_weight_ratio"] = np.where(ref_w > 0, df["declared_value"] / ref_w, 0)
    df["high_dwell_time_flag"]  = (df["dwell_time_hours"] > 72).astype(int)

    imp_freq = df["importer_id"].value_counts().to_dict()
    exp_freq = df["exporter_id"].value_counts().to_dict()
    df["importer_frequency"] = df["importer_id"].map(imp_freq).fillna(1)
    df["exporter_frequency"] = df["exporter_id"].map(exp_freq).fillna(1)

    route_key = df["origin_country"].fillna("") + "->" + df["destination_country"].fillna("")
    if "risk_label" in df.columns:
        route_risk = df.groupby(route_key)["risk_label"].mean().to_dict()
        df["trade_route_risk"] = route_key.map(route_risk).fillna(0)
    else:
        rc = route_key.value_counts()
        mc = rc.max() if len(rc) > 0 else 1
        df["trade_route_risk"] = route_key.map(lambda k: 1 - rc.get(k, 0) / mc)
    return df


def _legacy_encode(df: pd.DataFrame, encoders: dict = None, fit: bool = True):
    """Label-encode legacy categorical features.  Returns (df, encoders)."""
    if encoders is None:
        encoders = {}
    for col in LEGACY_CATEGORICAL_FEATURES:
        enc_col = f"{col}_encoded"
        if col not in df.columns:
            df[col] = "Unknown"
        df[col] = df[col].fillna("Unknown").astype(str)
        if fit:
            le = LabelEncoder()
            df[enc_col] = le.fit_transform(df[col])
            encoders[col] = le
        else:
            le = encoders.get(col)
            if le:
                known = set(le.classes_)
                df[col] = df[col].apply(lambda x: x if x in known else "Unknown")
                if "Unknown" not in le.classes_:
                    le.classes_ = np.append(le.classes_, "Unknown")
                df[enc_col] = le.transform(df[col])
            else:
                df[enc_col] = 0
    return df, encoders


# ── Notebook-mirror: ensemble feature engineering ─────────────────────────────

def _preprocess(df: pd.DataFrame, has_label: bool = True) -> pd.DataFrame:
    """Replicate notebook preprocess(): typing, imputation, temporal features, label."""
    df = df.copy()
    # Guard: create column as proper datetime dtype even when absent
    if "Declaration_Date" not in df.columns:
        df["Declaration_Date"] = pd.NaT
    df["Declaration_Date"] = pd.to_datetime(df["Declaration_Date"], errors="coerce")
    df["declaration_month"] = df["Declaration_Date"].dt.month.fillna(1).astype(int)
    df["declaration_dow"]   = df["Declaration_Date"].dt.dayofweek.fillna(0).astype(int)

    for col in NUM_COLS:
        if col not in df.columns:
            df[col] = 0.0
        df[col] = pd.to_numeric(df[col], errors="coerce")
        df[col] = df[col].fillna(df[col].median())

    for col in ["Declared_Value", "Declared_Weight"]:
        df[col] = df[col].clip(upper=df[col].quantile(0.99))

    for col in CAT_COLS:
        if col not in df.columns:
            df[col] = "Unknown"
        _mode = df[col].mode()
        df[col] = df[col].fillna(_mode[0] if not _mode.empty else "Unknown")

    for id_col, default in [("HS_Code", "0000"), ("Exporter_ID", "EXP000"),
                             ("Importer_ID", "IMP000"), ("Clearance_Status", "Unknown")]:
        if id_col not in df.columns:
            df[id_col] = default
        df[id_col] = df[id_col].fillna(default).astype(str)

    if has_label and "Clearance_Status" in df.columns:
        df["Risk_Label"] = (
            df["Clearance_Status"].str.strip().str.lower()
            .isin(RISK_STATUSES).astype(int)
        )
    return df


def _compute_train_stats(df: pd.DataFrame) -> dict:
    """Compute benchmark statistics from training split only (Laplace smoothing)."""
    stats: dict = {}

    hs_grp = df.groupby("HS_Code")["Declared_Weight"]
    stats["hs_avg"]        = hs_grp.mean()
    stats["hs_std"]        = hs_grp.std().fillna(1)
    stats["hs_global_avg"] = df["Declared_Weight"].mean()
    stats["hs_global_std"] = max(df["Declared_Weight"].std(), 1)

    exp_grp = df.groupby("Exporter_ID")["Declared_Weight"]
    stats["exp_avg"]        = exp_grp.mean()
    stats["exp_std"]        = exp_grp.std().fillna(1)
    stats["exp_global_avg"] = df["Declared_Weight"].mean()
    stats["exp_global_std"] = max(df["Declared_Weight"].std(), 1)

    stats["dwell_mean"] = df["Dwell_Time_Hours"].mean()
    stats["dwell_std"]  = max(df["Dwell_Time_Hours"].std(), 1)

    if "Risk_Label" in df.columns:
        global_rate = df["Risk_Label"].mean()
        stats["global_risk_rate"] = global_rate

        for col, key in [("Exporter_ID", "exporter_risk_rate"),
                          ("Importer_ID", "importer_risk_rate")]:
            grp = df.groupby(col)["Risk_Label"]
            s = grp.sum();  c = grp.count()
            stats[key] = (s + LAPLACE_ALPHA * global_rate) / (c + LAPLACE_ALPHA)

        df2 = df.copy()
        df2["_route"] = df2["Origin_Country"] + "_" + df2["Destination_Country"]
        rgrp = df2.groupby("_route")["Risk_Label"]
        rs = rgrp.sum();  rc = rgrp.count()
        stats["route_risk_score"] = (rs + LAPLACE_ALPHA * global_rate) / (rc + LAPLACE_ALPHA)
    return stats


def _engineer_ensemble(df: pd.DataFrame, train_stats: dict) -> pd.DataFrame:
    """Mirror notebook engineer_features()."""
    df = df.copy()
    df["weight_diff"]          = df["Measured_Weight"] - df["Declared_Weight"]
    df["weight_ratio"]         = df["Measured_Weight"] / (df["Declared_Weight"] + EPS)
    df["weight_deviation_pct"] = (df["weight_diff"].abs() / (df["Declared_Weight"] + EPS)).clip(upper=0.5)

    hs_avg = train_stats.get("hs_avg", pd.Series(dtype=float))
    hs_std = train_stats.get("hs_std", pd.Series(dtype=float))
    df["commodity_avg_weight"] = df["HS_Code"].map(hs_avg).fillna(train_stats.get("hs_global_avg", 0))
    df["commodity_std_weight"] = df["HS_Code"].map(hs_std).fillna(train_stats.get("hs_global_std", 1))
    df["commodity_weight_zscore"] = (
        (df["Declared_Weight"] - df["commodity_avg_weight"])
        / (df["commodity_std_weight"] + EPS)
    ).clip(-3, 3)

    exp_avg = train_stats.get("exp_avg", pd.Series(dtype=float))
    exp_std = train_stats.get("exp_std", pd.Series(dtype=float))
    df["exporter_avg_weight"] = df["Exporter_ID"].map(exp_avg).fillna(train_stats.get("exp_global_avg", 0))
    df["exporter_weight_deviation"] = (
        (df["Declared_Weight"] - df["exporter_avg_weight"])
        / (df["Exporter_ID"].map(exp_std).fillna(train_stats.get("exp_global_std", 1)) + EPS)
    ).clip(-3, 3)

    df["density"]          = df["Measured_Weight"] / (df["Declared_Value"] + EPS)
    df["value_per_weight"] = df["Declared_Value"]  / (df["Declared_Weight"] + EPS)

    dwell_mean = train_stats.get("dwell_mean", 48)
    dwell_std  = max(train_stats.get("dwell_std", 24), 1)
    df["dwell_time_zscore"] = ((df["Dwell_Time_Hours"] - dwell_mean) / (dwell_std + EPS)).clip(-3, 3)

    global_rate = train_stats.get("global_risk_rate", 0.01)
    df["exporter_risk_rate"] = df["Exporter_ID"].map(
        train_stats.get("exporter_risk_rate", pd.Series(dtype=float))).fillna(global_rate)
    df["importer_risk_rate"] = df["Importer_ID"].map(
        train_stats.get("importer_risk_rate", pd.Series(dtype=float))).fillna(global_rate)
    df["_route"] = df["Origin_Country"] + "_" + df["Destination_Country"]
    df["route_risk_score"] = df["_route"].map(
        train_stats.get("route_risk_score", pd.Series(dtype=float))).fillna(global_rate)
    df.drop(columns=["_route"], inplace=True)
    return df


def _encode_ensemble(df: pd.DataFrame, fit: bool = True, encoders: dict = None):
    """Label-encode CAT_COLS; returns (df, encoders)."""
    df = df.copy()
    if encoders is None:
        encoders = {}
    for col in CAT_COLS:
        if col not in df.columns:
            df[col] = "Unknown"
        if fit:
            le = LabelEncoder()
            df[col] = le.fit_transform(df[col].astype(str))
            encoders[col] = le
        else:
            le = encoders[col]
            known = set(le.classes_)
            df[col] = df[col].astype(str).apply(lambda v: v if v in known else le.classes_[0])
            df[col] = le.transform(df[col])
    return df, encoders


# ── Synthetic data generator ───────────────────────────────────────────────────

def generate_synthetic_data(n_samples: int = 3000) -> pd.DataFrame:
    """
    Generate synthetic container shipment records in notebook PascalCase format
    for use when no real dataset is provided.
    """
    rng = np.random.default_rng(42)

    countries      = ["China","India","USA","Germany","Brazil","Nigeria","Vietnam","Turkey","Mexico","UAE"]
    ports          = ["Rotterdam","Shanghai","Mumbai","Hamburg","Dubai","Singapore","Los Angeles","Hong Kong"]
    regimes        = ["Import","Export","Transit","Re-export"]
    statuses       = ["Cleared","Critical","Hold","Inspect","Released","Detained","Flagged"]
    shipping_lines = ["Maersk","MSC","CMA CGM","COSCO","Hapag-Lloyd","Evergreen"]

    df = pd.DataFrame({
        "Container_ID":         [f"C{10000+i}" for i in range(n_samples)],
        "Origin_Country":       rng.choice(countries, n_samples),
        "Destination_Country":  rng.choice(countries, n_samples),
        "Destination_Port":     rng.choice(ports, n_samples),
        "Trade_Regime":         rng.choice(regimes, n_samples),
        "Clearance_Status":     rng.choice(statuses, n_samples),
        "Shipping_Line":        rng.choice(shipping_lines, n_samples),
        "Importer_ID":          [f"IMP{rng.integers(100,600)}" for _ in range(n_samples)],
        "Exporter_ID":          [f"EXP{rng.integers(100,400)}" for _ in range(n_samples)],
        "Declared_Value":       np.abs(rng.normal(50000, 30000, n_samples)),
        "Declared_Weight":      np.abs(rng.normal(5000,  2000,  n_samples)),
        "Dwell_Time_Hours":     np.abs(rng.exponential(48, n_samples)),
        "HS_Code":              [f"{rng.integers(10,99)}{rng.integers(10,99)}" for _ in range(n_samples)],
    })

    anomaly_mask = rng.random(n_samples) < 0.15
    df["Measured_Weight"] = df["Declared_Weight"] * rng.uniform(0.95, 1.05, n_samples)
    df.loc[anomaly_mask, "Measured_Weight"] = (
        df.loc[anomaly_mask, "Declared_Weight"]
        * rng.uniform(0.3, 3.0, anomaly_mask.sum())
    )
    return df


# ── Primary training pipeline (ensemble) ──────────────────────────────────────

def run_training_pipeline(data_path: str = None) -> dict:
    """
    Full ensemble training pipeline mirroring the Jupyter notebook:
      1.  Load real data (CSV/Excel) or generate synthetic PascalCase data
      2.  Normalise column names
      3.  Preprocess (type coercion, imputation, temporal features, label)
      4.  Leak-free split: stratified 80/20 BEFORE any statistics
      5.  Compute benchmark stats from TRAIN split only (Laplace smoothing)
      6.  Feature engineering on train + val using train-only stats
      7.  Fit LabelEncoders on train, transform val
      8.  Fit StandardScaler on train, transform val
      9.  Train XGBoost + RandomForest classifiers (balanced)
      10. Train Isolation Forest on numeric anomaly features
      11. Evaluate on validation set
      12. Save ensemble artefacts + legacy RF files
    """
    logger.info("Starting ensemble training pipeline")

    # ── 1. Load data ──────────────────────────────────────────────────────────
    if data_path and Path(data_path).exists():
        logger.info(f"Loading data from {data_path}")
        ext = Path(data_path).suffix.lower()
        if ext == ".csv":
            df_raw = pd.read_csv(data_path)
        else:
            df_raw = pd.read_excel(data_path)

        # 2. Normalise column names
        # Accept both notebook PascalCase and flat lowercase formats
        df_raw = df_raw.rename(columns=_COL_RENAME)
        # If the dataset uses lowercase, map key columns to PascalCase
        lc_to_pc = {
            "container_id": "Container_ID", "origin_country": "Origin_Country",
            "destination_country": "Destination_Country", "destination_port": "Destination_Port",
            "trade_regime": "Trade_Regime", "clearance_status": "Clearance_Status",
            "shipping_line": "Shipping_Line", "importer_id": "Importer_ID",
            "exporter_id": "Exporter_ID", "hs_code": "HS_Code",
            "declared_value": "Declared_Value", "declared_weight": "Declared_Weight",
            "measured_weight": "Measured_Weight", "dwell_time_hours": "Dwell_Time_Hours",
            "declaration_date": "Declaration_Date",
        }
        df_raw = df_raw.rename(columns={k: v for k, v in lc_to_pc.items() if k in df_raw.columns})
    else:
        logger.info("No data file provided — generating synthetic training data")
        df_raw = generate_synthetic_data(n_samples=3000)

    logger.info(f"Dataset size: {len(df_raw)} rows")

    # ── 3. Preprocess (also creates Risk_Label) ───────────────────────────────
    df = _preprocess(df_raw, has_label=True)

    if "Risk_Label" not in df.columns:
        raise ValueError(
            "Could not derive Risk_Label. Data must include 'Clearance_Status' "
            "with values like 'critical', 'hold', 'inspect', 'detained', 'flagged'."
        )

    pos_rate = df["Risk_Label"].mean()
    logger.info(f"Risk_Label positive rate: {pos_rate:.3%}")

    # ── 4. Leak-free stratified split ─────────────────────────────────────────
    indices = df.index.values
    y_all   = df["Risk_Label"].values
    tr_idx, val_idx = train_test_split(
        indices, test_size=0.2, stratify=y_all, random_state=42
    )
    df_train_raw = df.loc[tr_idx].copy()
    df_val_raw   = df.loc[val_idx].copy()
    logger.info(f"Train: {len(df_train_raw)}, Val: {len(df_val_raw)}")

    # ── 5. Compute stats from TRAIN only ──────────────────────────────────────
    train_stats = _compute_train_stats(df_train_raw)

    # ── 6. Feature engineering ────────────────────────────────────────────────
    df_train_eng = _engineer_ensemble(df_train_raw, train_stats)
    df_val_eng   = _engineer_ensemble(df_val_raw,   train_stats)

    # ── 7. Fit encoders on train, apply to val ────────────────────────────────
    df_train_enc, encoders = _encode_ensemble(df_train_eng, fit=True)
    df_val_enc, _          = _encode_ensemble(df_val_eng,   fit=False, encoders=encoders)

    # ── 8. Feature selection ──────────────────────────────────────────────────
    avail_cols = [c for c in FEATURE_COLS if c in df_train_enc.columns]
    X_train_df = df_train_enc[avail_cols].fillna(0)
    X_val_df   = df_val_enc[avail_cols].fillna(0)
    y_train    = df_train_enc["Risk_Label"].astype(int)
    y_val      = df_val_enc["Risk_Label"].astype(int)

    # StandardScaler on numeric features only
    num_feats = [c for c in avail_cols if c not in CAT_COLS]
    scaler    = StandardScaler()
    X_train_df[num_feats] = scaler.fit_transform(X_train_df[num_feats])
    X_val_df[num_feats]   = scaler.transform(X_val_df[num_feats])

    # ── 9. Train classifiers ──────────────────────────────────────────────────
    neg_count = (y_train == 0).sum()
    pos_count = (y_train == 1).sum()
    spw       = neg_count / max(pos_count, 1)
    logger.info(f"Class ratio (neg/pos): {spw:.2f}")

    if _HAS_XGB:
        xgb_model = XGBClassifier(
            n_estimators=100, max_depth=3, learning_rate=0.05,
            subsample=0.6, colsample_bytree=0.5, min_child_weight=50,
            gamma=3.0, reg_alpha=5.0, reg_lambda=10.0,
            scale_pos_weight=spw, eval_metric="logloss",
            random_state=42, n_jobs=-1,
        )
        xgb_model.fit(X_train_df, y_train)
        logger.info("XGBoost trained")
    else:
        xgb_model = None
        logger.warning("XGBoost not installed — falling back to RF-only ensemble")

    rf_model = RandomForestClassifier(
        n_estimators=100, max_depth=4, min_samples_leaf=50, min_samples_split=100,
        max_features=0.3, class_weight="balanced", random_state=42, n_jobs=-1,
    )
    rf_model.fit(X_train_df, y_train)
    logger.info("RandomForest trained")

    # ── 10. Train Isolation Forest ────────────────────────────────────────────
    if_feats_avail = [f for f in IF_FEATURES if f in X_train_df.columns]
    iso_model = IsolationForest(
        n_estimators=100, max_samples=0.5, contamination=0.02, random_state=42, n_jobs=-1,
    )
    iso_model.fit(X_train_df[if_feats_avail])
    train_if_raw = -iso_model.decision_function(X_train_df[if_feats_avail])
    logger.info("IsolationForest trained")

    # ── 11. Ensemble evaluation on validation set ─────────────────────────────
    # Adjust weights when XGBoost is unavailable
    if xgb_model is None:
        w_xgb, w_rf, w_if = 0.0, 0.70, 0.30
        xgb_prob = np.zeros(len(X_val_df))
    else:
        w_xgb, w_rf, w_if = W_XGB, W_RF, W_IF
        xgb_prob = xgb_model.predict_proba(X_val_df)[:, 1]

    rf_prob  = rf_model.predict_proba(X_val_df)[:, 1]
    raw_if   = -iso_model.decision_function(X_val_df[if_feats_avail])
    span     = (train_if_raw.max() - train_if_raw.min()) or 1e-9
    if_score = np.clip((raw_if - train_if_raw.min()) / span, 0, 1)
    combined = w_xgb * xgb_prob + w_rf * rf_prob + w_if * if_score

    val_scores_100 = np.round(combined * 100, 2)

    # ── Dynamic threshold computation ─────────────────────────────────────────
    # critical_threshold: Youden's J (maximises sensitivity + specificity).
    #   This adapts automatically to whatever score distribution this dataset
    #   produces — no hardcoded numbers.
    # low_risk_threshold: set at half the critical value so containers with
    #   weak-but-present signals still surface for review instead of passing
    #   through as Clear.  Both values are clipped to a reasonable safety band.
    if len(np.unique(y_val)) > 1:
        fpr_arr, tpr_arr, thresh_arr = roc_curve(y_val, combined)
        j_scores    = tpr_arr - fpr_arr
        best_idx    = int(np.argmax(j_scores))
        critical_threshold = float(np.clip(thresh_arr[best_idx], 0.20, 0.80))
    else:
        critical_threshold = 0.45   # graceful fallback for degenerate val sets

    low_risk_threshold = float(np.clip(critical_threshold * 0.50, 0.05, 0.35))
    logger.info(
        f"Dynamic thresholds — Critical: {critical_threshold:.4f}, "
        f"Low Risk: {low_risk_threshold:.4f}"
    )

    y_pred_bin = (combined >= critical_threshold).astype(int)

    acc = accuracy_score(y_val, y_pred_bin)
    f1  = f1_score(y_val, y_pred_bin, average="weighted", zero_division=0)
    roc = roc_auc_score(y_val, combined) if len(np.unique(y_val)) > 1 else 0.0

    logger.info(f"Val | Accuracy: {acc:.4f} | F1: {f1:.4f} | ROC-AUC: {roc:.4f}")
    logger.info("\n" + classification_report(y_val, y_pred_bin,
                target_names=["Safe", "Risky"], zero_division=0))

    # ── 12. Save artefacts ────────────────────────────────────────────────────
    ensemble_artifacts = {
        "train_stats":          train_stats,
        "encoders":             encoders,
        "scaler":               scaler,
        "num_feats":            num_feats,
        "if_features":          if_feats_avail,
        "feature_cols":         avail_cols,
        "cat_cols":             CAT_COLS,
        "weights":              {"xgb": w_xgb, "rf": w_rf, "if_": w_if},
        "threshold":            THRESHOLD,
        "train_if_raw_min":     float(train_if_raw.min()),
        "train_if_raw_max":     float(train_if_raw.max()),
        # ── Dynamic classification thresholds (model-derived, not hardcoded) ─
        "critical_threshold":   critical_threshold,
        "low_risk_threshold":   low_risk_threshold,
    }

    # Save ensemble files
    if xgb_model is not None:
        joblib.dump(xgb_model, ENSEMBLE_XGB_PATH)
    joblib.dump(rf_model,           ENSEMBLE_RF_PATH)
    joblib.dump(iso_model,          ENSEMBLE_ISO_PATH)
    joblib.dump(ensemble_artifacts, ENSEMBLE_ART_PATH)
    logger.info(f"Ensemble artefacts saved to {MODELS_DIR}")

    # Also save legacy RF file for backward compat
    with open(RISK_MODEL_PATH, "wb") as fh:
        pickle.dump(rf_model, fh)

    metrics = {
        "accuracy":             round(float(acc), 4),
        "f1_score":             round(float(f1), 4),
        "roc_auc":              round(float(roc), 4),
        "training_samples":     int(len(X_train_df)),
        "test_samples":         int(len(X_val_df)),
        "feature_count":        len(avail_cols),
        "trained_at":           datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%S.%f"),
        "model_type":           "XGBoost+RF+IsolationForest" if xgb_model else "RF+IsolationForest",
        # Written here so Node.js (riskClassifier.js) can read them at startup
        "critical_threshold":   round(critical_threshold, 4),
        "low_risk_threshold":   round(low_risk_threshold, 4),
    }

    with open(METRICS_PATH, "w") as fh:
        json.dump(metrics, fh, indent=2)

    logger.info(f"Training complete. Metrics: {metrics}")
    return metrics


# ── CLI entrypoint ────────────────────────────────────────────────────────────
if __name__ == "__main__":
    logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(message)s")
    parser = argparse.ArgumentParser(description="Train SmartContainer ensemble risk model")
    parser.add_argument("--data", type=str, default=None,
                        help="Path to CSV/Excel training data (notebook PascalCase or lowercase)")
    args    = parser.parse_args()
    metrics = run_training_pipeline(data_path=args.data)
    print(json.dumps(metrics, indent=2))

