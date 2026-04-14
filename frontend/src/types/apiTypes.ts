// ─── Risk Levels ───────────────────────────────────────────
export type RiskLevel = 'Critical' | 'Low Risk' | 'Clear';

// ─── Auth ──────────────────────────────────────────────────
export interface AuthUser {
    _id?: string;
    username: string;
    role: string;
    email?: string;
    full_name?: string;
    department?: string;
    settings?: {
        notifications: {
            highRisk: boolean;
            anomaly: boolean;
            weeklySummary: boolean;
        }
    };
}

export interface ProfileResp {
    success: boolean;
    profile: {
        full_name: string;
        official_email: string;
        department: string;
        system_role: string;
        phone_number?: string;
        profile_photo?: string;
        account_created_date?: string;
        last_login_time?: string;
        active_sessions: number;
        settings: {
            notifications: {
                highRisk: boolean;
                anomaly: boolean;
                weeklySummary: boolean;
            }
        };
    };
}

export interface SessionsResp {
    success: boolean;
    sessions: Array<{
        _id: string;
        login_time: string;
        device?: string;
        ip?: string;
    }>;
}

export interface ActivityResp {
    success: boolean;
    logs: Array<{
        _id: string;
        action: string;
        timestamp: string;
        metadata?: any;
    }>;
}

export interface LoginResponse {
    token: string;
    expires_in: string;
    user: AuthUser;
}

// ─── Dashboard ─────────────────────────────────────────────
export interface SummaryData {
    total_containers: number;
    critical_containers: number;
    low_risk_containers: number;
    clear_containers: number;
    total_anomalies: number;
}

export interface RiskDistribution {
    risk_level: RiskLevel;
    count: number;
}

export interface AnomalyStat {
    type: string; // weight | value | route | dwell | behavior
    count: number;
}

export interface TopRoute {
    origin_country: string;
    destination_country: string;
    count: number;
}

export interface RecentHighRisk {
    container_id: string;
    risk_score: number;
    risk_level: RiskLevel;
    processed_at: string;
    explanation?: string;
    // optional location fields used by dashboard tables
    origin_country?: string;
    destination_country?: string;
}

// ─── Upload ────────────────────────────────────────────────
export interface UploadJobResponse {
    success: boolean;
    job_id: string;
    poll_url?: string;
    message?: string;
    // Present when processed inline (Vercel)
    batch_id?: string;
    total_records?: number;
    processed_records?: number;
    failed_records?: number;
}

/** @deprecated — legacy shape kept for reference */
export interface UploadResponse {
    batch_id: string;
    total_records: number;
    processed: number;
}

export interface BatchRecord {
    batch_id: string;
    total_records: number;
    created_at: string;
}

// ─── Jobs ──────────────────────────────────────────────────
export type JobStatus = 'waiting' | 'active' | 'completed' | 'failed' | 'delayed';

export interface JobRecord {
    job_id: string;
    type: string;
    status: JobStatus;
    progress: number;
    created_at: string;
    finished_at?: string;
    metadata?: Record<string, unknown>;
    result?: {
        batch_id?: string;
        total_records?: number;
        processed_records?: number;
        result_csv?: string;
    };
}

// ─── Workflow Queue ────────────────────────────────────────
export interface QueueItem {
    container_id: string;
    origin_country: string;
    destination_country: string;
    risk_score: number;
    risk_level: RiskLevel;
    anomaly_flag: boolean;
    status: string;
    assigned_to?: string;
    notes?: string;
    queued_at: string;
}

// ─── Shipment Details ──────────────────────────────────────
export interface ShipmentDetail {
    _id: string;
    container_id: string;
    declaration_date: string;
    declaration_time: string;
    trade_regime: string;
    origin_country: string;
    destination_country: string;
    destination_port: string;
    hs_code: string;
    importer_id: string;
    exporter_id: string;
    declared_value: number;
    declared_weight: number;
    measured_weight: number;
    shipping_line: string;
    dwell_time_hours: number;
    clearance_status: string;
    risk_score: number;
    risk_level: RiskLevel;
    anomaly_flag: boolean;
    auto_escalated_by_importer_history?: boolean;
    auto_escalated_by_new_trader_rule?: boolean;
    importer_critical_percentage?: number;
    exporter_historical_shipment_count?: number;
    new_trader_threshold_used?: number;
    override_reason?: string | null;
    explanation?: string;
    inspection_recommendation?: InspectionRecommendation;
    inspection_status: string;
    assigned_to?: string;
    notes: Array<{ text: string; added_by: string; timestamp: string }>;
    risk_explanation: string[];
    createdAt: string;
    updatedAt: string;
}

