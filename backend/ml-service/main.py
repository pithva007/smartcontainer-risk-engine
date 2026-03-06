"""
SmartContainer Risk Engine - ML Microservice
FastAPI application that exposes endpoints for risk prediction, anomaly detection,
and model training. Communicates with the Node.js backend via HTTP.
"""

import os
import logging
from contextlib import asynccontextmanager
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field
from typing import List, Optional
import uvicorn

import model_service
from model_service import (
    predict_single_record,
    predict_batch_records,
    ensure_loaded,
    health_status,
    ValidationError,
)
from train_model import run_training_pipeline

# ── Logging ───────────────────────────────────────────────────────────────────
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
)
logger = logging.getLogger("ml-service")

# ── Lifespan: load models on startup ─────────────────────────────────────────
@asynccontextmanager
async def lifespan(app: FastAPI):
    logger.info("Loading ML models via model_service...")
    try:
        ensure_loaded()
        logger.info("Models loaded successfully")
    except Exception as e:
        logger.warning(f"Model loading failed: {e} — heuristic fallback active")
    yield
    logger.info("ML service shutting down")


app = FastAPI(
    title="SmartContainer Risk Engine - ML Service",
    description="Machine learning microservice for container risk prediction and anomaly detection",
    version="1.0.0",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # Restrict in production
    allow_methods=["*"],
    allow_headers=["*"],
)

# ── Pydantic Schemas ──────────────────────────────────────────────────────────

class ContainerFeatures(BaseModel):
    container_id: Optional[str] = None
    # Raw fields
    origin_country: Optional[str] = None
    destination_country: Optional[str] = None
    destination_port: Optional[str] = None
    hs_code: Optional[str] = None
    importer_id: Optional[str] = None
    exporter_id: Optional[str] = None
    trade_regime: Optional[str] = None
    shipping_line: Optional[str] = None
    clearance_status: Optional[str] = None
    declared_value: Optional[float] = 0.0
    declared_weight: Optional[float] = 0.0
    measured_weight: Optional[float] = 0.0
    dwell_time_hours: Optional[float] = 0.0
    # Engineered features
    weight_difference: Optional[float] = 0.0
    weight_mismatch_percentage: Optional[float] = 0.0
    value_to_weight_ratio: Optional[float] = 0.0
    high_dwell_time_flag: Optional[int] = 0
    importer_frequency: Optional[int] = 1
    exporter_frequency: Optional[int] = 1
    trade_route_risk: Optional[float] = 0.0
    # Optional temporal field
    declaration_date: Optional[str] = None


class BatchRequest(BaseModel):
    records: List[ContainerFeatures]


class PredictionResponse(BaseModel):
    container_id: Optional[str]
    risk_score: float
    anomaly_flag: bool
    anomaly_score: float


class BatchPredictionResponse(BaseModel):
    predictions: List[PredictionResponse]


class TrainingResponse(BaseModel):
    status: str
    accuracy: Optional[float] = None
    f1_score: Optional[float] = None
    roc_auc: Optional[float] = None
    training_samples: Optional[int] = None
    message: str


# ── Endpoints ─────────────────────────────────────────────────────────────────

@app.get("/health")
def health():
    return {"service": "ml-microservice", **health_status()}


@app.post("/predict", response_model=PredictionResponse)
def predict_endpoint(features: ContainerFeatures):
    """Predict risk score for a single container."""
    try:
        result = predict_single_record(features.model_dump())
        return PredictionResponse(
            container_id=features.container_id,
            risk_score=result["risk_score"],
            anomaly_flag=result["anomaly_flag"],
            anomaly_score=result["anomaly_score"],
        )
    except ValidationError as e:
        raise HTTPException(status_code=422, detail=str(e))
    except Exception as e:
        logger.error(f"Prediction error: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/predict-batch", response_model=BatchPredictionResponse)
def predict_batch_endpoint(request: BatchRequest):
    """Batch predict risk scores for multiple containers."""
    try:
        records = [r.model_dump() for r in request.records]
        results = predict_batch_records(records)

        predictions = [
            PredictionResponse(
                container_id=records[i].get("container_id"),
                risk_score=r["risk_score"],
                anomaly_flag=r["anomaly_flag"],
                anomaly_score=r["anomaly_score"],
            )
            for i, r in enumerate(results)
        ]
        return BatchPredictionResponse(predictions=predictions)
    except ValidationError as e:
        raise HTTPException(status_code=422, detail=str(e))
    except Exception as e:
        logger.error(f"Batch prediction error: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/anomaly")
def anomaly_single_endpoint(features: ContainerFeatures):
    """Detect anomaly for a single container."""
    try:
        result = predict_single_record(features.model_dump())
        return {"anomaly_flag": result["anomaly_flag"], "anomaly_score": result["anomaly_score"]}
    except ValidationError as e:
        raise HTTPException(status_code=422, detail=str(e))
    except Exception as e:
        logger.error(f"Anomaly detection error: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/anomaly-batch")
def anomaly_batch_endpoint(request: BatchRequest):
    """Batch detect anomalies."""
    try:
        records = [r.model_dump() for r in request.records]
        results = predict_batch_records(records)
        return {
            "results": [
                {"anomaly_flag": r["anomaly_flag"], "anomaly_score": r["anomaly_score"]}
                for r in results
            ]
        }
    except ValidationError as e:
        raise HTTPException(status_code=422, detail=str(e))
    except Exception as e:
        logger.error(f"Anomaly batch error: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/train", response_model=TrainingResponse)
def train_endpoint():
    """Trigger the full ML training pipeline."""
    try:
        logger.info("Training pipeline triggered via API")
        metrics = run_training_pipeline()
        return TrainingResponse(
            status="success",
            message="Model training completed successfully",
            **metrics,
        )
    except Exception as e:
        logger.error(f"Training error: {e}")
        raise HTTPException(status_code=500, detail=f"Training failed: {str(e)}")


if __name__ == "__main__":
    uvicorn.run(
        "main:app",
        host="0.0.0.0",
        port=int(os.getenv("ML_SERVICE_PORT", 8000)),
        reload=os.getenv("NODE_ENV") != "production",
        log_level="info",
    )
