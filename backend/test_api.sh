#!/usr/bin/env bash
# ============================================================
# SmartContainer Risk Engine — End-to-End API Test Script
# Usage: chmod +x test_api.sh && ./test_api.sh
# ============================================================

BASE_URL="${API_URL:-http://localhost:3000}"
ML_URL="${ML_URL:-http://localhost:8000}"
SAMPLE_CSV="./data/sample/sample_shipments.csv"
PASS=0
FAIL=0
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m'

pass() { echo -e "${GREEN}  ✓ $1${NC}"; PASS=$((PASS+1)); }
fail() { echo -e "${RED}  ✗ $1${NC}"; FAIL=$((FAIL+1)); }
section() { echo -e "\n${YELLOW}▶ $1${NC}"; }

# Helper: check HTTP status and optional JSON key
check() {
  local label="$1" expected_status="$2" response="$3" check_key="$4"
  local status
  status=$(echo "$response" | tail -1)

  if [[ "$status" == "$expected_status" ]]; then
    if [[ -n "$check_key" ]]; then
      if echo "$response" | head -1 | python3 -c "import sys,json; d=json.load(sys.stdin); exit(0 if '$check_key' in str(d) else 1)" 2>/dev/null; then
        pass "$label (status $status, contains '$check_key')"
      else
        fail "$label (status $status but missing key '$check_key')"
      fi
    else
      pass "$label (status $status)"
    fi
  else
    fail "$label (expected $expected_status, got $status)"
    echo "    Response: $(echo "$response" | head -1 | head -c 200)"
  fi
}

# ── 1. Health Checks ─────────────────────────────────────────────────────────
section "Health Checks"

R=$(curl -s -w "\n%{http_code}" "$BASE_URL/health")
check "Node.js backend health" "200" "$R" "smartcontainer-risk-engine"

R=$(curl -s -w "\n%{http_code}" "$ML_URL/health")
check "ML microservice health" "200" "$R" "ml-microservice"

# ── 2. Upload Dataset ────────────────────────────────────────────────────────
section "Upload Dataset (POST /api/upload)"

if [[ ! -f "$SAMPLE_CSV" ]]; then
  fail "Sample CSV not found at $SAMPLE_CSV"
else
  R=$(curl -s -w "\n%{http_code}" -X POST "$BASE_URL/api/upload" \
    -F "dataset=@$SAMPLE_CSV")
  check "Upload sample CSV" "200" "$R" "batch_id"
  BATCH_ID=$(echo "$R" | head -1 | python3 -c "import sys,json; print(json.load(sys.stdin).get('batch_id',''))" 2>/dev/null)
fi

# ── 3. Dashboard Summary ─────────────────────────────────────────────────────
section "Dashboard Summary (GET /api/summary)"

R=$(curl -s -w "\n%{http_code}" "$BASE_URL/api/summary")
check "Dashboard summary" "200" "$R" "total_containers"

# ── 4. Risk Distribution Chart ───────────────────────────────────────────────
section "Risk Distribution (GET /api/dashboard/risk-distribution)"

R=$(curl -s -w "\n%{http_code}" "$BASE_URL/api/dashboard/risk-distribution")
check "Risk distribution" "200" "$R" "success"

# ── 5. Top Risky Routes ──────────────────────────────────────────────────────
section "Top Risky Routes (GET /api/dashboard/top-risky-routes)"

R=$(curl -s -w "\n%{http_code}" "$BASE_URL/api/dashboard/top-risky-routes?limit=5")
check "Top risky routes" "200" "$R" "data"

# ── 6. Anomaly Stats ─────────────────────────────────────────────────────────
section "Anomaly Stats (GET /api/dashboard/anomaly-stats)"

R=$(curl -s -w "\n%{http_code}" "$BASE_URL/api/dashboard/anomaly-stats")
check "Anomaly stats" "200" "$R" "success"

# ── 7. Recent High-Risk Containers ──────────────────────────────────────────
section "Recent High-Risk (GET /api/dashboard/recent-high-risk)"

R=$(curl -s -w "\n%{http_code}" "$BASE_URL/api/dashboard/recent-high-risk?limit=5")
check "Recent high-risk" "200" "$R" "success"

# ── 8. Single Prediction ─────────────────────────────────────────────────────
section "Single Prediction (POST /api/predict)"

