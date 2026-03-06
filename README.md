# SmartContainer Risk Engine



A production-ready backend system for analysing container shipment data, predicting risk scores, detecting anomalies, and visualising shipment routes on a map.

---

## Architecture Overview

```
┌─────────────────────────────────────────────────────────┐
│                    Client / Frontend                     │
│           (Dashboard, Map UI, REST Consumer)            │
└────────────────────────┬────────────────────────────────┘
                         │ HTTP
┌────────────────────────▼────────────────────────────────┐
│           Node.js + Express.js Backend (Port 3000)      │
│  ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────┐  │
│  │ Upload   │ │Prediction│ │Dashboard │ │   Map    │  │
│  │Controller│ │Controller│ │Controller│ │Controller│  │
│  └────┬─────┘ └────┬─────┘ └────┬─────┘ └────┬─────┘  │
│       │             │             │             │        │
│  ┌────▼─────────────▼─────────────▼─────────┐  │        │
│  │       Services Layer                      │  │        │
│  │  predictionService  anomalyService        │  │        │
│  │                            geoService ◄───┘  │        │
│  └───────────────────┬────────────────────────┘         │
│                      │                                   │
│  ┌───────────────────▼──────────────────────────────┐   │
│  │              MongoDB (containerModel)            │   │
│  │              Redis (caching layer)               │   │
│  └──────────────────────────────────────────────────┘   │
└──────────────────────┬──────────────────────────────────┘
                       │ HTTP (internal)
┌──────────────────────▼──────────────────────────────────┐
│        Python ML Microservice - FastAPI (Port 8000)     │
│   ┌──────────────────┐    ┌──────────────────────────┐  │
│   │  Random Forest   │    │    Isolation Forest      │  │
│   │  Risk Predictor  │    │    Anomaly Detector      │  │
│   └──────────────────┘    └──────────────────────────┘  │
│              models/risk_model.pkl                       │
│              models/anomaly_model.pkl                    │
└─────────────────────────────────────────────────────────┘
```

---

## Project Structure

```
smartcontainer-risk-engine/
├── docker-compose.yml
├── README.md
└── backend/
    ├── server.js                    # Entry point
    ├── package.json
    ├── .env.example
    ├── Dockerfile
    ├── src/
    │   ├── app.js                   # Express app factory
    │   ├── config/
    │   │   ├── database.js          # MongoDB connection
    │   │   └── redis.js             # Redis cache (optional)
    │   ├── controllers/
    │   │   ├── predictionController.js
    │   │   ├── uploadController.js
    │   │   ├── dashboardController.js
    │   │   └── mapController.js
    │   ├── routes/
    │   │   ├── predictionRoutes.js
    │   │   ├── uploadRoutes.js
    │   │   ├── dashboardRoutes.js
    │   │   └── mapRoutes.js
    │   ├── services/
    │   │   ├── predictionService.js
    │   │   ├── anomalyService.js
    │   │   └── geoService.js
    │   ├── models/
    │   │   └── containerModel.js    # Mongoose schema
    │   └── utils/
    │       ├── featureEngineering.js
    │       ├── riskClassifier.js
    │       ├── fileParser.js
    │       └── logger.js
    ├── ml-service/
    │   ├── main.py                  # FastAPI app
    │   ├── train_model.py           # Training pipeline
    │   ├── predict.py               # Risk prediction
    │   ├── anomaly_detection.py     # Isolation Forest
    │   ├── requirements.txt
    │   ├── Dockerfile
    │   └── models/                  # Saved .pkl files
    ├── data/
    │   └── uploads/                 # Uploaded datasets
    └── logs/
```

---

## Quick Start — Local Development (without Docker)

### Prerequisites
- Node.js >= 18
- Python >= 3.10
- MongoDB running locally on port 27017
- (Optional) Redis on port 6379

### 1. Clone & configure environment

```bash
cd smartcontainer-risk-engine/backend
cp .env.example .env
# Edit .env if needed (defaults work for local dev)
```

### 2. Install Node.js dependencies

```bash
npm install
```

### 3. Set up Python ML microservice

