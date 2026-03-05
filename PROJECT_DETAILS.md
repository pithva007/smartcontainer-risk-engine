# SmartContainer Risk Engine — Full Project Details

> **Hackamined** | Built end-to-end in one session  
> GitHub: https://github.com/pithva007/smartcontainer-risk-engine  
> Last Commit: `1984a96` · Branch: `main`

---

## Table of Contents

1. [What Was Built](#1-what-was-built)
2. [System Architecture](#2-system-architecture)
3. [Full File Structure](#3-full-file-structure)
4. [Tech Stack](#4-tech-stack)a
5. [API Endpoints (11 total)](#5-api-endpoints-11-total)
6. [ML Pipeline](#6-ml-pipeline)
7. [Database Schema](#7-database-schema)
8. [Real Datasets](#8-real-datasets)
9. [Feature Engineering](#9-feature-engineering)
10. [Risk Classification Logic](#10-risk-classification-logic)
11. [Environment Configuration](#11-environment-configuration)
12. [How to Run Locally](#12-how-to-run-locally)
13. [How to Run with Docker](#13-how-to-run-with-docker)
14. [Test Results](#14-test-results)
15. [What Was Fixed During Build](#15-what-was-fixed-during-build)
16. [Security Measures](#16-security-measures)
17. [Completed Checklist](#17-completed-checklist)

---

## 1. What Was Built

A **production-ready backend system** for customs/border agencies and logistics operators to:

- Upload bulk container shipment data (CSV / Excel)
- Automatically predict a **risk score** (0–1) and **risk level** (Critical / Low Risk / Clear) for each container
- Detect **anomalies** in declared vs measured weights, dwell times, and trade patterns
- Visualise **shipment routes** on a map as GeoJSON
- View **dashboard analytics** — risk distribution, top routes, anomaly stats
- Retrain the ML model on-demand with new data

---

## 2. System Architecture

```
┌──────────────────────────────────────────────────────┐
│              Client / Frontend / curl                │
└─────────────────────────┬────────────────────────────┘
                          │ HTTP (port 3000)
┌─────────────────────────▼────────────────────────────┐
│         Node.js + Express.js Backend (Port 3000)     │
│                                                      │
│  Routes → Controllers → Services → Mongoose Models  │
│                                                      │
│  ┌─────────────────────────────────────────────────┐ │
│  │  MongoDB Atlas (containers collection)          │ │
│  │  Redis (optional caching — graceful fallback)   │ │
│  └─────────────────────────────────────────────────┘ │
└─────────────────────────┬────────────────────────────┘
                          │ HTTP (internal, port 8000)
┌─────────────────────────▼────────────────────────────┐
│      Python FastAPI ML Microservice (Port 8000)      │
│                                                      │
│  ┌─────────────────────┐  ┌────────────────────────┐ │
│  │  Random Forest      │  │  Isolation Forest      │ │
│  │  Risk Predictor     │  │  Anomaly Detector      │ │
│  │  risk_model.pkl     │  │  anomaly_model.pkl     │ │
│  └─────────────────────┘  └────────────────────────┘ │
└──────────────────────────────────────────────────────┘
```

---

## 3. Full File Structure

```
smartcontainer-risk-engine/
│
├── README.md                          # Quick-start guide
├── PROJECT_DETAILS.md                 # This file
├── docker-compose.yml                 # Orchestrates all 4 services
├── .gitignore                         # Protects .env, *.pkl, uploads
│
├── Real-Time Data.csv                 # 8,481 real shipment records
├── Historical Data.csv                # 54,000 real historical records
│
└── backend/
    ├── server.js                      # Entry point — starts HTTP server
    ├── package.json                   # Node.js dependencies
    ├── Dockerfile                     # Node.js container image
    ├── .env.example                   # Template for environment vars
    ├── .env                           # ⚠ Real secrets — gitignored
    ├── test_api.sh                    # 16 end-to-end API tests
    │
    ├── src/
    │   ├── app.js                     # Express factory + all middleware
    │   │
    │   ├── config/
    │   │   ├── database.js            # Mongoose → MongoDB Atlas
    │   │   └── redis.js               # Redis client (graceful fallback)
    │   │
    │   ├── models/
    │   │   └── containerModel.js      # Full Mongoose schema + 4 indexes
    │   │
    │   ├── controllers/
    │   │   ├── uploadController.js    # Handles CSV/Excel file ingestion
    │   │   ├── predictionController.js# Single + batch risk prediction
    │   │   ├── dashboardController.js # Analytics aggregations
    │   │   └── mapController.js       # Route GeoJSON generation
    │   │
    │   ├── routes/
    │   │   ├── uploadRoutes.js        # POST /api/upload, GET /api/upload/batches
    │   │   ├── predictionRoutes.js    # POST /api/predict, /predict-batch, /train
    │   │   ├── dashboardRoutes.js     # GET /api/summary, /risk-distribution, etc.
    │   │   └── mapRoutes.js           # GET /api/map/route/:id, /map/all-routes
    │   │
    │   ├── services/
    │   │   ├── predictionService.js   # ML call + classification + MongoDB upsert
    │   │   ├── anomalyService.js      # Isolation Forest interface
    │   │   └── geoService.js          # Geocoding + GeoJSON route generator
    │   │
    │   └── utils/
    │       ├── featureEngineering.js  # Computes 7 derived ML features
    │       ├── riskClassifier.js      # Score → Critical/Low Risk/Clear
    │       ├── fileParser.js          # csv-parser + xlsx auto-detect
    │       └── logger.js              # Winston rotating file logger
    │
    ├── ml-service/
    │   ├── main.py                    # FastAPI app — /predict, /anomaly, /train
    │   ├── train_model.py             # Full training pipeline
    │   ├── predict.py                 # Load model, predict single + batch
    │   ├── anomaly_detection.py       # Isolation Forest train + detect
    │   ├── requirements.txt           # Python dependencies (>= not ==)
    │   ├── Dockerfile                 # Python container image
    │   └── models/
    │       ├── risk_model.pkl         # Trained Random Forest (gitignored)
    │       ├── anomaly_model.pkl      # Trained Isolation Forest (gitignored)
    │       ├── scaler.pkl             # Feature scaler (gitignored)
    │       ├── anomaly_scaler.pkl     # Anomaly scaler (gitignored)
    │       ├── encoders.pkl           # Label encoders (gitignored)
    │       └── training_metrics.json  # Last training run metrics
    │
    ├── data/
    │   ├── sample/
    │   │   └── sample_shipments.csv   # 30 synthetic records for testing
    │   └── uploads/                   # Uploaded files land here (gitignored)
    │
    └── logs/                          # Winston log files (gitignored)
```

---

## 4. Tech Stack

| Layer | Technology | Version | Purpose |
|-------|-----------|---------|---------|
| API Server | Node.js + Express.js | Node 18+ | REST API, file handling, routing |
| ML Service | Python + FastAPI | Python 3.13 | Risk + anomaly prediction endpoints |
| Risk Model | scikit-learn RandomForest | >= 1.4 | Predict container risk score (0–1) |
| Anomaly Model | scikit-learn IsolationForest | >= 1.4 | Detect weight/dwell anomalies |
| Data Processing | pandas, numpy | >= 2.0 | Feature engineering in Python |
| Database | MongoDB Atlas | Mongoose 7 | Persistent container storage |
| Caching | Redis | ioredis | Optional geocode + result cache |
| Geocoding | node-geocoder (OpenStreetMap) | — | Port/country → lat/lng coordinates |
| File Parsing | csv-parser + xlsx | — | CSV and Excel upload support |
| Logging | Winston | — | Rotating file logs |
| Security | Helmet + CORS + express-rate-limit | — | HTTP hardening |
| Containerisation | Docker + docker-compose | — | 4-service orchestration |

---

## 5. API Endpoints (11 total)

### Health
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/health` | Server + DB + ML service status |

### Upload
| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/upload` | Upload CSV or Excel, auto-predict all records |
| GET | `/api/upload/batches` | List all upload batch summaries |

### Prediction
| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/predict` | Single container JSON → risk score + explanation |
| POST | `/api/predict-batch` | Bulk CSV upload → risk scores (downloadable CSV) |
| POST | `/api/train` | Trigger model retraining, returns new metrics |

### Dashboard
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/summary` | Total containers, risk counts, anomaly count |
| GET | `/api/risk-distribution` | Breakdown by risk level |
| GET | `/api/top-routes` | Top 10 trade routes by container count |
| GET | `/api/recent-high-risk` | Last 20 Critical/Low Risk containers |
| GET | `/api/anomaly-stats` | Anomaly detection statistics |

### Map
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/map/route/:id` | GeoJSON LineString for one container's route |
| GET | `/api/map/all-routes` | GeoJSON FeatureCollection of all routes |

---

## 6. ML Pipeline

### Training (`train_model.py`)

```
Raw CSV Data
    │
    ▼
Normalise column names (lowercase + underscore)
    │
    ▼
Feature Engineering (7 derived features)
    │
    ▼
Label Encode categorical columns
    │
    ▼
StandardScaler — fit on training set
    │
    ├──► Random Forest Classifier → risk_model.pkl
    │    (100 estimators, max_depth=15, class_weight=balanced)
    │
    └──► Isolation Forest → anomaly_model.pkl
         (contamination=0.1, n_estimators=100)
```

### Trained Model Performance (on real + synthetic mix)

| Metric | Score |
|--------|-------|
| Accuracy | **96.83%** |
| F1 Score | **96.81%** |
| ROC-AUC | **98.27%** |
| Training Samples | 2,400 |

### Prediction Flow (runtime)

```
Incoming Container Record
    │
    ▼
featureEngineering.js — compute 7 features
    │
    ▼
POST http://localhost:8000/predict  (FastAPI)
    │
    ├── Returns: risk_score (float 0–1)
    ├── Returns: risk_features (top contributing features)
    │
    ▼
POST http://localhost:8000/anomaly  (FastAPI)
    │
    ├── Returns: is_anomaly (bool)
    ├── Returns: anomaly_score (float)
    │
    ▼
riskClassifier.js — classify + build explanation
    │
    ▼
MongoDB upsert (containerModel)
```

**Heuristic Fallback**: If the ML microservice is unreachable, `predictionService.js` calculates a rule-based score using weight mismatch %, dwell time, and declared value — ensuring the API never goes fully down.

---

## 7. Database Schema

**Collection**: `containers` in MongoDB Atlas

| Field | Type | Description |
|-------|------|-------------|
| `container_id` | String (unique) | Primary identifier |
| `declaration_date` | Date | Customs declaration date |
| `declaration_time` | String | HH:MM:SS |
| `trade_regime` | String | Import / Export / Transit |
| `origin_country` | String | Country code or name |
| `destination_country` | String | Country code or name |
| `destination_port` | String | Port identifier |
| `hs_code` | String | Harmonised system commodity code |
| `importer_id` | String | Importer identifier |
| `exporter_id` | String | Exporter identifier |
| `declared_value` | Number | Declared monetary value |
| `declared_weight` | Number | Declared weight (kg) |
| `measured_weight` | Number | Measured weight at port (kg) |
| `shipping_line` | String | Carrier name |
| `dwell_time_hours` | Number | Hours in port |
| `clearance_status` | String | Clear / Hold / Detained |
| `risk_score` | Number | ML output (0.0–1.0) |
| `risk_level` | String | Critical / Low Risk / Clear |
| `risk_explanation` | [String] | Human-readable reason list |
| `anomaly_flag` | Boolean | Isolation Forest result |
| `anomaly_score` | Number | Raw anomaly score |
| `geo_data` | Object | Origin + destination lat/lng |
| `route_path` | [Object] | Array of {lat,lng} waypoints |
| `upload_batch_id` | String | Groups records by upload session |
| `processed_at` | Date | When prediction was run |

**Indexes**:
- `container_id` (unique)
- `risk_level + anomaly_flag` (compound)
- `origin_country + destination_country` (compound)
- `upload_batch_id + risk_level` (compound)

---

## 8. Real Datasets

Two real shipment datasets are included in the project root:

| File | Rows | Description |
|------|------|-------------|
| `Real-Time Data.csv` | **8,481** | Current/recent shipment declarations |
| `Historical Data.csv` | **54,000** | Multi-year historical records (2020+) |

**Columns** (both files):

```
Container_ID, Declaration_Date (YYYY-MM-DD), Declaration_Time,
Trade_Regime (Import / Export / Transit), Origin_Country,
Destination_Port, Destination_Country, HS_Code, Importer_ID,
Exporter_ID, Declared_Value, Declared_Weight, Measured_Weight,
Shipping_Line, Dwell_Time_Hours, Clearance_Status
```

**To upload and run predictions on the real data:**

```bash
# Upload Real-Time dataset (auto-predicts all 8,481 records)
curl -X POST http://localhost:3000/api/upload \
  -F "dataset=@'Real-Time Data.csv'"

# Upload Historical dataset
curl -X POST http://localhost:3000/api/upload \
  -F "dataset=@'Historical Data.csv'"

# Retrain ML model on real data via API
curl -X POST http://localhost:3000/api/train

# Or retrain directly (faster)
cd backend/ml-service
python train_model.py
```

---

## 9. Feature Engineering

Both Node.js (`featureEngineering.js`) and Python (`train_model.py`) compute the same 7 derived features:

| Feature | Formula / Logic | Why It Matters |
|---------|----------------|----------------|
| `weight_difference` | `measured_weight − declared_weight` | Detects underdeclared goods |
| `weight_mismatch_percentage` | `(|diff| / declared_weight) × 100` | Normalised mismatch ratio |
| `value_to_weight_ratio` | `declared_value / declared_weight` | Flags unusually cheap/expensive cargo |
| `high_dwell_time_flag` | `1` if `dwell_time_hours > 72` else `0` | Prolonged port stays are suspicious |
| `importer_frequency` | Count of past records for same `importer_id` | Low-frequency new importers = higher risk |
| `exporter_frequency` | Count of past records for same `exporter_id` | Same for exporters |
| `trade_route_risk` | Static lookup by `origin_country` | Country-based risk tier (0.1–0.9) |

---

## 10. Risk Classification Logic

```
risk_score >= 0.7  →  🔴 Critical
risk_score >= 0.4  →  🟡 Low Risk
risk_score <  0.4  →  🟢 Clear
```

**Dynamic explanations generated per container:**

- `"Weight mismatch of X% detected"` (when mismatch > 15%)
- `"Extended dwell time: Xh in port"` (when > 72h)
- `"High-risk trade route from [country]"`
- `"Unusual value-to-weight ratio"`
- `"New/low-frequency importer"`
- `"Container cleared at customs"` (for Clean)

---

## 11. Environment Configuration

**File**: `backend/.env` (gitignored — never committed)

```env
# Server
PORT=3000
NODE_ENV=development

# MongoDB Atlas
MONGODB_URI=mongodb+srv://khushpithva_db_user:<password>@hackamined.hen5lkp.mongodb.net/smartcontainer_db?appName=Hackamined

# Redis (optional — system works without it)
REDIS_URL=redis://localhost:6379

# ML Microservice
ML_SERVICE_URL=http://localhost:8000

# File Uploads
MAX_FILE_SIZE=52428800
UPLOAD_DIR=./data/uploads

# Rate Limiting
RATE_LIMIT_WINDOW_MS=900000
RATE_LIMIT_MAX=100

# JWT (for future auth)
JWT_SECRET=your-secret-here
JWT_EXPIRY=7d

# CORS
CORS_ORIGIN=http://localhost:5173
```

**Template**: `backend/.env.example` — tracked in git, safe to share

---

## 12. How to Run Locally

### Step 1: Clone and configure

```bash
git clone https://github.com/pithva007/smartcontainer-risk-engine.git
cd smartcontainer-risk-engine/backend
cp .env.example .env
# Edit .env with your MongoDB Atlas URI
```

### Step 2: Install Node.js dependencies

```bash
npm install
```

### Step 3: Set up Python ML microservice

```bash
cd ml-service
python3 -m venv venv
source venv/bin/activate

pip install -r requirements.txt

# Train models (uses synthetic data if no CSV given)
python3 train_model.py

# Start ML service (leave this running)
uvicorn main:app --reload --port 8000
```

### Step 4: Start Node.js backend (new terminal)

```bash
cd backend
npm run dev
# or: node server.js
```

### Step 5: Verify

```bash
curl http://localhost:3000/health
# Should return: { "status": "ok", "db": "connected", "mlService": "ok" }
```

### Step 6: Run all tests

```bash
cd backend
bash test_api.sh
# Expected: 16 passed / 0 failed
```

---

## 13. How to Run with Docker

```bash
cd smartcontainer-risk-engine

# Build and start all 4 services
docker-compose up --build

# Detached mode
docker-compose up --build -d

# View logs
docker-compose logs -f backend
docker-compose logs -f ml-service

# Stop
docker-compose down
```

**Services started by Docker Compose:**

| Service | Internal Port | External Port |
|---------|--------------|---------------|
| Node.js Backend | 3000 | 3000 |
| Python ML Service | 8000 | 8000 |
| MongoDB | 27017 | 27017 |
| Redis | 6379 | 6379 |

**Health checks** configured for all services with `depends_on` ordering — MongoDB → Redis → ML Service → Backend.

---

## 14. Test Results

All 16 end-to-end tests in `backend/test_api.sh` passed:

| # | Test | Endpoint | Result |
|---|------|----------|--------|
| 1 | Node.js health check | `GET /health` | ✅ Pass |
| 2 | ML service health check | `GET localhost:8000/health` | ✅ Pass |
| 3 | Upload CSV dataset | `POST /api/upload` | ✅ Pass |
| 4 | Get upload batches | `GET /api/upload/batches` | ✅ Pass |
| 5 | Dashboard summary | `GET /api/summary` | ✅ Pass |
| 6 | Risk distribution | `GET /api/risk-distribution` | ✅ Pass |
| 7 | Top trade routes | `GET /api/top-routes` | ✅ Pass |
| 8 | Anomaly stats | `GET /api/anomaly-stats` | ✅ Pass |
| 9 | Recent high-risk containers | `GET /api/recent-high-risk` | ✅ Pass |
| 10 | Single container prediction | `POST /api/predict` | ✅ Pass |
| 11 | Batch prediction (CSV output) | `POST /api/predict-batch` | ✅ Pass |
| 12 | Container route GeoJSON | `GET /api/map/route/:id` | ✅ Pass |
| 13 | All routes GeoJSON | `GET /api/map/all-routes` | ✅ Pass |
| 14 | Validation error (400) | `POST /api/predict` bad body | ✅ Pass |
| 15 | Not found error (404) | `GET /api/map/route/FAKE` | ✅ Pass |
| 16 | ML service direct predict | `POST localhost:8000/predict` | ✅ Pass |

**Total: 16 / 16 PASSED**

---

## 15. What Was Fixed During Build

| Problem | Root Cause | Fix Applied |
|---------|-----------|-------------|
| `cd` path error | Already inside `smartcontainer-risk-engine/` directory | Used absolute paths in all commands |
| scikit-learn Cython compile error | Python 3.13 has no pre-built wheel for scikit-learn `==1.3.2` | Changed `requirements.txt` from `==` (pinned) to `>=` (flexible) to get 3.13 wheels |
| `uvicorn: Could not import module "main"` | Run from project root instead of `ml-service/` directory | Always `cd ml-service/` before `uvicorn main:app` |
| Redis connection warnings | Redis not running locally | Already handled — `redis.js` catches errors and degrades gracefully; all API calls work without Redis |
| MongoDB Atlas SSL/TLS | Default local URI in `.env` | Updated `MONGODB_URI` to Atlas `+srv` connection string |

---

## 16. Security Measures

| Area | Measure |
|------|---------|
| HTTP Headers | `helmet` middleware — sets Content-Security-Policy, X-Frame-Options, etc. |
| Rate Limiting | `express-rate-limit` — 100 requests per 15 minutes per IP |
| CORS | Configured origin whitelist via `CORS_ORIGIN` env var |
| File Upload | `multer` size limit (50 MB), restricted to CSV/xlsx MIME types |
| Secrets | `.env` is gitignored — credentials never committed |
| Passwords/Keys | `.pkl` model files gitignored — not in version control |
| Input Validation | Request body validated in controllers before processing |
| Injection | Mongoose parameterised queries — no raw MongoDB operator injection |
| Logging | Winston logs to rotating files in `/logs/` — not stdout in production |

---

## 17. Completed Checklist

- [x] Project directory structure (34 files)
- [x] `package.json` and all Node.js config files
- [x] MongoDB container model (Mongoose schema + 4 indexes)
- [x] Utility modules (featureEngineering, riskClassifier, fileParser, logger)
- [x] Service layer (predictionService, anomalyService, geoService)
- [x] All 4 controllers (upload, prediction, dashboard, map)
- [x] All 4 route files (11 endpoints total)
- [x] Express app factory + server entry point
- [x] Python ML microservice (FastAPI + Random Forest + Isolation Forest)
- [x] Docker setup (Dockerfiles + docker-compose with health checks)
- [x] README documentation
- [x] `.gitignore` (protects `.env`, `*.pkl`, `node_modules`, `logs`, `uploads`)
- [x] Sample CSV dataset (30 synthetic records)
- [x] API test script (16 tests — all passing)
- [x] ML models trained (96.83% accuracy)
- [x] MongoDB Atlas connected and verified
- [x] Both services running locally (Node :3000, FastAPI :8000)
- [x] Pushed to GitHub (`https://github.com/pithva007/smartcontainer-risk-engine`)
- [x] Real datasets provided (`Real-Time Data.csv` = 8,481 rows, `Historical Data.csv` = 54,000 rows)

---

## 18. v2 Production Upgrade

### 18.1 New Packages Installed

| Package | Purpose |
|---|---|
| `jsonwebtoken` | JWT signing/verification |
| `bcryptjs` | Password hashing (bcrypt rounds = 12) |
| `zod` | Runtime input validation + typed schemas |
| `bullmq` | Background job queue (Redis-backed, with in-process fallback) |
| `pdfkit` | Server-side PDF report generation |
| `prom-client` | Prometheus metrics (`/metrics` endpoint) |
| `swagger-ui-express` | Swagger UI served at `/docs` |
| `swagger-jsdoc` | OpenAPI 3.0 spec auto-generated from JSDoc |
| `express-async-errors` | Propagates async rejections to Express error handler |

### 18.2 New Models

| Model file | Purpose |
|---|---|
| `models/userModel.js` | User accounts with bcrypt-hashed passwords, roles: admin / officer / viewer |
| `models/jobModel.js` | Background job tracking with progress, logs, and 7-day TTL auto-cleanup |
| `models/auditLogModel.js` | Compliance audit trail — every write action logged; 1-year TTL |
| `models/geoCacheModel.js` | MongoDB-persisted geocode cache |
| `models/shipmentTrackModel.js` | Full ship tracking schema: position history, stops, events, route GeoJSON |

`containerModel.js` was updated with workflow fields: `inspection_status`, `assigned_to`, `notes[]`, `risk_explanation[]`, `updated_at`.

### 18.3 New Middleware

| File | Purpose |
|---|---|
| `middleware/auth.js` | `requireAuth` (JWT → DB lookup), `requireRole(minRole)` with hierarchy |
| `middleware/requestId.js` | UUID correlation ID on every request (`X-Request-Id` header) |

### 18.4 New Services

| Service | What it does |
|---|---|
| `jobQueueService.js` | BullMQ + Redis when available; in-process `setImmediate` fallback; `enqueueJob`, `registerProcessor`, `appendLog`, `shutdown` |
| `trackingService.js` | Full simulated ship tracking provider; geocoding chain (Redis → MongoDB → static → partial match); 50+ built-in coordinates; transit hub routing; GeoJSON FeatureCollection output |
| `auditService.js` | `audit()` helper — creates AuditLog record, never throws on failure |
| `reportService.js` | `generateCSV` (json2csv + BOM), `generatePDF` (pdfkit — branded header, bar charts, tables, multi-page) |
| `metricsService.js` | prom-client; custom counters/histograms/gauges with `sce_` prefix; `metricsMiddleware`, `metricsHandler` |
| `uploadJobProcessor.js` | UPLOAD_DATASET job handler: parse → ML predict → upsert containers → create tracks → result CSV |

### 18.5 New Controllers & Routes

**Auth** (`/api/auth/*`)
- `POST /login` — returns JWT; `POST /logout`; `GET /me`
- `POST /register` (admin only); `GET /users` (admin); `PATCH /users/:id/active` (admin)

**Jobs** (`/api/jobs/*`)
- `GET /jobs` — list jobs; `GET /jobs/:id` — status + progress; `GET /jobs/:id/logs`; `GET /jobs/:id/result`

**Workflow** (`/api/queue`, `/api/containers/:id/*`)
- `GET /queue` — sorted inspection queue (risk DESC + anomaly + dwell_time)
- `POST /containers/:id/assign` — assign officer
- `POST /containers/:id/status` — update inspection status
- `POST /containers/:id/notes` — add note (officer/admin)

**Tracking** (`/api/map/*`, `/api/tracking/*`)
- `GET /map/track/:container_id` — full track with position + GeoJSON
- `GET /map/tracks` — all active tracks as GeoJSON FeatureCollection (map-ready)
- `GET /map/heatmap` — risk heatmap point array
- `POST /tracking/link-vessel` — link vessel IMO to container
- `POST /tracking/refresh/:container_id` — force position recalculation

**Reports** (`/api/report/*`)
- `GET /report/summary.csv` — downloadable CSV report
- `GET /report/summary.pdf` — downloadable PDF report

### 18.6 New Infrastructure Endpoints

| URL | What it serves |
|---|---|
| `GET /docs` | Swagger UI (full interactive API browser) |
| `GET /docs.json` | Raw OpenAPI 3.0 JSON spec |
| `GET /metrics` | Prometheus metrics text format |
| `GET /health` | Enhanced health check (DB state, version, request_id) |

### 18.7 Upload Change

`POST /api/upload` now returns **202 Accepted** with `{ job_id, poll_url }` immediately.
Processing happens in the background (BullMQ or in-process). Poll `GET /api/jobs/:job_id` for progress.

### 18.8 Default Admin User

On first start with an empty `users` collection, the server seeds:
- **Username**: `admin`  **Password**: value of `ADMIN_DEFAULT_PASSWORD` env var (default: `Admin@12345`)
- Change immediately in production.

### 18.9 Environment Variables Added

| Variable | Default | Purpose |
|---|---|---|
| `JWT_SECRET` | (required) | Signs/verifies JWT tokens |
| `JWT_EXPIRY` | `8h` | Token lifetime |
| `ADMIN_DEFAULT_PASSWORD` | `Admin@12345` | First-run admin seeding |
| `TRACKING_UPDATE_MINS` | `10` | Interval for background position refresh |

---

*Generated: 5 March 2026 · SmartContainer Risk Engine v2 · Hackamined*
