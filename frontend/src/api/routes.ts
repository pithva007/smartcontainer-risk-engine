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
    SinglePredictionResult,
    ImporterRiskHistory,
    EscalationStats,
    AllRoutesGeoJSON,
    RouteDetail,
    TrackingData,
    LoginResponse,
    AuthUser,
    ContainerLocation,
    StreamUploadResponse,
    ProfileResp,
    SessionsResp,
    ActivityResp,
    SimulateRiskResponse,
    RouteRisk,
    SuspiciousImporter,
    FraudPatterns,
    RiskTrendPoint,
    AIAnalysisResult,
    JobLiveUpdatesResponse,
} from '@/types/apiTypes';
import type { ConversationListItem, StartConversationResponse, ChatMessage, ConversationStatus } from '@/types/chatTypes';

// ─── Auth ──────────────────────────────────────────────────
export const login = (username: string, password: string) =>
    apiClient.post<LoginResponse>('/auth/login', { username, password }).then(r => r.data);

export const getMe = () =>
    apiClient.get<{ success: boolean; user: AuthUser }>('/auth/me').then(r => r.data.user);

export const updateProfile = (data: { full_name?: string; email?: string; phone_number?: string; department?: string; profile_photo?: string }) =>
    apiClient.patch<{ success: boolean; user: AuthUser }>('/auth/me/profile', data).then(r => r.data.user);

export const changePassword = (data: { current_password?: string; new_password?: string }) =>
    apiClient.put<{ success: boolean; message: string }>('/auth/me/password', data).then(r => r.data);

// ─── User Settings & Activity ─────────────────────────────
export const getExtendedProfile = () =>
    apiClient.get<ProfileResp>('/user/profile').then(r => r.data);

export const updateExtendedProfile = (data: Partial<ProfileResp['profile']>) =>
    apiClient.put<{ success: boolean; user: AuthUser }>('/user/update-profile', data).then(r => r.data);

export const getActiveSessions = () =>
    apiClient.get<SessionsResp>('/user/active-sessions').then(r => r.data);

export const logoutAllSessions = () =>
    apiClient.post<{ success: boolean; message: string }>('/user/logout-all').then(r => r.data);

export const getActivityLogs = () =>
    apiClient.get<ActivityResp>('/user/activity-logs').then(r => r.data);

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
 * Stream upload — responds with 202 immediately. Clients can then poll
 * /jobs/:job_id/live for near real-time updates.
 */
export const streamUploadDataset = (formData: FormData, onProgress?: (pct: number) => void) =>
    apiClient.post<StreamUploadResponse>('/upload/stream', formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
        onUploadProgress: (e) => {
            if (e.total && onProgress) onProgress(Math.round((e.loaded / e.total) * 100));
        },
    }).then(r => r.data);

// ─── Jobs ──────────────────────────────────────────────────
export const listJobs = (params?: { status?: string; type?: string; page?: number; limit?: number }) =>
    apiClient.get<{ success: boolean; jobs: JobRecord[]; total: number }>('/jobs', { params })
        .then(r => r.data.jobs ?? []);

export const getJobLiveUpdates = (jobId: string, params?: { since?: string; limit?: number }) =>
    apiClient.get<JobLiveUpdatesResponse>(`/jobs/${jobId}/live`, { params }).then(r => r.data);

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
/**
 * POST /api/predict — Single container risk prediction.
 * Returns the full enriched result including model vs final risk comparison
 * and importer auto-escalation audit fields.
 */
export const predictContainer = (input: PredictionInput) => {
    const payload = {
        container_id: input.Container_ID,
        declaration_date: input.Declaration_Date,
        declaration_time: input.Declaration_Time,
        trade_regime: input.Trade_Regime,
        origin_country: input.Origin_Country,
        destination_country: input.Destination_Country,
        destination_port: input.Destination_Port,
        hs_code: input.HS_Code,
        importer_id: input.Importer_ID,
        exporter_id: input.Exporter_ID,
        declared_value: input.Declared_Value,
        declared_weight: input.Declared_Weight,
        measured_weight: input.Measured_Weight,
        shipping_line: input.Shipping_Line,
        dwell_time_hours: input.Dwell_Time_Hours,
        clearance_status: input.Clearance_Status,
    };

    return apiClient.post<{ success: boolean; prediction: SinglePredictionResult }>('/predict', payload)
        .then(r => r.data.prediction);
};

