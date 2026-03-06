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
    ContainerLocation,
    StreamUploadResponse,
} from '@/types/apiTypes';
import type { ConversationListItem, StartConversationResponse, ChatMessage, ConversationStatus } from '@/types/chatTypes';

// ─── Auth ──────────────────────────────────────────────────
export const login = (username: string, password: string) =>
    apiClient.post<LoginResponse>('/auth/login', { username, password }).then(r => r.data);

export const getMe = () =>
    apiClient.get<{ success: boolean; user: AuthUser }>('/auth/me').then(r => r.data.user);

export const logout = () =>
    apiClient.post('/auth/logout').catch(() => {/* ignore errors on logout */ });

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

interface ContainersResponse {
    success: boolean;
    data: QueueItem[];
    total: number;
    page: number;
    limit: number;
}

export const fetchContainersList = (params?: { risk_level?: string; anomaly?: boolean; page?: number; limit?: number }) =>
    apiClient.get<ContainersResponse>('/dashboard/containers', { params })
        .then(r => r.data);

// ─── Upload ────────────────────────────────────────────────
export const uploadDataset = (formData: FormData, onProgress?: (pct: number) => void) =>
    apiClient.post<UploadJobResponse>('/upload', formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
        onUploadProgress: (e) => {
            if (e.total && onProgress) onProgress(Math.round((e.loaded / e.total) * 100));
        },
    }).then(r => r.data);

/**
 * Stream upload — responds with 202 immediately then pushes prediction rows
 * via Socket.IO `prediction:row` events.  Returns { job_id, batch_id }.
 */
export const streamUploadDataset = (formData: FormData, onProgress?: (pct: number) => void) =>
    apiClient.post<StreamUploadResponse>('/upload/stream', formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
        onUploadProgress: (e) => {
            if (e.total && onProgress) onProgress(Math.round((e.loaded / e.total) * 100));
        },
    }).then(r => r.data);

// ─── Jobs ──────────────────────────────────────────────────
export const listJobs = () =>
    apiClient.get<{ success: boolean; jobs: JobRecord[]; total: number }>('/jobs')
        .then(r => r.data.jobs ?? []);

export const getJob = (jobId: string) =>
    apiClient.get<{ success: boolean; job: JobRecord }>(`/jobs/${jobId}`)
        .then(r => r.data.job);

export const getJobLogs = (jobId: string) =>
    apiClient.get<{ success: boolean; logs: string[] }>(`/jobs/${jobId}/logs`)
        .then(r => r.data.logs ?? []);

export const deleteJob = (jobId: string) =>
    apiClient.delete(`/jobs/${jobId}`).then(r => r.data);

export const clearAllData = () =>
    apiClient.delete('/containers/all').then(r => r.data);

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

export const fetchContainerLocation = (containerId: string) =>
    apiClient.get<{ success: boolean; data: ContainerLocation }>(`/container-location/${containerId.toUpperCase()}`)
        .then(r => r.data.data);

// ─── Tracking ──────────────────────────────────────────────
export const fetchTracking = (containerId: string) =>
    apiClient.get<{ success: boolean; data: TrackingData } | TrackingData>(`/map/track/${containerId}`)
        .then(r => ('data' in r.data && typeof (r.data as { data: unknown }).data === 'object') ? (r.data as { data: TrackingData }).data : r.data as TrackingData);

export const fetchAllTracks = () =>
    apiClient.get<AllRoutesGeoJSON>('/map/tracks').then(r => r.data);

export const fetchHeatmap = () =>
    apiClient.get<{ success: boolean; data: Array<{ lat: number; lng: number; intensity: number }> }>('/map/heatmap')
        .then(r => r.data.data ?? []);

export const fetchContainerAnalysis = (containerId: string) =>
    apiClient.get<{ success: boolean; data: any }>(`/container-analysis/${containerId.toUpperCase()}`)
        .then(r => r.data.data);

export const fetchContainerTimeline = (containerId: string) =>
    apiClient.get<{ success: boolean; data: any }>(`/container-timeline/${containerId.toUpperCase()}`)
        .then(r => r.data.data);

// ─── Workflow Queue ────────────────────────────────────────
export const fetchQueue = () =>
    apiClient.get<QueueItem[]>('/queue').then(r => r.data);

export const assignContainer = (id: string, inspector: string, notes?: string) =>
    apiClient.post(`/containers/${id}/assign`, { assigned_to: inspector, notes }).then(r => r.data);

export const updateContainerStatus = (id: string, status: string, notes?: string) =>
    apiClient.post(`/containers/${id}/status`, { inspection_status: status, notes }).then(r => r.data);

export const fetchContainerById = (id: string) =>
    apiClient.get<{ success: boolean; data: any }>(`/containers/${id}`).then(r => r.data.data);

export const fetchNotifications = (limit: number = 20) =>
    apiClient.get<{ success: boolean; data: any[] }>('/notifications', { params: { limit } }).then(r => r.data.data);

// ─── Chat ───────────────────────────────────────────────────
export const startChatConversation = (container_id: string, exporter_id: string) =>
    apiClient.post<StartConversationResponse>('/chat/start', { container_id, exporter_id }).then(r => r.data);

export const fetchChatConversations = (params?: { q?: string; status?: ConversationStatus; page?: number; limit?: number }) =>
    apiClient.get<{ success: boolean; data: ConversationListItem[]; total: number; page: number; limit: number }>('/chat/conversations', { params })
        .then(r => r.data);

export const fetchChatMessages = (conversation_id: string, params?: { limit?: number; before?: string }) =>
    apiClient.get<{ success: boolean; data: ChatMessage[]; next_before: string | null }>(`/chat/messages/${conversation_id}`, { params })
        .then(r => r.data);

export const sendChatMessage = (payload: { conversation_id: string; message_text?: string; attachment_url?: string; attachment_name?: string; attachment_mime?: string }) =>
    apiClient.post('/chat/message', payload).then(r => r.data);

export const updateChatStatus = (conversation_id: string, status: ConversationStatus) =>
    apiClient.patch(`/chat/status/${conversation_id}`, { status }).then(r => r.data);

export const uploadChatAttachment = (file: File, onProgress?: (pct: number) => void) => {
    const formData = new FormData();
    formData.append('file', file);
    return apiClient.post<{ success: boolean; file: { url: string; name: string; mime: string; size: number } }>(
        '/chat/upload',
        formData,
        {
            headers: { 'Content-Type': 'multipart/form-data' },
            onUploadProgress: (e) => {
                if (e.total && onProgress) onProgress(Math.round((e.loaded / e.total) * 100));
            },
        }
    ).then(r => r.data);
};

// ─── Exporters ──────────────────────────────────────────────
export const getExporterById = (exporter_id: string) =>
    apiClient.get<{ success: boolean; exporter_id: string; exporter_name: string; email?: string; company?: string }>(`/exporters/${encodeURIComponent(exporter_id)}`)
        .then(r => r.data);

// ─── Reports ───────────────────────────────────────────────
export const downloadCSV = () =>
    apiClient.get('/report/summary.csv', { responseType: 'blob' }).then(r => r.data as Blob);

export const downloadPDF = () =>
    apiClient.get('/report/summary.pdf', { responseType: 'blob' }).then(r => r.data as Blob);