PAYLOAD='{
  "container_id": "TEST001",
  "origin_country": "Nigeria",
  "destination_country": "Netherlands",
  "destination_port": "Rotterdam",
  "trade_regime": "Import",
  "importer_id": "IMP_TEST",
  "exporter_id": "EXP_TEST",
  "declared_value": 9500,
  "declared_weight": 22000,
  "measured_weight": 38000,
  "dwell_time_hours": 200,
  "shipping_line": "Hapag-Lloyd",
  "clearance_status": "Held"
}'
R=$(curl -s -w "\n%{http_code}" -X POST "$BASE_URL/api/predict" \
  -H "Content-Type: application/json" \
  -d "$PAYLOAD")
check "Predict single container" "200" "$R" "risk_score"

# Print prediction result
echo "    Result: $(echo "$R" | head -1 | python3 -c \
  "import sys,json; d=json.load(sys.stdin)['prediction']; print(f\"  risk_level={d['risk_level']}, score={d['risk_score']}, anomaly={d['anomaly_flag']}\")" 2>/dev/null)"

# ── 9. Batch Prediction ──────────────────────────────────────────────────────
section "Batch Prediction (POST /api/predict-batch)"

if [[ -f "$SAMPLE_CSV" ]]; then
  R=$(curl -s -w "\n%{http_code}" -X POST "$BASE_URL/api/predict-batch" \
    -F "dataset=@$SAMPLE_CSV" \
    -o /tmp/batch_predictions.csv)
  STATUS=$(echo "$R" | tail -1)
  if [[ "$STATUS" == "200" ]] && [[ -s /tmp/batch_predictions.csv ]]; then
    LINES=$(wc -l < /tmp/batch_predictions.csv | tr -d ' ')
    pass "Batch prediction CSV returned ($LINES lines)"
    echo "    Saved to /tmp/batch_predictions.csv"
  else
    fail "Batch prediction (status $STATUS)"
  fi
else
  fail "Batch prediction (sample CSV missing)"
fi

# ── 10. Container Route Map ──────────────────────────────────────────────────
section "Container Route Map (GET /api/container-route/:id)"

R=$(curl -s -w "\n%{http_code}" "$BASE_URL/api/container-route/C10001")
check "Container route C10001" "200" "$R" "origin"

# ── 11. All Routes GeoJSON ───────────────────────────────────────────────────
section "All Routes GeoJSON (GET /api/map/all-routes)"

R=$(curl -s -w "\n%{http_code}" "$BASE_URL/api/map/all-routes?limit=10")
check "All routes GeoJSON" "200" "$R" "geojson"

# ── 12. Upload Batches ───────────────────────────────────────────────────────
section "Upload Batches (GET /api/upload/batches)"

R=$(curl -s -w "\n%{http_code}" "$BASE_URL/api/upload/batches")
check "Upload batches list" "200" "$R" "batches"

# ── 13. Validation Errors ────────────────────────────────────────────────────
section "Input Validation"

R=$(curl -s -w "\n%{http_code}" -X POST "$BASE_URL/api/predict" \
  -H "Content-Type: application/json" -d '{}')
check "Reject prediction with no container_id" "400" "$R"

R=$(curl -s -w "\n%{http_code}" "$BASE_URL/api/container-route/NONEXISTENT_XYZ_999")
check "404 for unknown container route" "404" "$R"

# ── 14. ML Service Endpoints ─────────────────────────────────────────────────
section "ML Service Direct (POST /predict)"

R=$(curl -s -w "\n%{http_code}" -X POST "$ML_URL/predict" \
  -H "Content-Type: application/json" \
  -d '{"container_id":"ML001","weight_mismatch_percentage":55,"dwell_time_hours":200,"trade_route_risk":0.8,"importer_frequency":1}')
check "ML single predict" "200" "$R" "risk_score"

# ── Summary ──────────────────────────────────────────────────────────────────
TOTAL=$((PASS+FAIL))
echo -e "\n══════════════════════════════════════════"
echo -e "  Results: ${GREEN}${PASS} passed${NC} / ${RED}${FAIL} failed${NC} / ${TOTAL} total"
echo -e "══════════════════════════════════════════\n"

[[ $FAIL -eq 0 ]] && exit 0 || exit 1
