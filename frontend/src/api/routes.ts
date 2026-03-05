import apiClient from './apiClient';
import type {
    SummaryData,
    RiskDistribution,
    AnomalyStat,
    TopRoute,
    RecentHighRisk,
    UploadResponse,
    BatchRecord,
    PredictionInput,
    ContainerPrediction,
    AllRoutesGeoJSON,
    RouteDetail,
    TrackingData,
} from '@/types/apiTypes';

// ─── Dashboard ─────────────────────────────────────────────
export const fetchSummary = () =>
    apiClient.get<SummaryData>('/summary').then(r => r.data);

export const fetchRiskDistribution = () =>
    apiClient.get<RiskDistribution[]>('/risk-distribution').then(r => r.data);

export const fetchAnomalyStats = () =>
    apiClient.get<AnomalyStat[]>('/anomaly-stats').then(r => r.data);

export const fetchTopRoutes = () =>
    apiClient.get<TopRoute[]>('/top-routes').then(r => r.data);

export const fetchRecentHighRisk = () =>
    apiClient.get<RecentHighRisk[]>('/recent-high-risk').then(r => r.data);

// ─── Upload ────────────────────────────────────────────────
export const uploadDataset = (formData: FormData, onProgress?: (pct: number) => void) =>
    apiClient.post<UploadResponse>('/upload', formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
        onUploadProgress: (e) => {
            if (e.total && onProgress) onProgress(Math.round((e.loaded / e.total) * 100));
        },
    }).then(r => r.data);

export const fetchBatches = () =>
    apiClient.get<BatchRecord[]>('/upload/batches').then(r => r.data);

// ─── Prediction ────────────────────────────────────────────
export const predictContainer = (input: PredictionInput) =>
    apiClient.post<ContainerPrediction>('/predict', input).then(r => r.data);

// ─── Map ───────────────────────────────────────────────────
export const fetchAllRoutes = () =>
    apiClient.get<AllRoutesGeoJSON>('/map/all-routes').then(r => r.data);

export const fetchRouteById = (id: string) =>
    apiClient.get<RouteDetail>(`/map/route/${id}`).then(r => r.data);

// ─── Tracking ──────────────────────────────────────────────
export const fetchTracking = (containerId: string) =>
    apiClient.get<TrackingData>(`/map/track/${containerId}`).then(r => r.data);