export interface ContainerLocation {
    container_id: string;
    current_port: string;
    country: string;
    lat: number;
    lng: number;
    clearance_status: string;
    risk_level: RiskLevel;
    risk_score: number;
    origin_country: string;
    destination_country: string;
    destination_port?: string;
    anomaly_flag: boolean;
    explanation?: string;
    inspection_recommendation?: InspectionRecommendation;
    route: Array<[number, number]>;
    origin_coords?: { lat: number; lng: number };
    dest_coords?: { lat: number; lng: number };
}

// ─── Prediction ────────────────────────────────────────────
export interface PredictionInput {
    Container_ID: string;
    Declaration_Date: string;
    Declaration_Time: string;
    Trade_Regime: string;
    Origin_Country: string;
    Destination_Country: string;
    Destination_Port: string;
    HS_Code: string;
    Importer_ID: string;
    Exporter_ID: string;
    Declared_Value: number;
    Declared_Weight: number;
    Measured_Weight: number;
    Shipping_Line: string;
    Dwell_Time_Hours: number;
    Clearance_Status: string;
}

export interface ContainerPrediction {
    Container_ID: string;
    Risk_Score: number;
    Risk_Level: RiskLevel;
    Anomaly_Flag: boolean;
    Explanation_Summary: string[];
}

// ─── Map ───────────────────────────────────────────────────
export interface RouteFeature {
    type: 'Feature';
    properties: {
        container_id: string;
        risk_level: RiskLevel;
        anomaly_flag: boolean;
    };
    geometry: {
        type: 'LineString';
        coordinates: [number, number][];
    };
}

export interface AllRoutesGeoJSON {
    type: 'FeatureCollection';
    features: RouteFeature[];
}

export interface RouteDetail {
    container_id: string;
    risk_level: RiskLevel;
    anomaly_flag: boolean;
    coordinates: [number, number][];
}

// ─── Tracking ──────────────────────────────────────────────
export interface TrackingEvent {
    timestamp: string;
    type: string;
    description: string;
}

export interface TrackingStop {
    name: string;
    coordinates: [number, number];
    arrived_at: string;
}

export interface TrackingData {
    current_position: [number, number];
    stops: TrackingStop[];
    events: TrackingEvent[];
    geojson: {
        type: 'Feature';
        geometry: {
            type: 'LineString';
            coordinates: [number, number][];
        };
    };
}

// ─── Live Prediction Polling Payloads ─────────────────────
export interface PredictionRow {
    job_id: string;
    batch_id: string;
    container_id: string;
    risk_score: number;
    risk_level: RiskLevel;
    anomaly_flag: boolean;
    anomaly_score: number;
    explanation: string;
    origin_country: string;
    destination_country: string;
    declared_value: number;
    declared_weight: number;
    processed_at: string;
}

export interface PredictionProgress {
    job_id: string;
    processed: number;
    total: number;
    percent: number;
}

export interface PredictionDone {
    job_id: string;
    batch_id: string;
    total: number;
    processed: number;
    failed: number;
}

export interface StreamUploadResponse {
    success: boolean;
    job_id: string;
    batch_id: string;
    message: string;
}

export interface JobLiveUpdatesResponse {
    success: boolean;
    job_id: string;
    status: JobStatus;
    progress: PredictionProgress;
    done: PredictionDone | null;
    error: string | null;
    rows: PredictionRow[];
    next_since: string | null;
}

// ─── Explainable AI ────────────────────────────────────────
export interface TopFactor {
    feature: string;
    impact: number;
}

export interface InspectionRecommendation {
    recommendedAction: string;
    reason: string;
    confidence: 'High' | 'Medium' | 'Low';
}

