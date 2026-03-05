"""
Anomaly Detection Module
Uses Isolation Forest to identify unusual container shipments.
The model is trained on-the-fly from synthetic data if no pre-trained model exists.
"""

import pickle
import logging
import numpy as np
import pandas as pd
from pathlib import Path
from typing import Dict, Any, List

logger = logging.getLogger("anomaly_detection")

BASE_DIR = Path(__file__).parent
MODELS_DIR = BASE_DIR / "models"
ANOMALY_MODEL_PATH = MODELS_DIR / "anomaly_model.pkl"
ANOMALY_SCALER_PATH = MODELS_DIR / "anomaly_scaler.pkl"

ANOMALY_FEATURES = [
    "weight_difference",
    "weight_mismatch_percentage",
    "value_to_weight_ratio",
    "dwell_time_hours",
    "trade_route_risk",
    "importer_frequency",
    "exporter_frequency",
]

# Module-level cache
_anomaly_model = None
_anomaly_scaler = None


def load_anomaly_model():
    """Load or train the Isolation Forest anomaly model."""
    global _anomaly_model, _anomaly_scaler

    if ANOMALY_MODEL_PATH.exists() and ANOMALY_SCALER_PATH.exists():
        with open(ANOMALY_MODEL_PATH, "rb") as f:
            _anomaly_model = pickle.load(f)
        with open(ANOMALY_SCALER_PATH, "rb") as f:
            _anomaly_scaler = pickle.load(f)
        logger.info("Anomaly model loaded from disk")
        return True

    # Train on synthetic data if no saved model exists
    logger.info("Anomaly model not found — training on synthetic data")
    _train_anomaly_model()
    return True


def _train_anomaly_model():
    """Train Isolation Forest on synthetic data and save to disk."""
    global _anomaly_model, _anomaly_scaler
    from sklearn.ensemble import IsolationForest
    from sklearn.preprocessing import StandardScaler

    np.random.seed(42)
    n = 3000
    # Simulate normal shipments
    X = np.column_stack([
        np.abs(np.random.normal(200, 150, n)),     # weight_difference
        np.abs(np.random.normal(5, 8, n)),          # weight_mismatch_percentage
        np.abs(np.random.normal(200, 100, n)),      # value_to_weight_ratio
        np.abs(np.random.exponential(48, n)),       # dwell_time_hours
        np.random.uniform(0, 0.5, n),               # trade_route_risk
        np.random.randint(1, 50, n).astype(float),  # importer_frequency
        np.random.randint(1, 30, n).astype(float),  # exporter_frequency
    ])

    scaler = StandardScaler()
    X_scaled = scaler.fit_transform(X)

    iso_forest = IsolationForest(
        n_estimators=200,
        contamination=0.08,   # ~8% anomaly rate
        max_samples="auto",
        random_state=42,
        n_jobs=-1,
    )
    iso_forest.fit(X_scaled)

    _anomaly_model = iso_forest
    _anomaly_scaler = scaler

    MODELS_DIR.mkdir(exist_ok=True)
    with open(ANOMALY_MODEL_PATH, "wb") as f:
        pickle.dump(iso_forest, f)
    with open(ANOMALY_SCALER_PATH, "wb") as f:
        pickle.dump(scaler, f)
    logger.info("Anomaly model trained and saved")


def _extract_anomaly_features(record: Dict[str, Any]) -> np.ndarray:
    """Extract and scale anomaly detection feature vector from a record."""
    global _anomaly_scaler

    features = np.array([
        float(record.get("weight_difference") or 0),
        float(record.get("weight_mismatch_percentage") or 0),
        float(record.get("value_to_weight_ratio") or 0),
        float(record.get("dwell_time_hours") or 0),
        float(record.get("trade_route_risk") or 0),
        float(record.get("importer_frequency") or 1),
        float(record.get("exporter_frequency") or 1),
    ]).reshape(1, -1)

    if _anomaly_scaler:
        features = _anomaly_scaler.transform(features)

    return features


