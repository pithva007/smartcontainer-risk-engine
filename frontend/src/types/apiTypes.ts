// ─── Risk Levels ───────────────────────────────────────────
export type RiskLevel = 'Critical' | 'Low Risk' | 'Clear';

// ─── Auth ──────────────────────────────────────────────────
export interface AuthUser {
    username: string;
    role: string;
    email?: string;
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
}

// ─── Upload ────────────────────────────────────────────────
export interface UploadJobResponse {
    success: boolean;
    job_id: string;
    poll_url: string;
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
    explanation?: string;
    inspection_status: string;
    assigned_to?: string;
    notes: Array<{ text: string; added_by: string; timestamp: string }>;
    risk_explanation: string[];
    createdAt: string;
    updatedAt: string;
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
