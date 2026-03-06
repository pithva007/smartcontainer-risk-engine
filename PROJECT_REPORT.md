# SmartContainer Risk Engine — Project Report

**Date:** 5 March 2026  
**Repository:** [github.com/pithva007/smartcontainer-risk-engine](https://github.com/pithva007/smartcontainer-risk-engine)  
**Team:** Khushpithva  
**Event:** Hackamined Hackathon

---

## Table of Contents

1. [Project Overview](#1-project-overview)
2. [Problem Statement](#2-problem-statement)
3. [Solution Architecture](#3-solution-architecture)
4. [Technology Stack](#4-technology-stack)
5. [Backend — Node.js API](#5-backend--nodejs-api)
6. [ML Microservice — Python FastAPI](#6-ml-microservice--python-fastapi)
7. [Frontend — React Application](#7-frontend--react-application)
8. [Database Design](#8-database-design)
9. [Security Implementation](#9-security-implementation)
10. [Observability & DevOps](#10-observability--devops)
11. [API Reference](#11-api-reference)
12. [Running the Project](#12-running-the-project)
13. [Current Status](#13-current-status)
14. [Future Improvements](#14-future-improvements)

---

## 1. Project Overview

**SmartContainer Risk Engine** is a full-stack, production-grade platform that enables customs authorities and port operators to detect high-risk shipping containers using machine learning. The system ingests shipment declaration data, runs real-time ML inference, and surfaces actionable intelligence through a modern web dashboard.

### Key Capabilities

- **ML-powered risk scoring** — every container receives a `0–1` risk score and is classified as `Critical`, `Low Risk`, or `Clear`
- **Anomaly detection** — flags weight discrepancies, high-value shipments, suspicious routing, excessive dwell time, and behavioral patterns
- **Real-time ship tracking** — simulates vessel position updates along origin→destination routes with GeoJSON overlays
- **Async bulk processing** — upload CSV datasets and process thousands of containers in the background with live progress polling
- **Customs workflow** — inspection queue, container assignment, status management, and audit notes
- **Full observability** — Prometheus metrics, Swagger/OpenAPI docs, structured logging, request tracing

---

## 2. Problem Statement

Port authorities inspect only a fraction of incoming containers due to volume constraints. Without intelligent prioritization:

- High-risk containers slip through undetected
- Low-risk shipments waste inspector time
- Documentation fraud (weight/value discrepancies) goes unnoticed
- No unified intelligence dashboard exists for operations teams

**Goal:** Build a system that automatically scores container risk, surfaces the highest-priority cases, and provides an actionable operations dashboard.

---

## 3. Solution Architecture

```
┌─────────────────────────────────────────────────────────┐
│                    Browser (React)                       │
│              localhost:5173  (Vite dev)                  │
└───────────────────────┬─────────────────────────────────┘
                        │ HTTP / JSON (JWT Bearer)
                        ▼
┌─────────────────────────────────────────────────────────┐
│              Node.js / Express API                       │
│                   localhost:3000                         │
│                                                          │
│  ┌──────────┐  ┌──────────┐  ┌────────────────────┐    │
│  │ Auth MW  │  │ Zod Val  │  │ Audit Log MW        │    │
│  └──────────┘  └──────────┘  └────────────────────┘    │
│                                                          │
│  ┌──────────────────────────────────────────────────┐   │
│  │               Route Handlers                      │   │
│  │  auth | dashboard | upload | predict | map        │   │
│  │  tracking | queue | reports | jobs                │   │
│  └──────────────────────────────────────────────────┘   │
│                                                          │
│  ┌──────────────┐    ┌────────────────────────────┐     │
│  │  BullMQ Jobs │    │  Tracking Cron (10 min)    │     │
│  │  (Redis/     │    │  refreshAllActiveTracks()  │     │
│  │  in-process) │    └────────────────────────────┘     │
│  └──────────────┘                                        │
└──────┬───────────────────────────┬───────────────────────┘
       │                           │
       ▼                           ▼
┌─────────────┐         ┌─────────────────────┐
│  MongoDB    │         │  Python FastAPI      │

│ (local:     │         │  ML Microservice     │
│  27017)     │         │  localhost:8000      │
│             │         │  96.83% accuracy     │
│  231 docs   │         │  Random Forest +     │
│  50 tracks  │         │  feature engineering │
└─────────────┘         └─────────────────────┘
       ▲
       │
┌─────────────┐
│  Redis      │
│ (optional)  │
│ Falls back  │
│ gracefully  │
└─────────────┘
```

---

## 4. Technology Stack

### Backend
| Technology | Version | Purpose |
|---|---|---|
| Node.js | 18+ | Runtime |
| Express | 4.x | HTTP framework |
| Mongoose | 8.x | MongoDB ODM |
| BullMQ | 5.x | Background job queue |
| ioredis | 5.x | Redis client |
| jsonwebtoken | 9.x | JWT auth |
| bcryptjs | 2.x | Password hashing |
| zod | 3.x | Input validation |
| prom-client | 15.x | Prometheus metrics |
| swagger-jsdoc | 6.x | OpenAPI spec generation |
| swagger-ui-express | 5.x | Swagger UI |
| multer | 1.x | File upload handling |
| csv-parse | 5.x | CSV parsing |
| pdfkit | 0.x | PDF report generation |
| node-geocoder | 4.x | Country → coordinates |
| winston | 3.x | Structured logging |
| express-rate-limit | 7.x | Rate limiting |
| helmet | 7.x | HTTP security headers |
| cors | 2.x | CORS middleware |

### ML Service
| Technology | Purpose |
|---|---|
| Python 3.10+ | Runtime |
| FastAPI | HTTP framework |
| scikit-learn | Random Forest model |
| pandas | Data processing |
| joblib | Model serialization |
| uvicorn | ASGI server |

### Frontend
| Technology | Version | Purpose |
|---|---|---|
| React | 19 | UI framework |
| TypeScript | 5.x | Type safety |
| Vite | 7.x | Build tool / dev server |
| TanStack Query | v5 | Server state / caching |
| React Router | v7 | Client-side routing |
| Axios | 1.x | HTTP client |
| Tailwind CSS | v4 | Utility-first styling |
| Recharts | 2.x | Charts (donut, bar) |
| Leaflet + react-leaflet | 1.x | Interactive maps |
| Lucide React | 0.x | Icon library |
| react-hot-toast | 2.x | Toast notifications |

### Infrastructure
| Technology | Purpose |
|---|---|
| MongoDB 8.x (local) | Primary database |
| Redis (optional) | Job queue backing store |
| Docker + Compose | Container deployment |

---

## 5. Backend — Node.js API

### File Structure

```
backend/
├── server.js                    # Entry point — connects DB, starts server, seeds admin
├── src/
│   ├── app.js                   # Express app setup, middleware, routes
│   ├── config/
│   │   ├── database.js          # Mongoose connection
│   │   ├── redis.js             # Redis connection with graceful fallback
│   │   └── swagger.js           # OpenAPI 3.0 definition
│   ├── controllers/
│   │   ├── authController.js    # login, register, me, logout, users
│   │   ├── dashboardController.js
│   │   ├── uploadController.js  # Enqueues UPLOAD_DATASET job → 202
│   │   ├── predictController.js
│   │   ├── mapController.js
│   │   ├── trackingController.js
│   │   ├── workflowController.js
│   │   ├── jobController.js
│   │   └── reportController.js
│   ├── middleware/
│   │   ├── auth.js              # requireAuth, requireRole
│   │   ├── auditLog.js          # Records all actions
│   │   ├── metricsMiddleware.js # Prometheus request metrics
│   │   └── requestId.js         # UUID per request
│   ├── models/
│   │   ├── containerModel.js
│   │   ├── userModel.js
│   │   ├── shipmentTrackModel.js
│   │   ├── batchModel.js
│   │   ├── auditLogModel.js
│   │   └── jobModel.js
│   ├── routes/
│   │   ├── authRoutes.js
│   │   ├── dashboardRoutes.js
│   │   ├── uploadRoutes.js
│   │   ├── predictRoutes.js
│   │   ├── mapRoutes.js
│   │   ├── trackingRoutes.js
│   │   ├── workflowRoutes.js
│   │   ├── jobRoutes.js
│   │   └── reportRoutes.js
│   ├── services/
│   │   ├── jobQueueService.js   # BullMQ + in-process fallback
│   │   ├── uploadJobProcessor.js # CSV → ML → upsert → result CSV
│   │   ├── trackingService.js   # Geocoding + position simulation
│   │   ├── mlService.js         # HTTP calls to FastAPI
│   │   ├── reportService.js     # CSV + PDF generation
│   │   └── metricsService.js    # Prometheus client
│   └── utils/
│       ├── logger.js
│       └── validators.js        # Zod schemas
├── scripts/
│   └── seed.js                  # Seeds 200 containers + 50 tracks
├── .env                         # All config (secrets, DB URI, admin creds)
├── .env.example
├── Dockerfile
├── docker-compose.yml
└── test_api.sh                  # 34-test API test suite
```

### Key Design Decisions

**Graceful Redis fallback** — The service probes Redis with a `lazyConnect` ioredis instance. If unavailable, it switches to an in-process job queue (no `BullMQ` dependency at runtime), so the app starts cleanly without Redis.

**JWT + Audit** — Every protected action records who did what and when in the `auditlogs` collection.

**Upload as async job** — `POST /api/upload` returns `202 Accepted` + `{job_id, poll_url}` immediately. Processing happens in the background. Frontend polls `GET /api/jobs/:id` every 2 seconds until `completed` or `failed`.

---

## 6. ML Microservice — Python FastAPI

### Model Details

| Attribute | Value |
|---|---|
| Algorithm | Random Forest Classifier |
| Accuracy | **96.83%** |
| Input features | 16 (weight, value, origin, HS code, dwell time, etc.) |
| Output | Risk Score (0–1), Risk Level, Anomaly Flag, Explanation |

### Anomaly Types Detected

| Anomaly | Trigger |
|---|---|
| `weight_discrepancy` | Measured vs declared weight difference > 15% |
| `high_value` | Declared value > $100,000 |
| `route` | High-risk origin/destination pairing |
| `dwell_time` | Container held at port > threshold hours |
| `behavior` | Importer/exporter low historical activity |

### Endpoints

- `POST /predict` — single container prediction
- `POST /predict-batch` — batch predictions (used by upload processor)
- `GET /health` — service health

---

## 7. Frontend — React Application

### File Structure

```
frontend/src/
├── api/
│   ├── apiClient.ts        # Axios + JWT interceptor + 401 redirect
│   └── routes.ts           # All typed API call functions
├── context/
│   └── AuthContext.tsx     # AuthProvider + useAuth() hook
├── pages/
│   ├── Login.tsx           # Login form
│   ├── Dashboard.tsx       # KPIs, charts, alert feed, high-risk table
│   ├── Upload.tsx          # File upload + job polling + history
│   ├── Predict.tsx         # Single container prediction form
│   ├── Map.tsx             # Leaflet map with GeoJSON routes
│   └── Tracking.tsx        # Sortable/filterable container table
├── components/
│   ├── layout/
│   │   ├── AppLayout.tsx
│   │   ├── Sidebar.tsx     # Nav + user info + logout
│   │   └── Header.tsx
│   ├── ContainerTable.tsx
│   ├── RiskChart.tsx
│   ├── SummaryCards.tsx
│   ├── TrackingTimeline.tsx
│   └── ui/
│       └── Skeleton.tsx
└── types/
    └── apiTypes.ts         # Full TypeScript types for all API responses
```

### Auth Flow

```
User visits /  →  ProtectedRoute checks useAuth()
                       ↓ not authenticated
                  Redirect to /login
                       ↓ submit credentials
                  POST /api/auth/login
                       ↓ receive JWT
                  localStorage.setItem('sce_token', token)
                       ↓
                  Navigate to / (Dashboard)
                       ↓
                  Every API request has Authorization: Bearer <token>
                       ↓ 401 received
                  Clear token → redirect /login
```

### Upload Job Polling Flow

```
User drops CSV →  POST /api/upload  →  202 { job_id, poll_url }
                       ↓
                  ActiveJobPoller component mounts
                       ↓
                  GET /api/jobs/:job_id  (every 2s)
                       ↓ status = waiting/active
                  Show progress bar + % complete
                       ↓ status = completed/failed
                  Show result (records processed)
                  Refresh job history table
```

---

## 8. Database Design

### Collections

#### `containers`
```json
{
  "container_id": "C10001",
  "origin_country": "China",
  "destination_country": "United Kingdom",
  "destination_port": "Felixstowe",
  "hs_code": "8471.30",
  "declared_value": 45230.50,
  "declared_weight": 12000,
  "measured_weight": 13800,
  "dwell_time_hours": 72,
  "clearance_status": "Hold",
  "risk_score": 0.8712,
  "risk_level": "Critical",
  "anomaly_flags": ["weight_discrepancy", "high_value"],
  "anomaly_flag": true,
  "batch_id": "BATCH_SEED_001",
  "processed_at": "2026-03-05T10:00:00.000Z"
}
```

#### `shipmenttracks`
```json
{
  "container_id": "C10001",
  "status": "active",
  "origin": { "name": "China", "coordinates": [121.47, 31.23] },
  "destination": { "name": "United Kingdom", "coordinates": [-0.13, 51.51] },
  "current_position": { "type": "Point", "coordinates": [60.5, 42.1] },
  "stops": [...],
  "events": [...],
  "geojson": { "type": "Feature", "geometry": { "type": "LineString" } },
  "vessel_name": "MV Maersk 742",
  "updated_at": "2026-03-05T13:00:00.000Z"
}
```

#### `users`
```json
{
  "username": "admin",
  "email": "admin@smartcontainer.local",
  "role": "admin",
  "full_name": "System Administrator",
  "is_active": true,
  "last_login": "2026-03-05T13:53:34.000Z"
}
```

### Current Data Counts
| Collection | Documents |
|---|---|
| containers | 231 |
| shipmenttracks | 50 |
| users | 1 |
| batches | 1 |

### Risk Distribution (seeded data)
| Level | Count | % |
|---|---|---|
| Critical | 71 | 30.7% |
| Low Risk | 62 | 26.8% |
| Clear | 98 | 42.4% |

---

## 9. Security Implementation

| Concern | Implementation |
|---|---|
| Authentication | JWT (HS256), 7-day expiry, stored in localStorage |
| Authorization | Role-based (`admin`, `analyst`, `viewer`) via `requireRole` middleware |
| Password storage | bcrypt hash (never stored plaintext) |
| Input validation | Zod schemas on all request bodies — protects against injection |
| HTTP headers | `helmet` sets CSP, HSTS, X-Frame-Options, etc. |
| Rate limiting | 100 req / 15 min window (configurable via env) |
| CORS | Configured to allow only known origins |
| Secrets | All credentials in `.env`, excluded from git via `.gitignore` |
| Audit trail | Every auth and write action logged to `auditlogs` collection |
| Request tracing | UUID `request_id` on every response for incident investigation |

---

## 10. Observability & DevOps

### Health Check
```
GET /health
→ { status, version, database, environment, request_id }
```

### Prometheus Metrics (`GET /metrics`)
All metrics prefixed `sce_`:
- `sce_http_requests_total` — request count by method/route/status
- `sce_http_request_duration_seconds` — latency histogram
- `sce_active_connections` — current open connections
- `sce_containers_processed_total` — ML predictions served

### Swagger UI
Full interactive API docs with request/response schemas at `GET /docs`  
Raw OpenAPI JSON at `GET /docs.json`

### Logging
Structured JSON logs via `winston`:
- `info` — server events, connections, job completions
- `warn` — non-fatal issues (Redis unavailable, seed skipped)
- `error` — exceptions and failures
- `debug` — tracking refresh cycles

### Docker
```yaml
# docker-compose.yml services:
# - backend   (Node.js, port 3000)
# - ml-service (Python FastAPI, port 8000)
# - redis      (port 6379)
```

### Test Suite
`test_api.sh` — 34 automated tests covering:
- Auth (login, me, validation failures)
- Dashboard endpoints
- Upload + job polling
- Prediction (single + batch)
- Map routes + GeoJSON
- Ship tracking
- Workflow queue
- CSV + PDF reports
- Prometheus metrics
- Swagger docs

---

## 11. API Reference

### Auth
| Method | Path | Auth | Description |
|---|---|---|---|
| POST | `/api/auth/login` | — | Login → JWT token |
| GET | `/api/auth/me` | ✅ | Current user profile |
| POST | `/api/auth/logout` | ✅ | Logout (audit record) |
| POST | `/api/auth/register` | admin | Create user |
| GET | `/api/auth/users` | admin | List all users |
| PATCH | `/api/auth/users/:id/active` | admin | Toggle active status |

### Dashboard
| Method | Path | Description |
|---|---|---|
| GET | `/api/summary` | Aggregate KPIs |
| GET | `/api/dashboard/risk-distribution` | Count by risk level |
| GET | `/api/dashboard/anomaly-stats` | Anomaly breakdown |
| GET | `/api/dashboard/top-risky-routes` | Highest-risk O/D pairs |
| GET | `/api/dashboard/recent-high-risk` | Latest critical containers |

### Upload & Jobs
| Method | Path | Description |
|---|---|---|
| POST | `/api/upload` | Upload CSV → 202 + job_id |
| GET | `/api/jobs` | List all jobs |
| GET | `/api/jobs/:id` | Job status + progress |
| GET | `/api/jobs/:id/logs` | Job log messages |
| GET | `/api/jobs/:id/result` | Job result data |

### Prediction
| Method | Path | Description |
|---|---|---|
| POST | `/api/predict` | Single container risk score |
| POST | `/api/predict-batch` | Batch prediction |

### Map & Tracking
| Method | Path | Description |
|---|---|---|
| GET | `/api/map/all-routes` | All routes as GeoJSON FeatureCollection |
| GET | `/api/container-route/:id` | Single container route detail |
| GET | `/api/map/track/:id` | Live tracking for container |
| GET | `/api/map/tracks` | All active tracks (paginated) |
| GET | `/api/map/heatmap` | Heatmap data points |

### Workflow Queue
| Method | Path | Description |
|---|---|---|
| GET | `/api/queue` | Inspection queue |
| POST | `/api/containers/:id/assign` | Assign to inspector |
| POST | `/api/containers/:id/status` | Update status |
| POST | `/api/containers/:id/notes` | Add note |

### Reports
| Method | Path | Description |
|---|---|---|
| GET | `/api/report/summary.csv` | Download risk summary CSV |
| GET | `/api/report/summary.pdf` | Download risk summary PDF |

### System
| Method | Path | Description |
|---|---|---|
| GET | `/health` | Health check |
| GET | `/metrics` | Prometheus metrics |
| GET | `/docs` | Swagger UI |
| GET | `/docs.json` | OpenAPI JSON spec |

---

## 12. Running the Project

### Prerequisites
- Node.js 18+
- Python 3.10+
- MongoDB (local, port 27017)
- npm / pip

### Start Backend
```bash
cd backend
npm install
node scripts/seed.js     # first time only — seeds 200 containers
node server.js
# API running at http://localhost:3000
# Swagger UI at http://localhost:3000/docs
```

### Start ML Service
```bash
cd backend/ml-service
pip install -r requirements.txt
uvicorn app:app --port 8000
```

### Start Frontend
```bash
cd frontend
npm install
npm run dev
# UI at http://localhost:5173
```

### Default Credentials
| Field | Value |
|---|---|
| Username | `admin` |
| Password | `Admin@12345` |

*(Configurable via `backend/.env` — `ADMIN_USERNAME` / `ADMIN_PASSWORD`)*

### Environment Variables (backend/.env)
```env
PORT=3000
NODE_ENV=development
MONGODB_URI=mongodb://localhost:27017/smartcontainer_db
REDIS_HOST=localhost
REDIS_PORT=6379
ML_SERVICE_URL=http://localhost:8000
JWT_SECRET=change_this_secret_in_production
JWT_EXPIRY=7d
ADMIN_USERNAME=admin
ADMIN_PASSWORD=Admin@12345
ADMIN_EMAIL=admin@smartcontainer.local
```

---

## 13. Current Status

| Component | Status | Notes |
|---|---|---|
| Backend API | ✅ Running | Port 3000, all 21 endpoints live |
| MongoDB | ✅ Connected | Local, 231 containers seeded |
| ML Service | ✅ Running | Port 8000, 96.83% accuracy |
| Redis | ⚠️ Optional | Not running — in-process queue fallback active |
| Frontend | ✅ Running | Port 5173, auth flow working |
| JWT Auth | ✅ Working | Login/logout/protected routes |
| Ship Tracking | ✅ Working | 50 active tracks, 10-min refresh |
| Upload Jobs | ✅ Working | Async 202 flow + live polling |
| Swagger Docs | ✅ Available | /docs — 21 paths documented |
| Prometheus | ✅ Available | /metrics — sce_* metrics |
| Git | ✅ Pushed | github.com/pithva007/smartcontainer-risk-engine |

---

## 14. Future Improvements

| Priority | Improvement |
|---|---|
| High | Connect back to MongoDB Atlas (add current IP to Atlas whitelist) |
| High | Start Redis for persistent job queues across restarts |
| High | Add refresh token mechanism (currently JWT is short-lived) |
| Medium | Real AIS vessel tracking API integration (MarineTraffic / AISHub) |
| Medium | WebSocket push for live dashboard updates |
| Medium | Role-based UI — hide admin pages from analyst/viewer roles |
| Medium | Multi-tenancy — per-port-authority data isolation |
| Low | Dark/light theme toggle |
| Low | Mobile-responsive layout improvements |
| Low | Export individual container PDF reports |
| Low | Email/SMS alerting for Critical detections |

---

*Generated: 5 March 2026 — SmartContainer Risk Engine v2.0*
