"""
backend/ml-service/model_service.py
────────────────────────────────────
Production-ready service layer that wraps the raw prediction and anomaly modules
and exposes a single, stable interface consumed by main.py.

Responsibilities
----------------
- Lazy-load models on first call (avoids startup delays in serverless environments).
- Validate inputs before forwarding to the prediction engine.
- Translate lower-level exceptions into domain-specific errors.
- Centralise logging for observability.
- Provide a health-check method for the /health endpoint.

This module is the ONLY entry point that main.py should use.
Direct calls to predict.py or anomaly_detection.py from routes are discouraged.
"""

from __future__ import annotations

import logging
from typing import Any

from predict import (
    load_risk_model,
    predict_single,
    predict_batch,
)
from anomaly_detection import (
    load_anomaly_model,
    detect_anomaly_single,
    detect_anomaly_batch,
)

logger = logging.getLogger("model_service")

# ── Module state ──────────────────────────────────────────────────────────────
_models_loaded: bool = False
_load_error:    str | None = None


# ── Required fields for a minimal valid prediction request ───────────────────
_REQUIRED_FIELDS: list[str] = []   # all fields are optional; validation is permissive


# ── Input validation ──────────────────────────────────────────────────────────

class ValidationError(ValueError):
    """Raised when the incoming record fails basic sanity checks."""


def _validate_record(record: dict[str, Any]) -> None:
    """
    Validate a single prediction record.

    Raises:
        ValidationError: if validation fails.
    """
    if not isinstance(record, dict):
        raise ValidationError("Record must be a JSON object (dict).")

    # Numeric range checks
    for field, lo, hi in [
        ("declared_value",  0, 1e9),
        ("declared_weight", 0, 1e6),
        ("measured_weight", 0, 1e6),
        ("dwell_time_hours", 0, 8760),   # max 1 year in hours
    ]:
        val = record.get(field)
        if val is not None:
            try:
                v = float(val)
            except (TypeError, ValueError):
                raise ValidationError(f"Field '{field}' must be a number, got: {val!r}")
            if not (lo <= v <= hi):
                raise ValidationError(
                    f"Field '{field}' value {v} is outside expected range [{lo}, {hi}]."
                )


# ── Lazy model loader ─────────────────────────────────────────────────────────

def ensure_loaded() -> None:
    """Load both models into memory if they haven't been loaded yet."""
    global _models_loaded, _load_error

    if _models_loaded:
        return

    logger.info("Loading ML models on demand…")
    errors: list[str] = []

    try:
        load_risk_model()
    except Exception as exc:
        msg = f"Risk model load error: {exc}"
        logger.error(msg)
        errors.append(msg)

    try:
        load_anomaly_model()
    except Exception as exc:
        msg = f"Anomaly model load error: {exc}"
        logger.error(msg)
        errors.append(msg)

    _load_error   = "; ".join(errors) if errors else None
    _models_loaded = True

    if _load_error:
        logger.warning("Models loaded with errors — heuristic fallbacks active: %s", _load_error)
    else:
        logger.info("All models loaded successfully")


# ── Public interface ──────────────────────────────────────────────────────────

def predict_single_record(record: dict[str, Any]) -> dict[str, Any]:
    """
    Predict risk score for a single container record.

    Args:
        record: Dict of container shipment features (snake_case keys).

    Returns:
        {
          "risk_score": float,       # 0.0 – 1.0
          "anomaly_flag": bool,
          "anomaly_score": float,    # 0.0 – 1.0 (higher = more anomalous)
        }

    Raises:
        ValidationError: on invalid input.
        RuntimeError:    on unexpected prediction failure.
    """
    _validate_record(record)
    ensure_loaded()

    try:
        risk    = predict_single(record)
        anomaly = detect_anomaly_single(record)
        return {
            "risk_score":   risk.get("risk_score",    0.0),
            "anomaly_flag": anomaly.get("anomaly_flag", False),
            "anomaly_score": anomaly.get("anomaly_score", 0.0),
        }
    except ValidationError:
        raise
    except Exception as exc:
        logger.error("predict_single_record failed: %s", exc, exc_info=True)
        raise RuntimeError(f"Prediction failed: {exc}") from exc


def predict_batch_records(records: list[dict[str, Any]]) -> list[dict[str, Any]]:
    """
    Batch predict risk scores for multiple container records.

    Args:
        records: List of dicts (same schema as predict_single_record).

    Returns:
        List of dicts with keys: risk_score, anomaly_flag, anomaly_score.

    Raises:
        ValidationError: if any record fails validation.
        RuntimeError:    on unexpected prediction failure.
    """
    if not records:
        return []

    for i, rec in enumerate(records):
        try:
            _validate_record(rec)
        except ValidationError as exc:
            raise ValidationError(f"Record {i}: {exc}") from exc

    ensure_loaded()

    try:
        risk_results    = predict_batch(records)
        anomaly_results = detect_anomaly_batch(records)
        output = []
        for i, rec in enumerate(records):
            risk    = risk_results[i]    if i < len(risk_results)    else {"risk_score": 0.0}
            anomaly = anomaly_results[i] if i < len(anomaly_results) else {"anomaly_flag": False, "anomaly_score": 0.0}
            output.append({
                "risk_score":   risk.get("risk_score",    0.0),
                "anomaly_flag": anomaly.get("anomaly_flag", False),
                "anomaly_score": anomaly.get("anomaly_score", 0.0),
            })
        return output
    except ValidationError:
        raise
    except Exception as exc:
        logger.error("predict_batch_records failed: %s", exc, exc_info=True)
        raise RuntimeError(f"Batch prediction failed: {exc}") from exc


def health_status() -> dict[str, Any]:
    """
    Return a health-check payload for the /health endpoint.

    Returns:
        {
          "status": "ok" | "degraded",
          "models_loaded": bool,
          "load_error": str | None,
        }
    """
    return {
        "status":        "degraded" if _load_error else "ok",
        "models_loaded": _models_loaded,
        "load_error":    _load_error,
    }