def detect_anomaly_single(record: Dict[str, Any]) -> Dict[str, Any]:
    """
    Detect whether a single container record is anomalous.

    Returns:
        { anomaly_flag: bool, anomaly_score: float }
        anomaly_score is normalised to [0, 1] — higher = more anomalous.
    """
    global _anomaly_model

    if _anomaly_model is None:
        load_anomaly_model()

    try:
        X = _extract_anomaly_features(record)
        prediction = _anomaly_model.predict(X)[0]       # 1=normal, -1=anomaly
        raw_score = _anomaly_model.score_samples(X)[0]  # negative; more negative = more anomalous

        # Normalise score to [0, 1]: Isolation Forest score_samples range ~ [-0.8, 0.1]
        # We invert so that higher = more anomalous
        normalised = float(round(max(0.0, min(1.0, (-raw_score - 0.1) / 0.7)), 4))

        return {
            "anomaly_flag": bool(prediction == -1),
            "anomaly_score": normalised,
        }
    except Exception as e:
        logger.error(f"Anomaly detection error: {e}")
        return _fallback_anomaly(record)


def detect_anomaly_batch(records: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
    """
    Batch anomaly detection for a list of records.
    """
    global _anomaly_model

    if _anomaly_model is None:
        load_anomaly_model()

    try:
        X_list = [_extract_anomaly_features(r)[0] for r in records]
        X = np.array(X_list)
        if _anomaly_scaler:
            # Already scaled in _extract_anomaly_features — skip re-scaling
            pass
        predictions = _anomaly_model.predict(X)
        raw_scores = _anomaly_model.score_samples(X)

        results = []
        for pred, raw in zip(predictions, raw_scores):
            normalised = float(round(max(0.0, min(1.0, (-raw - 0.1) / 0.7)), 4))
            results.append({
                "anomaly_flag": bool(pred == -1),
                "anomaly_score": normalised,
            })
        return results
    except Exception as e:
        logger.error(f"Batch anomaly detection error: {e}")
        return [_fallback_anomaly(r) for r in records]


def _fallback_anomaly(record: Dict[str, Any]) -> Dict[str, Any]:
    """Rule-based fallback when model unavailable."""
    signals = 0
    if float(record.get("weight_mismatch_percentage") or 0) > 50:
        signals += 1
    vwr = float(record.get("value_to_weight_ratio") or 0)
    if vwr > 5000 or (0 <= vwr < 0.01):
        signals += 1
    if float(record.get("dwell_time_hours") or 0) > 240:
        signals += 1
    if int(record.get("importer_frequency") or 1) == 1 and float(record.get("trade_route_risk") or 0) > 0.5:
        signals += 1

    return {
        "anomaly_flag": signals >= 2,
        "anomaly_score": round(min(signals * 0.25, 1.0), 4),
    }


# Re-train anomaly model using real data
def retrain_anomaly_model(records: List[Dict[str, Any]]):
    """Retrain Isolation Forest on real data records."""
    from sklearn.ensemble import IsolationForest
    from sklearn.preprocessing import StandardScaler
    global _anomaly_model, _anomaly_scaler

    if len(records) < 50:
        logger.warning("Too few records to retrain anomaly model")
        return

    X = np.array([
        [
            float(r.get("weight_difference") or 0),
            float(r.get("weight_mismatch_percentage") or 0),
            float(r.get("value_to_weight_ratio") or 0),
            float(r.get("dwell_time_hours") or 0),
            float(r.get("trade_route_risk") or 0),
            float(r.get("importer_frequency") or 1),
            float(r.get("exporter_frequency") or 1),
        ]
        for r in records
    ])

    scaler = StandardScaler()
    X_scaled = scaler.fit_transform(X)

    iso = IsolationForest(n_estimators=200, contamination=0.08, random_state=42, n_jobs=-1)
    iso.fit(X_scaled)

    _anomaly_model = iso
    _anomaly_scaler = scaler

    with open(ANOMALY_MODEL_PATH, "wb") as f:
        pickle.dump(iso, f)
    with open(ANOMALY_SCALER_PATH, "wb") as f:
        pickle.dump(scaler, f)
    logger.info("Anomaly model retrained on real data")
