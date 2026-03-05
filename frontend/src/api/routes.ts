import apiClient from './apiClient';
import type {
    SummaryData,
    RiskDistribution,
    AnomalyStat,
    TopRoute,
    RecentHighRisk,
    UploadJobResponse,
    JobRecord,
    QueueItem,
    PredictionInput,
    ContainerPrediction,
    AllRoutesGeoJSON,
    RouteDetail,
    TrackingData,
    LoginResponse,
    AuthUser,
} from '@/types/apiTypes';

// ─── Auth ──────────────────────────────────────────────────
export const login = (username: string, password: string) =>
    apiClient.post<LoginResponse>('/auth/login', { username, password }).then(r => r.data);

export const getMe = () =>
    apiClient.get<AuthUser>('/auth/me').then(r => r.data);

export const logout = () =>
    apiClient.post('/auth/logout').catch(() => {/* ignore errors on logout */});

// ─── Dashboard ─────────────────────────────────────────────
export const fetchSummary = () =>
    apiClient.get<{ success: boolean; total_containers: number; critical_count: number; low_risk_count: number; clear_count: number; anomaly_count: number }>('/summary')
        .then(r => ({
            total_containers: r.data.total_containers,
            critical_containers: r.data.critical_count,
            low_risk_containers: r.data.low_risk_count,
            clear_containers: r.data.clear_count,
            total_anomalies: r.data.anomaly_count,
        } as SummaryData));

export const fetchRiskDistribution = () =>
    apiClient.get<{ success: boolean; data: RiskDistribution[] }>('/dashboard/risk-distribution')
        .then(r => r.data.data);

export const fetchAnomalyStats = () =>
    apiClient.get<{ success: boolean; data: { top_origin_countries: { country: string; anomaly_count: number }[] } }>('/dashboard/anomaly-stats')
        .then(r => (r.data.data?.top_origin_countries ?? []).map(x => ({ type: x.country, count: x.anomaly_count } as AnomalyStat)));

export const fetchTopRoutes = () =>
    apiClient.get<{ success: boolean; data: { origin: string; destination: string; critical_count: number }[] }>('/dashboard/top-risky-routes')
        .then(r => (r.data.data ?? []).map(x => ({ origin_country: x.origin, destination_country: x.destination, count: x.critical_count } as TopRoute)));

export const fetchRecentHighRisk = () =>
    apiClient.get<{ success: boolean; data: RecentHighRisk[] }>('/dashboard/recent-high-risk')
        .then(r => r.data.data ?? []);

// ─── Upload ────────────────────────────────────────────────
export const uploadDataset = (formData: FormData, onProgress?: (pct: number) => void) =>
    apiClient.post<UploadJobResponse>('/upload', formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
        onUploadProgress: (e) => {
            if (e.total && onProgress) onProgress(Math.round((e.loaded / e.total) * 100));
        },
    }).then(r => r.data);

// ─── Jobs ──────────────────────────────────────────────────
export const listJobs = () =>
    apiClient.get<JobRecord[]>('/jobs').then(r => r.data);

export const getJob = (jobId: string) =>
    apiClient.get<JobRecord>(`/jobs/${jobId}`).then(r => r.data);

export const getJobLogs = (jobId: string) =>
    apiClient.get<string[]>(`/jobs/${jobId}/logs`).then(r => r.data);

// ─── Prediction ────────────────────────────────────────────
export const predictContainer = (input: PredictionInput) =>
    apiClient.post<ContainerPrediction>('/predict', input).then(r => r.data);

// ─── Map ───────────────────────────────────────────────────
export const fetchAllRoutes = () =>
    apiClient.get<{ success: boolean; geojson: AllRoutesGeoJSON }>('/map/all-routes')
        .then(r => r.data.geojson);

export const fetchRouteById = (id: string) =>
    apiClient.get<{ success: boolean; data: RouteDetail }>(`/container-route/${id}`)
        .then(r => r.data.data ?? r.data as unknown as RouteDetail);

// ─── Tracking ──────────────────────────────────────────────
export const fetchTracking = (containerId: string) =>
    apiClient.get<{ success: boolean; data: TrackingData } | TrackingData>(`/map/track/${containerId}`)
        .then(r => ('data' in r.data && typeof (r.data as { data: unknown }).data === 'object') ? (r.data as { data: TrackingData }).data : r.data as TrackingData);

export const fetchAllTracks = () =>
    apiClient.get<AllRoutesGeoJSON>('/map/tracks').then(r => r.data);

export const fetchHeatmap = () =>
    apiClient.get('/map/heatmap').then(r => r.data);

// ─── Workflow Queue ────────────────────────────────────────
export const fetchQueue = () =>
    apiClient.get<QueueItem[]>('/queue').then(r => r.data);

export const assignContainer = (id: string, inspector: string) =>
    apiClient.post(`/containers/${id}/assign`, { inspector }).then(r => r.data);

export const updateContainerStatus = (id: string, status: string, notes?: string) =>
    apiClient.post(`/containers/${id}/status`, { status, notes }).then(r => r.data);

// ─── Reports ───────────────────────────────────────────────
export const downloadCSV = () =>
    apiClient.get('/report/summary.csv', { responseType: 'blob' }).then(r => r.data as Blob);

export const downloadPDF = () =>
    apiClient.get('/report/summary.pdf', { responseType: 'blob' }).then(r => r.data as Blob);

