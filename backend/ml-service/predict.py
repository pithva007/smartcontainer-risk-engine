"""
Ensemble Risk Prediction Module
────────────────────────────────────────────────────────────────────────────────
Loads the hybrid XGBoost + Random Forest + Isolation Forest ensemble that was
trained in the notebook (smartcontainerfinal.ipynb) and provides single + batch
prediction interfaces compatible with the existing FastAPI service (main.py).

Artifact files (written by notebook cell 7b):
  models/ensemble_xgb_model.pkl  – XGBClassifier
  models/ensemble_rf_model.pkl   – RandomForestClassifier
  models/ensemble_iso_model.pkl  – IsolationForest
  models/ensemble_artifacts.pkl  – train_stats, encoders, scaler, metadata

Falls back to the legacy scikit-learn RF (risk_model.pkl) if the ensemble
artifacts are not present, and falls back further to a heuristic scorer if no
model file is found at all.
"""

import logging
import pickle
from datetime import datetime
from pathlib import Path
from typing import Any, Dict, List

import joblib
import numpy as np
import pandas as pd

logger = logging.getLogger("predict")

# ── Paths ─────────────────────────────────────────────────────────────────────
BASE_DIR   = Path(__file__).parent
MODELS_DIR = BASE_DIR / "models"

ENSEMBLE_XGB_PATH = MODELS_DIR / "ensemble_xgb_model.pkl"
ENSEMBLE_RF_PATH  = MODELS_DIR / "ensemble_rf_model.pkl"
ENSEMBLE_ISO_PATH = MODELS_DIR / "ensemble_iso_model.pkl"
ENSEMBLE_ART_PATH = MODELS_DIR / "ensemble_artifacts.pkl"

# Legacy paths (backward compat)
RISK_MODEL_PATH = MODELS_DIR / "risk_model.pkl"
SCALER_PATH     = MODELS_DIR / "scaler.pkl"
ENCODER_PATH    = MODELS_DIR / "encoders.pkl"

EPS = 1e-5

# ── Module-level model cache ──────────────────────────────────────────────────
_xgb_model       = None
_rf_model        = None
_iso_model       = None
_artifacts       = None   # dict: train_stats, encoders, scaler, feature metadata
_legacy_model    = None
_legacy_scaler   = None
_legacy_encoders = None
_use_ensemble    = False  # True once ensemble is loaded

# ── Field name mapping ────────────────────────────────────────────────────────
# FastAPI schema (ContainerFeatures) uses lowercase snake_case.
# The notebook pipeline uses PascalCase column names.
_FIELD_MAP: Dict[str, str] = {
    "container_id":        "Container_ID",
    "origin_country":      "Origin_Country",
    "destination_country": "Destination_Country",
    "destination_port":    "Destination_Port",
    "hs_code":             "HS_Code",
    "importer_id":         "Importer_ID",
    "exporter_id":         "Exporter_ID",
    "trade_regime":        "Trade_Regime",
    "shipping_line":       "Shipping_Line",
    "clearance_status":    "Clearance_Status",
    "declared_value":      "Declared_Value",
    "declared_weight":     "Declared_Weight",
    "measured_weight":     "Measured_Weight",
    "dwell_time_hours":    "Dwell_Time_Hours",
    "declaration_date":    "Declaration_Date",
}

_NUM_COLS = ["Declared_Value", "Declared_Weight", "Measured_Weight", "Dwell_Time_Hours"]
_CAT_COLS = [
    "Trade_Regime", "Origin_Country", "Destination_Country",
    "Destination_Port", "Shipping_Line",
]
_CAT_DEFAULTS = {
    "Trade_Regime":        "Import",
    "Origin_Country":      "Unknown",
    "Destination_Country": "Unknown",
    "Destination_Port":    "Unknown",
    "Shipping_Line":       "Unknown",
}


# ── Public API ────────────────────────────────────────────────────────────────