```bash
cd ml-service
python -m venv venv
source venv/bin/activate         # macOS/Linux
# venv\Scripts\activate          # Windows

pip install -r requirements.txt

# Train models (generates synthetic data if no CSV provided)
python train_model.py

# Start ML service
uvicorn main:app --reload --port 8000
```

### 4. Start the Node.js backend

```bash
# From backend/ directory
npm run dev
```

The API is now available at `http://localhost:3000`  
The ML microservice is at `http://localhost:8000`

---

## Quick Start — Docker Compose (Recommended)

```bash
cd smartcontainer-risk-engine

# Build and start all services
docker-compose up --build

# Or in detached mode
docker-compose up --build -d

# View logs
docker-compose logs -f backend
docker-compose logs -f ml-service

# Stop all services
docker-compose down
```

Services started:
| Service | Port |
|---------|------|
| Node.js Backend | 3000 |
| Python ML Service | 8000 |
| MongoDB | 27017 |
| Redis | 6379 |

---

## API Reference

### Health Check
```
GET /health
```

---

### 1. Upload Dataset
```
POST /api/upload
Content-Type: multipart/form-data
Field: dataset (CSV or Excel file)
```

**Response:**
```json
{
  "success": true,
  "batch_id": "uuid-here",
  "total_records": 1500,
  "inserted": 1200,
  "updated": 300
}
```

---

### 2. Train Model
```
POST /api/train
```

**Response:**
```json
{
  "success": true,
  "message": "Model training completed successfully.",
  "metrics": {
    "accuracy": 0.9234,
    "f1_score": 0.9187,
    "roc_auc": 0.9560,
    "training_samples": 2400
  }
}
```

---

### 3. Predict Single Container Risk
```
POST /api/predict
Content-Type: application/json
```

**Request Body:**
```json
{
  "container_id": "C12345",
  "origin_country": "China",
  "destination_country": "United Kingdom",
  "destination_port": "London",
  "trade_regime": "Import",
  "importer_id": "IMP001",
  "exporter_id": "EXP099",
  "declared_value": 85000,
  "declared_weight": 12000,
  "measured_weight": 18500,
  "dwell_time_hours": 120,
  "hs_code": "8471",
  "shipping_line": "Maersk",
  "clearance_status": "Under Review"
}
```

**Response:**
```json
{
  "success": true,
  "prediction": {
    "container_id": "C12345",
    "risk_score": 0.8234,
    "risk_level": "Critical",
    "anomaly_flag": true,
    "anomaly_score": 0.73,
    "explanation": "Measured weight differs from declared weight by 54.2%. Container dwell time is unusually high (120 hours).",
    "features": {
      "weight_difference": 6500,
      "weight_mismatch_percentage": 54.17,
      "value_to_weight_ratio": 4.59,
      "high_dwell_time_flag": 1,
      "dwell_time_hours": 120,
      "trade_route_risk": 0.45
    }
  }
}
```

---

### 4. Batch Prediction
```
POST /api/predict-batch
Content-Type: multipart/form-data
Field: dataset (CSV or Excel)
```

**Response:** Downloadable CSV file containing:
- `Container_ID`, `Origin_Country`, `Destination_Country`
- `Declared_Weight`, `Measured_Weight`, `Declared_Value`, `Dwell_Time_Hours`
- `Risk_Score`, `Risk_Level`, `Anomaly_Flag`, `Explanation`

---

### 5. Dashboard Summary
```
GET /api/summary
```

**Response:**
```json
{
  "success": true,
  "total_containers": 15000,
  "critical_count": 1200,
  "low_risk_count": 4500,
  "clear_count": 9300,
  "anomaly_count": 950,
  "unprocessed_count": 0,
  "risk_distribution": {
    "critical_percent": "8.0",
    "low_risk_percent": "30.0",
    "clear_percent": "62.0"
  }
}
```

---

### 6. Risk Distribution (Chart Data)
```
GET /api/dashboard/risk-distribution
```

---

### 7. Top Risky Trade Routes
```
GET /api/dashboard/top-risky-routes?limit=10
```

**Response:**
```json
{
  "success": true,
  "data": [
    {
      "origin": "Nigeria",
      "destination": "Netherlands",
      "critical_count": 145,
      "avg_risk_score": 0.784,
      "anomaly_count": 67
    }
  ]
}
```

