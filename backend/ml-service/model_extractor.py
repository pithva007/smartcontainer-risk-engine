"""
backend/ml-service/model_extractor.py
──────────────────────────────────────
Extracts and saves the trained ensemble models from the Jupyter notebook
(smartcontainerfinal.ipynb) by executing the notebook cells programmatically.

Usage
-----
  # From the backend/ml-service/ directory
  python model_extractor.py                                  # notebook extraction
  python model_extractor.py --from-script                    # run training script directly
  python model_extractor.py --data ../../"Historical Data.csv"  # with real data

The extracted model artifacts are saved to:
  backend/ml-service/models/
    ├── ensemble_xgb_model.pkl   – XGBClassifier
    ├── ensemble_rf_model.pkl    – RandomForestClassifier
    ├── ensemble_iso_model.pkl   – IsolationForest
    └── ensemble_artifacts.pkl  – train_stats, encoders, scaler, feature metadata
"""

import argparse
import json
import logging
import subprocess
import sys
from pathlib import Path

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(message)s",
)
logger = logging.getLogger("model_extractor")

# Now lives at backend/ml-service/ — project root is two levels up
PROJECT_ROOT  = Path(__file__).resolve().parent.parent.parent
NOTEBOOK_PATH = PROJECT_ROOT / "smartcontainerfinal.ipynb"
TRAIN_SCRIPT  = Path(__file__).resolve().parent / "train_model.py"
MODELS_DIR    = Path(__file__).resolve().parent / "models"

ENSEMBLE_FILES = [
    "ensemble_xgb_model.pkl",
    "ensemble_rf_model.pkl",
    "ensemble_iso_model.pkl",
    "ensemble_artifacts.pkl",
]


def _check_artifacts() -> bool:
    """Return True if all ensemble artifact files are present."""
    missing = [f for f in ENSEMBLE_FILES if not (MODELS_DIR / f).exists()]
    if missing:
        logger.warning("Missing ensemble artifacts: %s", missing)
        return False
    logger.info("All ensemble artifacts present in %s", MODELS_DIR)
    return True


def extract_from_notebook(data_path: str | None = None) -> dict:
    """
    Execute the Jupyter notebook cells that train and save the ensemble model.
    Falls back to extract_from_script() if nbconvert is not available.

    Args:
        data_path: Optional path to a CSV/Excel training dataset.

    Returns:
        dict with training metrics.
    """
    logger.info("Attempting to extract models by executing notebook: %s", NOTEBOOK_PATH)

    # Check notebook exists
    if not NOTEBOOK_PATH.exists():
        logger.warning("Notebook not found at %s — falling back to training script", NOTEBOOK_PATH)
        return extract_from_script(data_path)

    # Check nbconvert is available
    try:
        subprocess.run(
            [sys.executable, "-m", "nbconvert", "--version"],
            check=True, capture_output=True,
        )
    except (subprocess.CalledProcessError, FileNotFoundError):
        logger.warning("nbconvert not available — falling back to training script")
        return extract_from_script(data_path)

    # If a custom data path is given, we patch it into the notebook's data-load cell
    # by injecting an environment variable that the notebook reads.
    import os
    env = os.environ.copy()
    if data_path:
        env["SMARTCONTAINER_DATA_PATH"] = str(Path(data_path).resolve())
        logger.info("Using data path: %s", data_path)

    logger.info("Executing notebook (this may take a minute)…")
    result = subprocess.run(
        [
            sys.executable, "-m", "nbconvert",
            "--to", "notebook",
            "--execute",
            "--inplace",
            "--ExecutePreprocessor.timeout=600",
            str(NOTEBOOK_PATH),
        ],
        env=env,
        capture_output=True,
        text=True,
    )

    if result.returncode != 0:
        logger.error("Notebook execution failed:\n%s", result.stderr[-2000:])
        logger.info("Falling back to training script")
        return extract_from_script(data_path)

    if not _check_artifacts():
        logger.warning("Notebook ran but artifacts not found — running training script")
        return extract_from_script(data_path)

    logger.info("Model extraction from notebook succeeded")
    return _read_metrics()


def extract_from_script(data_path: str | None = None) -> dict:
    """
    Run the standalone training script (backend/ml-service/train_model.py)
    to regenerate all ensemble artifacts.

    Args:
        data_path: Optional path to a CSV/Excel training dataset.

    Returns:
        dict with training metrics.
    """
    logger.info("Running training script: %s", TRAIN_SCRIPT)

    cmd = [sys.executable, str(TRAIN_SCRIPT)]
    if data_path:
        cmd += ["--data", str(Path(data_path).resolve())]

    result = subprocess.run(cmd, capture_output=True, text=True, cwd=str(PROJECT_ROOT))

    # Forward output
    if result.stdout:
        for line in result.stdout.strip().splitlines():
            logger.info("[train_model] %s", line)
    if result.stderr:
        for line in result.stderr.strip().splitlines():
            (logger.error if result.returncode != 0 else logger.info)(
                "[train_model] %s", line
            )

    if result.returncode != 0:
        raise RuntimeError(f"Training script failed (exit {result.returncode})")

    if not _check_artifacts():
        raise RuntimeError("Training script completed but artifact files are missing")

    logger.info("Model extraction from training script succeeded")
    return _read_metrics()


def _read_metrics() -> dict:
    """Read and return saved training metrics from disk."""
    metrics_path = MODELS_DIR / "training_metrics.json"
    if metrics_path.exists():
        with open(metrics_path) as fh:
            return json.load(fh)
    return {}


def main() -> None:
    parser = argparse.ArgumentParser(
        description="Extract and save SmartContainer ensemble models from the notebook or training script"
    )
    parser.add_argument(
        "--from-script",
        action="store_true",
        help="Skip notebook execution and run train_model.py directly",
    )
    parser.add_argument(
        "--data",
        type=str,
        default=None,
        help="Path to CSV/Excel training data (default: uses data bundled in notebook / synthetic data)",
    )
    parser.add_argument(
        "--force",
        action="store_true",
        help="Re-train even if all artifacts already exist",
    )
    args = parser.parse_args()

    if not args.force and _check_artifacts():
        logger.info("All artifacts already present. Use --force to re-train.")
        metrics = _read_metrics()
        if metrics:
            print(json.dumps(metrics, indent=2))
        return

    if args.from_script:
        metrics = extract_from_script(args.data)
    else:
        metrics = extract_from_notebook(args.data)

    print(json.dumps(metrics, indent=2, default=str))
    logger.info("Done. Artifacts in %s", MODELS_DIR)


if __name__ == "__main__":
    main()