def load_risk_model() -> bool:
    """
    Load model artifacts from disk into the module-level cache.
    Tries the ensemble (XGB+RF+IF) first; falls back to the legacy RF model.
    Returns True on success.
    """
    global _xgb_model, _rf_model, _iso_model, _artifacts
    global _legacy_model, _legacy_scaler, _legacy_encoders, _use_ensemble

    ensemble_paths = [ENSEMBLE_XGB_PATH, ENSEMBLE_RF_PATH, ENSEMBLE_ISO_PATH, ENSEMBLE_ART_PATH]
    if all(p.exists() for p in ensemble_paths):
        try:
            _xgb_model  = joblib.load(ENSEMBLE_XGB_PATH)
            _rf_model   = joblib.load(ENSEMBLE_RF_PATH)
            _iso_model  = joblib.load(ENSEMBLE_ISO_PATH)
            _artifacts  = joblib.load(ENSEMBLE_ART_PATH)
            _use_ensemble = True
            logger.info("Ensemble model (XGBoost + RandomForest + IsolationForest) loaded")
            return True
        except Exception as exc:
            logger.error(f"Ensemble load failed: {exc} — trying legacy model")
            _use_ensemble = False

    if RISK_MODEL_PATH.exists():
        try:
            with open(RISK_MODEL_PATH, "rb") as fh:
                _legacy_model = pickle.load(fh)
            if SCALER_PATH.exists():
                with open(SCALER_PATH, "rb") as fh:
                    _legacy_scaler = pickle.load(fh)
            if ENCODER_PATH.exists():
                with open(ENCODER_PATH, "rb") as fh:
                    _legacy_encoders = pickle.load(fh)
            _use_ensemble = False
            logger.info("Legacy RF model loaded (run training or notebook to upgrade to ensemble)")
            return True
        except Exception as exc:
            logger.error(f"Legacy model load failed: {exc}")

    logger.warning(
        "No model found. Either run the notebook (cell 7b) or POST /train to train one."
    )
    return False


# ── Field normalisation ───────────────────────────────────────────────────────

def _normalise_record(record: Dict[str, Any]) -> Dict[str, Any]:
    """Map lowercase API field names to notebook PascalCase column names."""
    out: Dict[str, Any] = {}
    for api_key, nb_key in _FIELD_MAP.items():
        if api_key in record and record[api_key] is not None:
            out[nb_key] = record[api_key]
    # Pass through any keys that are already PascalCase or unknown
    for k, v in record.items():
        if k not in _FIELD_MAP and v is not None:
            out[k] = v
    return out


# ── Ensemble feature engineering (mirrors notebook pipeline) ──────────────────

def _preprocess_df(df: pd.DataFrame) -> pd.DataFrame:
    """Replicate notebook preprocess() — temporal and numeric cleaning."""
    df = df.copy()
    now = datetime.now()

    # Guard: create a proper datetime column even when the field is absent
    if "Declaration_Date" not in df.columns:
        df["Declaration_Date"] = pd.NaT
    df["Declaration_Date"] = pd.to_datetime(df["Declaration_Date"], errors="coerce")
    df["declaration_month"] = df["Declaration_Date"].dt.month.fillna(now.month).astype(int)
    df["declaration_dow"]   = df["Declaration_Date"].dt.dayofweek.fillna(now.weekday()).astype(int)

    for col in _NUM_COLS:
        if col not in df.columns:
            df[col] = 0.0
        df[col] = pd.to_numeric(df[col], errors="coerce").fillna(0.0)

    for col in _CAT_COLS:
        if col not in df.columns:
            df[col] = _CAT_DEFAULTS.get(col, "Unknown")
        df[col] = df[col].fillna(_CAT_DEFAULTS.get(col, "Unknown"))

    for id_col, default in [("HS_Code", "0000"), ("Exporter_ID", "EXP000"), ("Importer_ID", "IMP000")]:
        if id_col not in df.columns:
            df[id_col] = default
        df[id_col] = df[id_col].fillna(default).astype(str)

    return df