export const fetchImporterRiskHistory = (limit = 20, minPct = 0) =>
    apiClient.get<{ success: boolean; data: ImporterRiskHistory[] }>(
        '/analytics/importer-risk-history',
        { params: { limit, min_pct: minPct } }
    ).then(r => r.data.data ?? []);

export const fetchEscalationStats = () =>
    apiClient.get<{ success: boolean; data: EscalationStats }>('/analytics/escalation-stats')
        .then(r => r.data.data);

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
    apiClient.get<{ success: boolean; data: AIAnalysisResult }>(`/container-analysis/${containerId.toUpperCase()}`)
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

// ─── Simulation ─────────────────────────────────────────────
export const simulateRisk = (input: Record<string, unknown>) =>
    apiClient.post<SimulateRiskResponse>('/simulate-risk', input).then(r => r.data);

// ─── Analytics ─────────────────────────────────────────────
export const fetchRouteRisk = (limit = 20) =>
    apiClient.get<{ success: boolean; data: RouteRisk[] }>('/analytics/route-risk', { params: { limit } })
        .then(r => r.data.data ?? []);

export const fetchSuspiciousImporters = (limit = 15) =>
    apiClient.get<{ success: boolean; data: SuspiciousImporter[] }>('/analytics/suspicious-importers', { params: { limit } })
        .then(r => r.data.data ?? []);

export const fetchFraudPatterns = () =>
    apiClient.get<{ success: boolean; data: FraudPatterns }>('/analytics/fraud-patterns')
        .then(r => r.data.data);

export const fetchRiskTrend = (days = 30) =>
    apiClient.get<{ success: boolean; data: RiskTrendPoint[] }>('/analytics/risk-trend', { params: { days } })
        .then(r => r.data.data ?? []);

export const sendChatMessage = (payload: { conversation_id: string; message_text?: string; attachment_url?: string; attachment_name?: string; attachment_mime?: string }) =>
    apiClient.post('/chat/message', payload).then(r => r.data);

export const updateChatStatus = (conversation_id: string, status: ConversationStatus) =>
    apiClient.post('/chat/status', { conversation_id, status }).then(r => r.data);

// ─── Reports / CSV Export ──────────────────────────────────
/**
 * Download the focused 4-column prediction CSV (risk_predictions.csv).
 * Triggers a browser file download — no return value needed.
 *
 * @param filters  Optional batch_id / risk_level query params
 */
export const exportPredictionsCSV = (filters?: { batch_id?: string; risk_level?: string }) => {
    const params = new URLSearchParams();
    if (filters?.batch_id) params.set('batch_id', filters.batch_id);
    if (filters?.risk_level) params.set('risk_level', filters.risk_level);
    const qs = params.toString();
    const date = new Date().toISOString().split('T')[0];
    const filename = filters?.batch_id
        ? `risk_predictions_${filters.batch_id}_${date}.csv`
        : `risk_predictions_${date}.csv`;

    // Use apiClient so the auth header is applied, then trigger download
    return apiClient
        .get<string>(`/report/predictions.csv${qs ? `?${qs}` : ''}`, {
            responseType: 'blob',
        })
        .then((res) => {
            const url = URL.createObjectURL(new Blob([res.data], { type: 'text/csv' }));
            const a = document.createElement('a');
            a.href = url;
            a.download = filename;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            URL.revokeObjectURL(url);
        });
};

/**
 * Client-side helper: convert an array of live PredictionRow objects into a
 * CSV blob and trigger an immediate browser download.  No server round-trip.
 */
export const exportLivePredictionsCSV = (rows: import('@/types/apiTypes').PredictionRow[], filename = 'risk_predictions.csv') => {
    const header = 'Container_ID,Risk_Score,Risk_Level,Explanation_Summary';
    const escapeCSV = (v: string) => `"${String(v).replace(/"/g, '""')}"`;
    const lines = rows.map((r) =>
        [
            escapeCSV(r.container_id),
            r.risk_score.toFixed(4),
            escapeCSV(r.risk_level || 'Clear'),
            escapeCSV(r.explanation || 'No explanation available.'),
        ].join(',')
    );
    const csv = '\uFEFF' + [header, ...lines].join('\r\n');
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv' }));
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
};

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

