"""
ML Training Pipeline
Trains a Random Forest classifier on container shipment data to predict risk scores.
Saves the trained model and preprocessing artifacts to disk.

Usage:
    python train_model.py                         # train on sample/generated data
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
from datetime import datetime

from sklearn.ensemble import RandomForestClassifier
from sklearn.model_selection import train_test_split, cross_val_score
from sklearn.preprocessing import LabelEncoder, StandardScaler
from sklearn.metrics import (
    accuracy_score,
    f1_score,
    roc_auc_score,
    classification_report,
)
from sklearn.pipeline import Pipeline
from sklearn.impute import SimpleImputer

logger = logging.getLogger("train_model")

# ── Paths ─────────────────────────────────────────────────────────────────────
BASE_DIR = Path(__file__).parent
MODELS_DIR = BASE_DIR / "models"
MODELS_DIR.mkdir(exist_ok=True)

RISK_MODEL_PATH = MODELS_DIR / "risk_model.pkl"
SCALER_PATH = MODELS_DIR / "scaler.pkl"
ENCODER_PATH = MODELS_DIR / "encoders.pkl"
METRICS_PATH = MODELS_DIR / "training_metrics.json"

# Feature columns used for training
NUMERIC_FEATURES = [
    "declared_value",
    "declared_weight",
    "measured_weight",
    "dwell_time_hours",
    "weight_difference",
    "weight_mismatch_percentage",
    "value_to_weight_ratio",
    "high_dwell_time_flag",
    "importer_frequency",
    "exporter_frequency",
    "trade_route_risk",
]

CATEGORICAL_FEATURES = [
    "origin_country",
    "destination_country",
    "trade_regime",
    "clearance_status",
]

ALL_FEATURES = NUMERIC_FEATURES + [f"{c}_encoded" for c in CATEGORICAL_FEATURES]


# ── Feature Engineering ───────────────────────────────────────────────────────

def engineer_features(df: pd.DataFrame) -> pd.DataFrame:
    """Apply feature engineering to a DataFrame."""
    df = df.copy()

    # Coerce numeric columns
    for col in ["declared_weight", "measured_weight", "declared_value", "dwell_time_hours"]:
        df[col] = pd.to_numeric(df[col], errors="coerce").fillna(0)

    df["weight_difference"] = (df["declared_weight"] - df["measured_weight"]).abs()

    df["weight_mismatch_percentage"] = np.where(
        df["declared_weight"] > 0,
        (df["weight_difference"] / df["declared_weight"]) * 100,
        0,
    )

    ref_weight = np.where(df["measured_weight"] > 0, df["measured_weight"], df["declared_weight"])
    df["value_to_weight_ratio"] = np.where(ref_weight > 0, df["declared_value"] / ref_weight, 0)

    df["high_dwell_time_flag"] = (df["dwell_time_hours"] > 72).astype(int)

    # Importer / exporter frequency
    importer_freq = df["importer_id"].value_counts().to_dict()
    exporter_freq = df["exporter_id"].value_counts().to_dict()
    df["importer_frequency"] = df["importer_id"].map(importer_freq).fillna(1)
    df["exporter_frequency"] = df["exporter_id"].map(exporter_freq).fillna(1)

    # Trade route risk (proportion of critical on each route)
    route_key = df["origin_country"].fillna("") + "->" + df["destination_country"].fillna("")
    if "risk_label" in df.columns:
        route_risk = df.groupby(route_key)["risk_label"].mean().to_dict()
        df["trade_route_risk"] = route_key.map(route_risk).fillna(0)
    else:
        route_count = route_key.value_counts()
        max_count = route_count.max() if len(route_count) > 0 else 1
        df["trade_route_risk"] = route_key.map(lambda k: 1 - route_count.get(k, 0) / max_count)

    return df


def encode_categorical(df: pd.DataFrame, encoders: dict = None, fit: bool = True):
    """Label-encode categorical features. Returns (df, encoders)."""
    if encoders is None:
        encoders = {}
    for col in CATEGORICAL_FEATURES:
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


# ── Synthetic Data Generator (for demo/testing) ───────────────────────────────

def generate_synthetic_data(n_samples: int = 2000) -> pd.DataFrame:
    """Generate synthetic container shipment data for demonstration."""
    np.random.seed(42)
    rng = np.random.default_rng(42)

    countries = ["China", "India", "USA", "Germany", "Brazil", "Nigeria", "Vietnam", "Turkey"]
    ports = ["Rotterdam", "Shanghai", "Mumbai", "Hamburg", "Dubai", "Singapore", "Los Angeles"]
    regimes = ["Import", "Export", "Transit", "Re-export"]
    statuses = ["Cleared", "Held", "Under Review", "Released"]
    shipping_lines = ["Maersk", "MSC", "CMA CGM", "COSCO", "Hapag-Lloyd"]

    data = {
        "container_id": [f"C{10000 + i}" for i in range(n_samples)],
        "origin_country": rng.choice(countries, n_samples),
        "destination_country": rng.choice(countries, n_samples),
        "destination_port": rng.choice(ports, n_samples),
        "trade_regime": rng.choice(regimes, n_samples),
        "clearance_status": rng.choice(statuses, n_samples),
        "shipping_line": rng.choice(shipping_lines, n_samples),
        "importer_id": [f"IMP{rng.integers(100, 600)}" for _ in range(n_samples)],
        "exporter_id": [f"EXP{rng.integers(100, 400)}" for _ in range(n_samples)],
        "declared_value": np.abs(rng.normal(50000, 30000, n_samples)),
        "declared_weight": np.abs(rng.normal(5000, 2000, n_samples)),
        "dwell_time_hours": np.abs(rng.exponential(48, n_samples)),
        "hs_code": [f"{rng.integers(10, 99)}{rng.integers(10, 99)}" for _ in range(n_samples)],
    }

    df = pd.DataFrame(data)

    # Measured weight: mostly close to declared, occasionally anomalous
    anomaly_mask = rng.random(n_samples) < 0.15
    df["measured_weight"] = df["declared_weight"] * rng.uniform(0.95, 1.05, n_samples)
    df.loc[anomaly_mask, "measured_weight"] = df.loc[anomaly_mask, "declared_weight"] * rng.uniform(0.3, 3.0, anomaly_mask.sum())

    # Risk label: simulate based on features
    df = engineer_features(df)
    df["risk_score_synth"] = (
        0.3 * np.clip(df["weight_mismatch_percentage"] / 100, 0, 1)
        + 0.2 * (df["high_dwell_time_flag"])
        + 0.2 * np.clip(df["trade_route_risk"], 0, 1)
        + 0.15 * np.clip(1 / (df["importer_frequency"] + 1), 0, 1)
        + 0.15 * np.random.rand(n_samples)
    )
    df["risk_label"] = (df["risk_score_synth"] > 0.45).astype(int)

    return df


# ── Training Pipeline ─────────────────────────────────────────────────────────

def run_training_pipeline(data_path: str = None) -> dict:
    """
    Full training pipeline:
      1. Load or generate data
      2. Feature engineering
      3. Encode categoricals
      4. Train/test split
      5. Train Random Forest
      6. Evaluate and save model
    """
    logger.info("Starting training pipeline")

    # ── Load Data ──────────────────────────────────────────────────────────────
    if data_path and Path(data_path).exists():
        logger.info(f"Loading data from {data_path}")
        ext = Path(data_path).suffix.lower()
        df = pd.read_csv(data_path) if ext == ".csv" else pd.read_excel(data_path)
        # Normalise column names
        df.columns = [c.lower().replace(" ", "_").replace("-", "_") for c in df.columns]
    else:
        logger.info("No data file provided — generating synthetic training data")
        df = generate_synthetic_data(n_samples=3000)

    logger.info(f"Dataset size: {len(df)} records")

    # ── Feature Engineering ────────────────────────────────────────────────────
    df = engineer_features(df)
    df, encoders = encode_categorical(df, fit=True)

    # ── Build Label ────────────────────────────────────────────────────────────
    # Accept binary risk_label (0/1) or derive from risk score columns
    if "risk_label" not in df.columns:
        if "risk_score" in df.columns:
            df["risk_label"] = (df["risk_score"] >= 0.45).astype(int)
        else:
            raise ValueError("Dataset must contain 'risk_label' or 'risk_score' column")

    # ── Prepare Feature Matrix ─────────────────────────────────────────────────
    feature_cols = [c for c in ALL_FEATURES if c in df.columns]
    X = df[feature_cols].copy()
    y = df["risk_label"]

    # Impute missing values
    imputer = SimpleImputer(strategy="median")
    X_imputed = imputer.fit_transform(X)

    # Scale features
    scaler = StandardScaler()
    X_scaled = scaler.fit_transform(X_imputed)

    # ── Train/Test Split ───────────────────────────────────────────────────────
    X_train, X_test, y_train, y_test = train_test_split(
        X_scaled, y, test_size=0.2, random_state=42, stratify=y
    )
    logger.info(f"Train size: {len(X_train)}, Test size: {len(X_test)}")

    # ── Train Random Forest ────────────────────────────────────────────────────
    clf = RandomForestClassifier(
        n_estimators=200,
        max_depth=12,
        min_samples_split=5,
        min_samples_leaf=2,
        class_weight="balanced",
        random_state=42,
        n_jobs=-1,
    )
    clf.fit(X_train, y_train)

    # ── Evaluate ───────────────────────────────────────────────────────────────
    y_pred = clf.predict(X_test)
    y_prob = clf.predict_proba(X_test)[:, 1]

    acc = accuracy_score(y_test, y_pred)
    f1 = f1_score(y_test, y_pred, average="weighted")
    roc = roc_auc_score(y_test, y_prob)

    logger.info(f"Accuracy: {acc:.4f} | F1: {f1:.4f} | ROC-AUC: {roc:.4f}")
    logger.info("\n" + classification_report(y_test, y_pred))

    # ── Save Artifacts ─────────────────────────────────────────────────────────
    with open(RISK_MODEL_PATH, "wb") as f:
        pickle.dump(clf, f)
    with open(SCALER_PATH, "wb") as f:
        pickle.dump({"scaler": scaler, "imputer": imputer, "feature_cols": feature_cols}, f)
    with open(ENCODER_PATH, "wb") as f:
        pickle.dump(encoders, f)

    metrics = {
        "accuracy": round(acc, 4),
        "f1_score": round(f1, 4),
        "roc_auc": round(roc, 4),
        "training_samples": len(X_train),
        "test_samples": len(X_test),
        "feature_count": len(feature_cols),
        "trained_at": datetime.utcnow().isoformat(),
    }

    with open(METRICS_PATH, "w") as f:
        json.dump(metrics, f, indent=2)

    logger.info(f"Model saved to {RISK_MODEL_PATH}")
    return metrics


# ── CLI entrypoint ─────────────────────────────────────────────────────────────
if __name__ == "__main__":
    logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(message)s")
    parser = argparse.ArgumentParser(description="Train SmartContainer risk model")
    parser.add_argument("--data", type=str, default=None, help="Path to CSV/Excel training data")
    args = parser.parse_args()
    metrics = run_training_pipeline(data_path=args.data)
    print(json.dumps(metrics, indent=2))