def _engineer_features(df: pd.DataFrame, train_stats: dict) -> pd.DataFrame:
    """Replicate notebook engineer_features() using saved training statistics."""
    df = df.copy()

    # Weight difference features
    df["weight_diff"]  = df["Measured_Weight"] - df["Declared_Weight"]
    df["weight_ratio"] = df["Measured_Weight"] / (df["Declared_Weight"] + EPS)

    # Robust percentage difference — 0.001 guard prevents div/0 on zero declarations;
    # capped at 2.0 (200%) so a single extreme outlier cannot dominate the feature.
    df["weight_deviation_pct"] = (
        (df["Measured_Weight"] - df["Declared_Weight"]).abs()
        / (df["Declared_Weight"] + 0.001)
    ).clip(upper=2.0)

    # Binary flags: zero declared weight (evasion signal) + excessive port dwell
    df["is_declared_zero"]    = (df["Declared_Weight"] == 0).astype(int)
    df["excessive_dwell_time"] = (df["Dwell_Time_Hours"] > 72).astype(int)

    # Commodity weight z-score
    hs_avg   = train_stats.get("hs_avg",   pd.Series(dtype=float))
    hs_std   = train_stats.get("hs_std",   pd.Series(dtype=float))
    hs_g_avg = float(train_stats.get("hs_global_avg", 0.0))
    hs_g_std = max(float(train_stats.get("hs_global_std", 1.0)), 1.0)

    df["commodity_avg_weight"] = df["HS_Code"].map(hs_avg).fillna(hs_g_avg)
    df["commodity_std_weight"] = df["HS_Code"].map(hs_std).fillna(hs_g_std)
    df["commodity_weight_zscore"] = (
        (df["Declared_Weight"] - df["commodity_avg_weight"])
        / (df["commodity_std_weight"] + EPS)
    ).clip(-3, 3)

    # Exporter weight deviation
    exp_avg   = train_stats.get("exp_avg",   pd.Series(dtype=float))
    exp_std   = train_stats.get("exp_std",   pd.Series(dtype=float))
    exp_g_avg = float(train_stats.get("exp_global_avg", 0.0))
    exp_g_std = max(float(train_stats.get("exp_global_std", 1.0)), 1.0)

    df["exporter_avg_weight"]      = df["Exporter_ID"].map(exp_avg).fillna(exp_g_avg)
    df["exporter_weight_deviation"] = (
        (df["Declared_Weight"] - df["exporter_avg_weight"])
        / (df["Exporter_ID"].map(exp_std).fillna(exp_g_std) + EPS)
    ).clip(-3, 3)

    # Cargo density and value per weight
    df["density"]          = df["Measured_Weight"] / (df["Declared_Value"] + EPS)
    df["value_per_weight"] = df["Declared_Value"]  / (df["Declared_Weight"] + EPS)

    # Dwell time z-score
    dwell_mean = float(train_stats.get("dwell_mean", 48.0))
    dwell_std  = max(float(train_stats.get("dwell_std", 24.0)), 1.0)
    df["dwell_time_zscore"] = (
        (df["Dwell_Time_Hours"] - dwell_mean) / (dwell_std + EPS)
    ).clip(-3, 3)

    # Entity risk history (Laplace-smoothed, falls back to global rate)
    global_rate = float(train_stats.get("global_risk_rate", 0.01))
    exp_risk  = train_stats.get("exporter_risk_rate", pd.Series(dtype=float))
    imp_risk  = train_stats.get("importer_risk_rate", pd.Series(dtype=float))
    route_risk = train_stats.get("route_risk_score",  pd.Series(dtype=float))

    df["exporter_risk_rate"] = df["Exporter_ID"].map(exp_risk).fillna(global_rate)
    df["importer_risk_rate"] = df["Importer_ID"].map(imp_risk).fillna(global_rate)
    df["_route"] = df["Origin_Country"] + "_" + df["Destination_Country"]
    df["route_risk_score"] = df["_route"].map(route_risk).fillna(global_rate)
    df.drop(columns=["_route"], inplace=True)

    return df