---

### 8. Anomaly Statistics
```
GET /api/dashboard/anomaly-stats
```

---

### 9. Container Route Map
```
GET /api/container-route/:container_id
```

**Response:**
```json
{
  "success": true,
  "data": {
    "container_id": "C12345",
    "origin": { "lat": 31.2304, "lng": 121.4737 },
    "destination": { "lat": 51.9244, "lng": 4.4777 },
    "origin_country": "China",
    "destination_country": "Netherlands",
    "destination_port": "Rotterdam",
    "route": [
      [31.2304, 121.4737],
      [35.0, 90.0],
      [40.0, 60.0],
      [45.0, 30.0],
      [51.9244, 4.4777]
    ],
    "geojson": {
      "type": "Feature",
      "properties": {
        "container_id": "C12345",
        "risk_level": "Critical",
        "risk_score": 0.82
      },
      "geometry": {
        "type": "LineString",
        "coordinates": [
          [121.4737, 31.2304],
          [90.0, 35.0],
          [4.4777, 51.9244]
        ]
      }
    }
  }
}
```

---

### 10. All Routes (Map Overview)
```
GET /api/map/all-routes?page=1&limit=50&risk_level=Critical
```

Returns a GeoJSON FeatureCollection for rendering all shipment lines on a world map.

---

### 11. Upload Batch List
```
GET /api/upload/batches
```

---

## Risk Classification Logic

| Risk Score | Risk Level |
|------------|-----------|
| ≥ 0.70     | **Critical** |
| 0.40–0.69  | **Low Risk** |
| < 0.40     | **Clear** |

---

## Feature Engineering

| Feature | Formula |
|---------|---------|
| `weight_difference` | `|declared_weight - measured_weight|` |
| `weight_mismatch_percentage` | `(weight_difference / declared_weight) × 100` |
| `value_to_weight_ratio` | `declared_value / measured_weight` |
| `high_dwell_time_flag` | `1 if dwell_time_hours > 72 else 0` |
| `importer_frequency` | Count of shipments by this importer |
| `exporter_frequency` | Count of shipments by this exporter |
| `trade_route_risk` | Proportion of critical containers on this route |

---

## Training a Custom Model

You can train the model on your own dataset:

```bash
cd backend/ml-service
source venv/bin/activate

# With real data (CSV must include risk_label or risk_score column)
python train_model.py --data /path/to/your/dataset.csv

# With synthetic data (for testing)
python train_model.py
```

Or via the API endpoint after uploading data:
```bash
curl -X POST http://localhost:3000/api/train
```

---

## Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `PORT` | `3000` | Node.js server port |
| `MONGODB_URI` | `mongodb://localhost:27017/smartcontainer_db` | MongoDB connection string |
| `REDIS_HOST` | `localhost` | Redis host |
| `ML_SERVICE_URL` | `http://localhost:8000` | Python ML microservice URL |
| `GEOCODER_PROVIDER` | `openstreetmap` | Geocoding provider |
| `GEOCODER_API_KEY` | _(empty)_ | API key for paid geocoders |
| `MAX_FILE_SIZE_MB` | `50` | Maximum upload file size |
| `RATE_LIMIT_MAX_REQUESTS` | `100` | Requests per window |
| `LOG_LEVEL` | `info` | Logging verbosity |
| `CORS_ORIGINS` | `http://localhost:3000` | Allowed frontend origins |

---

## Fallback Behaviour

The system is designed to degrade gracefully:
- **Redis unavailable** → caching disabled, all requests hit MongoDB directly
- **ML microservice unavailable** → Node.js applies a heuristic scoring algorithm based on engineered features
- **Geocoding API unavailable** → falls back to a built-in static coordinate map covering 40+ countries and major ports

---

## Security

- All API routes are rate-limited (100 req/15min by default)
- `helmet.js` sets secure HTTP headers
- File uploads are type-validated and size-limited
- CORS origins are configurable and restricted
- MongoDB queries use parameterised inputs (Mongoose)
- Non-root Docker user for both services

---

## Running Tests

```bash
cd backend
npm test
```
