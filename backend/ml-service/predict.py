"""
Risk Prediction Module
Loads the trained Random Forest model and provides single + batch prediction interfaces.
"""

import pickle
import logging
import numpy as np
import pandas as pd
from pathlib import Path
from typing import Dict, Any, List

logger = logging.getLogger("predict")

BASE_DIR = Path(__file__).parent
MODELS_DIR = BASE_DIR / "models"
RISK_MODEL_PATH = MODELS_DIR / "risk_model.pkl"
SCALER_PATH = MODELS_DIR / "scaler.pkl"
ENCODER_PATH = MODELS_DIR / "encoders.pkl"

# Module-level model cache (loaded once per process)
_risk_model = None
_scaler_artifacts = None
_encoders = None


def load_risk_model():
    """Load model and preprocessing artifacts from disk."""
    global _risk_model, _scaler_artifacts, _encoders

    if not RISK_MODEL_PATH.exists():
        logger.warning(f"Risk model not found at {RISK_MODEL_PATH}. Run training first.")
        return False

    with open(RISK_MODEL_PATH, "rb") as f:
        _risk_model = pickle.load(f)

    if SCALER_PATH.exists():
        with open(SCALER_PATH, "rb") as f:
            _scaler_artifacts = pickle.load(f)

    if ENCODER_PATH.exists():
        with open(ENCODER_PATH, "rb") as f:
            _encoders = pickle.load(f)

    logger.info("Risk model loaded successfully")
    return True


def _prepare_features(record: Dict[str, Any]) -> np.ndarray:
    """
    Convert a raw record dict into the feature vector expected by the model.
    Applies the same preprocessing as the training pipeline.
    """
    global _scaler_artifacts, _encoders

    CATEGORICAL_FEATURES = [
        "origin_country",
        "destination_country",
        "trade_regime",
        "clearance_status",
    ]

    df = pd.DataFrame([record])

    # Encode categorical columns
    if _encoders:
        for col in CATEGORICAL_FEATURES:
            enc_col = f"{col}_encoded"
            le = _encoders.get(col)
            if le and col in df.columns:
                df[col] = df[col].fillna("Unknown").astype(str)
                known = set(le.classes_)
                df[col] = df[col].apply(lambda x: x if x in known else "Unknown")
                if "Unknown" not in le.classes_:
                    le.classes_ = np.append(le.classes_, "Unknown")
                df[enc_col] = le.transform(df[col])
            else:
                df[enc_col] = 0
    else:
        for col in CATEGORICAL_FEATURES:
            df[f"{col}_encoded"] = 0

    # Select and order features
    if _scaler_artifacts:
        feature_cols = _scaler_artifacts["feature_cols"]
    else:
        feature_cols = [
            "declared_value", "declared_weight", "measured_weight", "dwell_time_hours",
            "weight_difference", "weight_mismatch_percentage", "value_to_weight_ratio",
            "high_dwell_time_flag", "importer_frequency", "exporter_frequency",
            "trade_route_risk",
            "origin_country_encoded", "destination_country_encoded",
            "trade_regime_encoded", "clearance_status_encoded",
        ]

    for col in feature_cols:
        if col not in df.columns:
            df[col] = 0
    df = df[feature_cols].fillna(0)

    X = df.values.astype(float)

    # Apply scaler
    if _scaler_artifacts:
        imputer = _scaler_artifacts.get("imputer")
        scaler = _scaler_artifacts.get("scaler")
        if imputer:
            X = imputer.transform(X)
        if scaler:
            X = scaler.transform(X)

    return X


def _heuristic_score(record: Dict[str, Any]) -> Dict[str, Any]:
    """Fallback scoring when model is not loaded."""
    score = 0.0
    mismatch = float(record.get("weight_mismatch_percentage") or 0)
    score += min(mismatch / 100, 1) * 0.35
    score += float(record.get("high_dwell_time_flag") or 0) * 0.20
    score += min(float(record.get("trade_route_risk") or 0), 1) * 0.20
    vwr = float(record.get("value_to_weight_ratio") or 0)
    if vwr > 1000 or (0 <= vwr < 0.1):
        score += 0.15
    if int(record.get("importer_frequency") or 1) <= 2:
        score += 0.10
    score = round(min(max(score, 0.0), 1.0), 4)
    return {"risk_score": score}


def predict_single(record: Dict[str, Any]) -> Dict[str, Any]:
    """
    Predict risk score for a single container record.
    Returns: { risk_score: float (0-1) }
    """
    global _risk_model

    if _risk_model is None:
        loaded = load_risk_model()
        if not loaded:
            return _heuristic_score(record)

    try:
        X = _prepare_features(record)
        prob = _risk_model.predict_proba(X)[0]
        # Probability of class 1 (risky)
        risk_score = float(round(prob[1] if len(prob) > 1 else prob[0], 4))
        return {"risk_score": risk_score}
    except Exception as e:
        logger.error(f"Prediction error: {e}")
        return _heuristic_score(record)


def predict_batch(records: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
    """
    Batch predict risk scores for multiple records.
    Returns list of { risk_score: float } dicts.
    """
    global _risk_model

    if _risk_model is None:
        loaded = load_risk_model()
        if not loaded:
            return [_heuristic_score(r) for r in records]

    try:
        import pandas as pd
        results = []
        # Process in chunks to avoid memory issues with very large batches
        chunk_size = 500
        for i in range(0, len(records), chunk_size):
            chunk = records[i: i + chunk_size]
            X_list = []
            for rec in chunk:
                try:
                    X_list.append(_prepare_features(rec)[0])
                except Exception:
                    X_list.append(np.zeros(len(_scaler_artifacts["feature_cols"]) if _scaler_artifacts else 15))

            X_chunk = np.array(X_list)
            probs = _risk_model.predict_proba(X_chunk)
            for prob in probs:
                score = float(round(prob[1] if len(prob) > 1 else prob[0], 4))
                results.append({"risk_score": score})
        return results
    except Exception as e:
        logger.error(f"Batch prediction error: {e}")
        return [_heuristic_score(r) for r in records]