export interface SimulationResult {
    container_id: string;
    risk_score: number;
    risk_level: RiskLevel;
    anomaly_flag: boolean;
    anomaly_score: number;
    top_factors: TopFactor[];
    explanation: string;
    inspection_recommendation: InspectionRecommendation;
    engineered_features: Record<string, number>;
}

export interface SimulateRiskResponse {
    success: boolean;
    simulation: SimulationResult;
}

export interface AIAnalysisResult {
    container_id: string;
    risk_score: number;
    risk_level: RiskLevel;
    anomaly_flag: boolean;
    model_confidence: number;
    features: Array<{
        name: string;
        value: number;
        detail: string;
        icon: string;
        category: string;
    }>;
    inspection_recommendation: InspectionRecommendation;
    explanation?: string;
    explanation_bullets: string[];
    raw: Record<string, any>;
}

// ─── Analytics ─────────────────────────────────────────────
export interface RouteRisk {
    origin: string;
    destination: string;
    total_count: number;
    critical_count: number;
    low_risk_count: number;
    clear_count: number;
    anomaly_count: number;
    critical_rate: number;
    avg_risk_score: number;
    avg_dwell_time: number;
}

export interface SuspiciousImporter {
    importer_id: string;
    total_shipments: number;
    critical_count: number;
    anomaly_count: number;
    critical_rate: number;
    avg_risk_score: number;
    origin_countries: string[];
}

export interface FraudPatternEntry {
    hs_code?: string;
    shipping_line?: string;
    total: number;
    critical_count: number;
    critical_rate: number;
    avg_risk_score: number;
}

export interface FraudPatterns {
    high_risk_hs_codes: FraudPatternEntry[];
    high_risk_shipping_lines: FraudPatternEntry[];
}

export interface RiskTrendPoint {
    date: string;
    Critical: number;
    'Low Risk': number;
    Clear: number;
}

// ─── Feature 7: Auto-Escalation ────────────────────────────

/** Importer historical stats bundled into every single-prediction response */
export interface ImporterStats {
    total_shipments: number;
    critical_shipments: number;
    critical_percentage: number;
}

/**
 * Full result from POST /api/predict (single prediction).
 * Includes both raw model outputs and final business-adjusted decision.
 */
export interface SinglePredictionResult {
    // Core identifiers
    container_id: string;

    // ── Raw ML outputs (never overwritten) ──────────────────
    model_risk_score: number;
    model_risk_level: RiskLevel;

    // ── Final business-adjusted decision ────────────────────
    final_risk_score: number;
    final_risk_level: RiskLevel;

    // ── Backward-compat aliases (= final values) ────────────
    risk_score: number;
    risk_level: RiskLevel;

    // ── Escalation audit ────────────────────────────────────
    auto_escalated_by_importer_history: boolean;
    auto_escalated_by_new_trader_rule: boolean;
    importer_critical_percentage: number;
    exporter_historical_shipment_count: number;
    new_trader_threshold_used: number;
    override_reason: string | null;
    prediction_source: 'single' | 'batch';

    // ── Prediction metadata ─────────────────────────────────
    anomaly_flag: boolean;
    anomaly_score: number;
    explanation: string;
    explanation_summary: string;
    top_factors: TopFactor[];
    inspection_recommendation: InspectionRecommendation;
    importer_stats: ImporterStats;
    features: Record<string, number | boolean>;
}

/** GET /api/analytics/importer-risk-history row */
export interface ImporterRiskHistory {
    importer_id: string;
    total_shipments: number;
    critical_count: number;
    critical_percentage: number;
    auto_escalated_count: number;
    avg_risk_score: number;
    triggers_escalation: boolean;
    latest_shipment: string | null;
    origin_countries: string[];
}

/** GET /api/analytics/escalation-stats */
export interface EscalationStats {
    total_auto_escalated: number;
    total_escalated_importer?: number;
    total_escalated_new_trader?: number;
    total_containers: number;
    escalation_rate: number;
    by_importer: Array<{
        importer_id: string;
        escalated_count: number;
        critical_percentage: number;
    }>;
}