def _encode_categories(df: pd.DataFrame, encoders: dict) -> pd.DataFrame:
    """Apply saved LabelEncoders to categorical columns."""
    df = df.copy()
    for col in _CAT_COLS:
        if col not in df.columns:
            df[col] = _CAT_DEFAULTS.get(col, "Unknown")
        le = encoders.get(col)
        if le is None:
            df[col] = 0
            continue
        known = set(le.classes_)
        df[col] = df[col].astype(str).apply(lambda v: v if v in known else le.classes_[0])
        df[col] = le.transform(df[col])
    return df


def _select_features(df: pd.DataFrame, feature_cols: list) -> pd.DataFrame:
    """Select and order feature columns, padding missing columns with 0."""
    for col in feature_cols:
        if col not in df.columns:
            df[col] = 0.0
    return df[feature_cols].fillna(0.0)


def _run_ensemble(X: pd.DataFrame, if_feats: list, raw_min: float, raw_max: float,
                  weights: dict) -> np.ndarray:
    """Weighted ensemble score on a 0-100 scale."""
    xgb_prob = _xgb_model.predict_proba(X)[:, 1]
    rf_prob  = _rf_model.predict_proba(X)[:, 1]

    avail_if = [f for f in if_feats if f in X.columns]
    if avail_if:
        raw_if   = -_iso_model.decision_function(X[avail_if])
        span     = (raw_max - raw_min) or 1e-9
        if_score = np.clip((raw_if - raw_min) / span, 0, 1)
    else:
        if_score = np.zeros(len(X))

    combined = (
        weights.get("xgb", 0.5) * xgb_prob +
        weights.get("rf",  0.3) * rf_prob  +
        weights.get("if_", 0.2) * if_score
    )
    return np.round(combined * 100, 2)   # 0-100 scale


def _compute_top_factors(X: pd.DataFrame, n: int = 3) -> List[Dict[str, Any]]:
    """
    Per-instance feature contributions: XGBoost gain importance × |normalized value|.
    Returns top-n factors sorted by descending contribution.
    """
    try:
        importances = _xgb_model.feature_importances_
        names = list(X.columns)
        row = X.iloc[0].values.astype(float)
        contrib = importances * np.abs(row)
        top = np.argsort(contrib)[::-1][:n]
        return [
            {"feature": names[idx], "impact": round(float(contrib[idx]), 4)}
            for idx in top
            if contrib[idx] > 1e-6
        ]
    except Exception as exc:
        logger.warning(f"Feature importance failed: {exc}")
        return []


def _compute_batch_top_factors(X: pd.DataFrame, n: int = 3) -> List[List[Dict[str, Any]]]:
    """Compute top-n feature contributions for each row in X."""
    try:
        importances = _xgb_model.feature_importances_
        names = list(X.columns)
        rows = X.values.astype(float)
        out = []
        for row in rows:
            contrib = importances * np.abs(row)
            top = np.argsort(contrib)[::-1][:n]
            out.append([
                {"feature": names[idx], "impact": round(float(contrib[idx]), 4)}
                for idx in top
                if contrib[idx] > 1e-6
            ])
        return out
    except Exception as exc:
        logger.warning(f"Batch feature importance failed: {exc}")
        return [[] for _ in range(len(X))]


# ── Public predict functions ──────────────────────────────────────────────────

def predict_single(record: Dict[str, Any]) -> Dict[str, Any]:
    """
    Predict risk score for a single container record.

    Args:
        record: Dict with lowercase snake_case keys (FastAPI ContainerFeatures)
                or PascalCase notebook-style keys — either is accepted.
    Returns:
        {"risk_score": float}  where risk_score is in [0.0, 1.0].
    """
    if _xgb_model is None and _legacy_model is None:
        load_risk_model()

    if _use_ensemble:
        return _ensemble_predict_single(record)
    if _legacy_model is not None:
        return _legacy_predict_single(record)
    return _heuristic_score(record)


def predict_batch(records: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
    """
    Batch predict risk scores for multiple records.
    Processes all records in a single vectorised pass for efficiency.

    Returns:
        List of {"risk_score": float} dicts.
    """
    if not records:
        return []

    if _xgb_model is None and _legacy_model is None:
        load_risk_model()

    if _use_ensemble:
        return _ensemble_predict_batch(records)
    if _legacy_model is not None:
        return [_legacy_predict_single(r) for r in records]
    return [_heuristic_score(r) for r in records]


# ── Ensemble implementation ───────────────────────────────────────────────────

def _ensemble_predict_single(record: Dict[str, Any]) -> Dict[str, Any]:
    try:
        nb_rec = _normalise_record(record)
        df = pd.DataFrame([nb_rec])
        df = _preprocess_df(df)
        df = _engineer_features(df, _artifacts["train_stats"])
        df = _encode_categories(df, _artifacts["encoders"])
        X  = _select_features(df, _artifacts["feature_cols"])

        avail_num = [c for c in _artifacts["num_feats"] if c in X.columns]
        X[avail_num] = _artifacts["scaler"].transform(X[avail_num])

        score_100 = _run_ensemble(
            X,
            _artifacts["if_features"],
            _artifacts.get("train_if_raw_p1", _artifacts.get("train_if_raw_min", 0.0)),
            _artifacts.get("train_if_raw_p99", _artifacts.get("train_if_raw_max", 1.0)),
            _artifacts["weights"],
        )[0]
        top_factors = _compute_top_factors(X)
        return {"risk_score": round(float(score_100) / 100, 4), "top_factors": top_factors}
    except Exception as exc:
        logger.error(f"Ensemble single-predict error: {exc}", exc_info=True)
        return _heuristic_score(record)


def _ensemble_predict_batch(records: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
    try:
        now   = datetime.now()
        rows  = [_normalise_record(r) for r in records]
        df    = pd.DataFrame(rows)
        df    = _preprocess_df(df)
        df    = _engineer_features(df, _artifacts["train_stats"])
        df    = _encode_categories(df, _artifacts["encoders"])
        X     = _select_features(df, _artifacts["feature_cols"])

        avail_num = [c for c in _artifacts["num_feats"] if c in X.columns]
        X[avail_num] = _artifacts["scaler"].transform(X[avail_num])

        scores_100 = _run_ensemble(
            X,
            _artifacts["if_features"],
            _artifacts.get("train_if_raw_p1", _artifacts.get("train_if_raw_min", 0.0)),
            _artifacts.get("train_if_raw_p99", _artifacts.get("train_if_raw_max", 1.0)),
            _artifacts["weights"],
        )
        all_top_factors = _compute_batch_top_factors(X)
        return [
            {"risk_score": round(float(s) / 100, 4), "top_factors": all_top_factors[i]}
            for i, s in enumerate(scores_100)
        ]
    except Exception as exc:
        logger.error(f"Ensemble batch-predict error: {exc}", exc_info=True)
        return [_heuristic_score(r) for r in records]


# ── Legacy RF implementation (fallback) ───────────────────────────────────────

def _legacy_predict_single(record: Dict[str, Any]) -> Dict[str, Any]:
    """Prediction using the simple legacy Random Forest model."""
    try:
        CATEGORICAL_FEATURES = ["origin_country", "destination_country",
                                 "trade_regime", "clearance_status"]
        df = pd.DataFrame([record])

        if _legacy_encoders:
            for col in CATEGORICAL_FEATURES:
                le      = _legacy_encoders.get(col)
                enc_col = f"{col}_encoded"
                if le and col in df.columns:
                    df[col] = df[col].fillna("Unknown").astype(str)
                    known    = set(le.classes_)
                    df[col]  = df[col].apply(lambda x: x if x in known else "Unknown")
                    if "Unknown" not in le.classes_:
                        le.classes_ = np.append(le.classes_, "Unknown")
                    df[enc_col] = le.transform(df[col])
                else:
                    df[enc_col] = 0
        else:
            for col in CATEGORICAL_FEATURES:
                df[f"{col}_encoded"] = 0

        feature_cols = (
            _legacy_scaler.get("feature_cols") if _legacy_scaler else [
                "declared_value", "declared_weight", "measured_weight", "dwell_time_hours",
                "weight_difference", "weight_mismatch_percentage", "value_to_weight_ratio",
                "high_dwell_time_flag", "importer_frequency", "exporter_frequency",
                "trade_route_risk",
                "origin_country_encoded", "destination_country_encoded",
                "trade_regime_encoded", "clearance_status_encoded",
            ]
        )

        for col in feature_cols:
            if col not in df.columns:
                df[col] = 0
        X = df[feature_cols].fillna(0).values.astype(float)

        if _legacy_scaler:
            imputer = _legacy_scaler.get("imputer")
            scaler  = _legacy_scaler.get("scaler")
            if imputer:
                X = imputer.transform(X)
            if scaler:
                X = scaler.transform(X)

        prob = _legacy_model.predict_proba(X)[0]
        return {"risk_score": float(round(prob[1] if len(prob) > 1 else prob[0], 4)), "top_factors": []}
    except Exception as exc:
        logger.error(f"Legacy predict error: {exc}")
        return _heuristic_score(record)


# ── Heuristic fallback ────────────────────────────────────────────────────────

def _heuristic_score(record: Dict[str, Any]) -> Dict[str, Any]:
    """Rule-based risk estimate used when no model is available."""
    score = 0.0

    # Zero declared weight is a high-priority evasion signal (30% weight)
    declared = float(record.get("declared_weight") or record.get("Declared_Weight") or 1.0)
    if declared == 0 or int(record.get("is_declared_zero") or 0):
        score += 0.30

    # Robust weight mismatch: weight_deviation_pct is a 0.0–2.0 ratio;
    # legacy field weight_mismatch_percentage is a 0–200+ percentage.
    pct_ratio = float(record.get("weight_deviation_pct") or 0)
    if pct_ratio == 0:
        leg_pct = float(record.get("weight_mismatch_percentage") or 0)
        pct_ratio = min(leg_pct / 100.0, 2.0)
    score += min(pct_ratio, 1.0) * 0.30

    # Excessive dwell time >72 h (checks all three possible flag names)
    dwell_flag = (
        int(record.get("excessive_dwell_time") or 0)
        or int(record.get("high_dwell_time_flag") or 0)
        or int(float(record.get("dwell_time_hours") or record.get("Dwell_Time_Hours") or 0) > 72)
    )
    score += dwell_flag * 0.20

    score += min(
        float(record.get("trade_route_risk") or record.get("route_risk_score") or 0), 1.0
    ) * 0.15

    vwr = float(record.get("value_to_weight_ratio") or record.get("value_per_weight") or 0)
    if vwr > 1000 or (0 <= vwr < 0.1):
        score += 0.10

    if int(record.get("importer_frequency") or 1) <= 2:
        score += 0.05

    return {"risk_score": round(min(max(score, 0.0), 1.0), 4), "top_factors": []}


# ── Python-side classification, explanation & CSV export ─────────────────────

# Classification thresholds (Python side — mirrors riskClassifier.js)
# These are FALLBACK defaults only.  After load_risk_model() runs, the real
# values are read from ensemble_artifacts.pkl (computed by train_model.py via
# Youden’s J on the validation set) so they reflect THIS model on THIS data.
CRITICAL_THRESHOLD_PY: float = 0.45
LOW_RISK_THRESHOLD_PY: float  = 0.20


def _get_thresholds() -> tuple[float, float]:
    """Return (critical, low_risk) thresholds from loaded artifacts, or fallbacks."""
    if _artifacts:
        crit = float(_artifacts.get("critical_threshold", CRITICAL_THRESHOLD_PY))
        low  = float(_artifacts.get("low_risk_threshold",  LOW_RISK_THRESHOLD_PY))
    else:
        crit, low = CRITICAL_THRESHOLD_PY, LOW_RISK_THRESHOLD_PY
    return crit, low


def _classify_risk(score: float) -> str:
    """3-tier classification using model-derived thresholds: Critical / Low Risk / Clear."""
    crit, low = _get_thresholds()
    if score >= crit:
        return "Critical"
    if score >= low:
        return "Low Risk"
    return "Clear"


def _generate_explanation_py(features: Dict[str, Any], risk_score: float) -> str:
    """
    Generate a 1–2 sentence explanation using the updated feature signals.

    Priority order: zero-declared weight → weight mismatch →
                    dwell time → value ratio → trade route.
    """
    reasons: List[str] = []

    # Highest priority: declared weight is zero
    if int(features.get("is_declared_zero") or 0):
        reasons.append("Declared weight is zero — possible evasion or missing manifest data.")

    # Robust weight mismatch (weight_deviation_pct is a 0.0–2.0 ratio)
    pct = float(features.get("weight_deviation_pct") or 0)
    if pct == 0:
        leg = float(features.get("weight_mismatch_percentage") or 0)
        pct = min(leg / 100.0, 2.0)
    if pct > 0.20:  # >20% mismatch
        reasons.append(
            f"Weight mismatch of {pct * 100:.1f}% detected between "
            "declared and measured weight."
        )

    # Excessive dwell time (>72 h)
    dwell_flag = (
        int(features.get("excessive_dwell_time") or 0)
        or int(features.get("high_dwell_time_flag") or 0)
        or int(float(features.get("dwell_time_hours") or features.get("Dwell_Time_Hours") or 0) > 72)
    )
    if dwell_flag:
        hours = float(features.get("dwell_time_hours") or features.get("Dwell_Time_Hours") or 0)
        reasons.append(f"Container dwell time is unusually high ({hours:.0f} hours).")

    # Value-to-weight anomaly
    vwr = float(features.get("value_per_weight") or features.get("value_to_weight_ratio") or 0)
    if vwr > 1000:
        reasons.append("Unusually high value-to-weight ratio detected.")
    elif 0 <= vwr < 0.1:
        reasons.append("Suspiciously low declared value relative to shipment weight.")

    # High-risk trade route
    route = float(features.get("route_risk_score") or features.get("trade_route_risk") or 0)
    if route > 0.70:
        reasons.append("Trade route has historically elevated risk frequency.")

    if not reasons:
        crit, low = _get_thresholds()
        if risk_score >= crit:
            return "Multiple combined risk signals contribute to this critical classification."
        if risk_score >= low:
            return "Minor risk indicators detected. Further review recommended."
        return "No significant risk indicators detected."

    return " ".join(reasons[:2])  # keep to 1–2 sentences


def generate_csv(
    records: List[Dict[str, Any]],
    output_path: str = None,
) -> pd.DataFrame:
    """
    Run end-to-end prediction on *records* and return a tidy DataFrame:

        Container_ID | Risk_Score (0–100) | Risk_Level | Explanation_Summary

    Optionally writes the result to *output_path* as a UTF-8 CSV file.

    Example
    -------
    >>> from predict import generate_csv, load_risk_model
    >>> load_risk_model()
    >>> df = generate_csv(records, output_path="output/predictions.csv")
    """
    if not records:
        return pd.DataFrame(
            columns=["Container_ID", "Risk_Score", "Risk_Level", "Explanation_Summary"]
        )

    scored = predict_batch(records)

    rows = []
    for rec, result in zip(records, scored):
        risk_score = float(result.get("risk_score", 0.0))
        container_id = (
            rec.get("container_id")
            or rec.get("Container_ID")
            or rec.get("id")
            or "UNKNOWN"
        )
        rows.append(
            {
                "Container_ID":       str(container_id),
                "Risk_Score":         round(risk_score * 100, 2),
                "Risk_Level":         _classify_risk(risk_score),
                "Explanation_Summary": _generate_explanation_py(rec, risk_score),
            }
        )

    df = pd.DataFrame(rows)
    if output_path:
        Path(output_path).parent.mkdir(parents=True, exist_ok=True)
        df.to_csv(output_path, index=False, encoding="utf-8")
        logger.info("CSV written → %s  (%d rows)", output_path, len(df))
    return df
