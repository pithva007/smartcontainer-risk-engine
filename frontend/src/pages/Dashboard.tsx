import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
    fetchSummary,
    fetchRiskDistribution,
    fetchRecentHighRisk,
    fetchContainerById,
    exportPredictionsCSV,
} from '@/api/routes';
import { useLivePredictions } from '@/hooks/useLivePredictions';
import { useSocket } from '@/context/SocketContext';
import ShipmentListModal from '@/components/dashboard/ShipmentListModal';
import ShipmentDetailModal from '@/components/dashboard/ShipmentDetailModal';
import { PieChart, Pie, Cell, ResponsiveContainer } from 'recharts';
import { cn } from '@/lib/utils';
import type { RiskLevel, RecentHighRisk, RiskDistribution, PredictionRow } from '@/types/apiTypes';
import { CardSkeleton } from '@/components/ui/Skeleton';

/* ── Risk Badge ── */
function RiskBadge({ level }: { level: RiskLevel }) {
    const map: Record<RiskLevel, string> = {
        Critical: 'bg-red-500/20 text-red-400 border-red-500/30',
        'Low Risk': 'bg-amber-500/20 text-amber-400 border-amber-500/30',
        Clear: 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30',
    };
    return (
        <span className={cn('px-2.5 py-0.5 rounded-full text-[11px] font-semibold border', map[level])}>
            {level}
        </span>
    );
}

/* ── Score Bar ── */
function ScoreBar({ score }: { score: number }) {
    const pct = Math.round(score * 100);
    return (
        <div className="flex items-center gap-2">
            <div className="w-20 h-2 bg-white/10 rounded-full overflow-hidden">
                <div
                    className="h-full rounded-full transition-all"
                    style={{ width: `${pct}%`, background: pct >= 70 ? '#ef4444' : pct >= 40 ? '#f59e0b' : '#10b981' }}
                />
            </div>
            <span className="text-xs font-mono font-semibold text-foreground/80 min-w-6.5">{pct}</span>
        </div>
    );
}

/* ── Stream Banner ── */
function StreamBanner({ processed, total, percent, jobId }: { processed: number; total: number; percent: number; jobId: string }) {
    return (
        <div className="rounded-xl border border-primary/30 bg-primary/5 px-5 py-3 flex items-center gap-4">
            <span className="relative flex h-2.5 w-2.5 shrink-0">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-primary opacity-75" />
                <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-primary" />
            </span>
            <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between mb-1.5">
                    <p className="text-xs font-semibold text-foreground">
                        Live stream active — {processed.toLocaleString()} / {total.toLocaleString()} rows predicted
                    </p>
                    <span className="text-xs text-foreground/50 font-mono shrink-0 ml-3">{percent}%</span>
                </div>
                <div className="w-full h-1.5 bg-foreground/10 rounded-full overflow-hidden">
                    <div className="h-full bg-primary rounded-full transition-all duration-300" style={{ width: `${percent}%` }} />
                </div>
                <p className="text-[10px] text-foreground/40 mt-1 font-mono truncate">Job: {jobId}</p>
            </div>
        </div>
    );
}

/* ── Live Alert Feed ── */
function LiveAlertFeed({
    socketRows,
    apiRows,
    readAlerts,
    onItemClick,
}: {
    socketRows: PredictionRow[];
    apiRows: RecentHighRisk[];
    readAlerts: Set<string>;
    onItemClick: (id: string) => void;
}) {
    const borderColor: Record<RiskLevel, string> = {
        Critical: 'border-l-red-500',
        'Low Risk': 'border-l-amber-500',
        Clear: 'border-l-emerald-500',
    };

    const socketHighRisk = socketRows.filter((r) => r.risk_level === 'Critical' || r.risk_level === 'Low Risk');
    const seenIds = new Set(socketHighRisk.map((r) => r.container_id));
    const apiItems = apiRows.filter((r) => !seenIds.has(r.container_id));

    const merged: Array<{ container_id: string; risk_level: RiskLevel; explanation?: string; processed_at: string; isLive: boolean }> = [
        ...socketHighRisk.map((r) => ({ container_id: r.container_id, risk_level: r.risk_level, explanation: r.explanation, processed_at: r.processed_at, isLive: true })),
        ...apiItems.map((r) => ({ container_id: r.container_id, risk_level: r.risk_level, explanation: r.explanation, processed_at: r.processed_at, isLive: false })),
    ].slice(0, 50);

    return (
        <div className="bg-card border border-border rounded-xl shadow-sm flex flex-col h-full max-h-120">
            <div className="p-4 border-b border-border flex items-center justify-between">
                <div className="flex items-center gap-2">
                    <svg className="w-4 h-4 text-red-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" />
                    </svg>
                    <h3 className="text-sm font-semibold text-foreground">Live Alert Feed</h3>
                </div>
                {socketHighRisk.length > 0 && (
                    <span className="text-[10px] font-semibold text-primary bg-primary/10 px-2 py-0.5 rounded-full border border-primary/20">
                        {socketHighRisk.length} live
                    </span>
                )}
            </div>
            <div className="flex-1 overflow-y-auto p-3 space-y-2">
                {merged.length === 0 ? (
                    <div className="flex flex-col items-center justify-center h-full py-10 text-center">
                        <svg className="w-8 h-8 text-foreground/20 mb-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                        </svg>
                        <p className="text-xs text-foreground/40">No alerts yet. Upload a dataset to begin.</p>
                    </div>
                ) : (
                    merged.map((item, i) => {
                        const isSeen = readAlerts.has(item.container_id);
                        const diffMs = Date.now() - new Date(item.processed_at || Date.now()).getTime();
                        const diffMins = Math.floor(diffMs / 60000);
                        const timeStr = diffMins < 1 ? 'just now' : diffMins < 60 ? `${diffMins} min ago` : `${Math.floor(diffMins / 60)} hr ago`;
                        return (
                            <div
                                key={item.container_id + i}
                                data-container-id={item.container_id}
                                onClick={() => onItemClick(item.container_id)}
                                className={cn(
                                    'border-l-4 rounded-lg p-3 transition-colors cursor-pointer',
                                    isSeen ? 'opacity-50 grayscale bg-foreground/[0.02]' : cn('bg-foreground/5 hover:bg-foreground/8', borderColor[item.risk_level]),
                                    item.isLive && !isSeen && 'ring-1 ring-primary/20'
                                )}
                            >
                                <div className="flex items-center justify-between mb-1">
                                    <span className="text-xs font-mono font-semibold text-foreground">{item.container_id}</span>
                                    <div className="flex items-center gap-1.5">
                                        {item.isLive && !isSeen && <span className="text-[9px] uppercase tracking-widest font-bold text-primary">New</span>}
                                        {isSeen ? <span className="text-[10px] text-primary tracking-wider uppercase">Seen</span> : <span className="text-[10px] text-foreground/40">{timeStr}</span>}
                                    </div>
                                </div>
                                <div className="flex items-center justify-between gap-2">
                                    <p className="text-xs text-foreground/60 leading-relaxed flex-1 line-clamp-2">{item.explanation || 'Risk indicators detected.'}</p>
                                    <RiskBadge level={item.risk_level} />
                                </div>
                            </div>
                        );
                    })
                )}
            </div>
        </div>
    );
}

/* ── High-Risk Table ── */
function HighRiskTable({
    socketRows,
    apiRows,
    onSelectRow,
}: {
    socketRows: PredictionRow[];
    apiRows: RecentHighRisk[];
    onSelectRow: (id: string) => void;
}) {
    const socketCritical = socketRows.filter((r) => r.risk_level === 'Critical');
    const seenIds = new Set(socketCritical.map((r) => r.container_id));
    const apiCritical = apiRows.filter((r) => !seenIds.has(r.container_id));
    const rows = [
        ...socketCritical.map((r) => ({ ...r, origin_country: undefined, destination_country: undefined, isLive: true })),
        ...apiCritical.map((r) => ({ ...r, isLive: false })),
    ].slice(0, 100);

    return (
        <div className="bg-card border border-border rounded-xl shadow-sm overflow-hidden">
            <div className="p-4 border-b border-border flex items-center justify-between">
                <div className="flex items-center gap-2">
                    <svg className="w-4 h-4 text-foreground/60" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
                    </svg>
                    <h3 className="text-sm font-semibold text-foreground">High-Risk Containers</h3>
                </div>
                {socketCritical.length > 0 && (
                    <span className="text-[10px] font-semibold text-red-400 bg-red-500/10 px-2 py-0.5 rounded-full border border-red-500/20">
                        {socketCritical.length} new
                    </span>
                )}
            </div>
            {rows.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-14 text-center">
                    <svg className="w-8 h-8 text-foreground/20 mb-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                    <p className="text-xs text-foreground/40">No high-risk containers detected.</p>
                </div>
            ) : (
                <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                        <thead className="text-xs uppercase text-foreground/40 bg-foreground/[0.03] border-b border-border">
                            <tr>
                                <th className="px-4 py-3 text-left font-medium">Container ID</th>
                                <th className="px-4 py-3 text-left font-medium">Origin</th>
                                <th className="px-4 py-3 text-left font-medium">Destination</th>
                                <th className="px-4 py-3 text-left font-medium">Risk Score</th>
                                <th className="px-4 py-3 text-left font-medium">Level</th>
                                <th className="px-4 py-3 text-left font-medium">Reason</th>
                            </tr>
                        </thead>
                        <tbody>
                            {rows.map((item, i) => (
                                <tr
                                    key={item.container_id + i}
                                    data-container-id={item.container_id}
                                    onClick={() => onSelectRow(item.container_id)}
                                    className="border-t border-border cursor-pointer hover:bg-foreground/[0.03] transition-colors"
                                >
                                    <td className="px-4 py-3 font-mono font-medium text-foreground/90 whitespace-nowrap">
                                        <div className="flex items-center gap-2">
                                            {item.isLive && <span className="w-1.5 h-1.5 rounded-full bg-primary shrink-0" />}
                                            {item.container_id}
                                        </div>
                                    </td>
                                    <td className="px-4 py-3 text-foreground/60 whitespace-nowrap">{item.origin_country || '—'}</td>
                                    <td className="px-4 py-3 text-foreground/60 whitespace-nowrap">{item.destination_country || '—'}</td>
                                    <td className="px-4 py-3"><ScoreBar score={item.risk_score} /></td>
                                    <td className="px-4 py-3"><RiskBadge level={item.risk_level} /></td>
                                    <td className="px-4 py-3 text-foreground/50 max-w-50 truncate text-xs">
                                        {item.explanation || 'Multiple risk factors detected.'}
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            )}
        </div>
    );
}

/* ── Risk Donut ── */
const DIST_COLORS: Record<string, string> = {
    Critical: '#ef4444',
    'Low Risk': '#f59e0b',
    Clear: '#10b981',
    'No Data': '#374151',
};

function RiskDonut({ data, liveExtra }: { data: RiskDistribution[]; liveExtra: { critical: number; lowRisk: number; clear: number } }) {
    const enriched = data.map((d) => ({ ...d }));
    const add = (level: string, delta: number) => {
        const e = enriched.find((d) => d.risk_level === level);
        if (e) e.count += delta;
        else enriched.push({ risk_level: level as RiskLevel, count: delta });
    };
    if (liveExtra.critical > 0) add('Critical', liveExtra.critical);
    if (liveExtra.lowRisk > 0) add('Low Risk', liveExtra.lowRisk);
    if (liveExtra.clear > 0) add('Clear', liveExtra.clear);
    const final = enriched.length > 0 ? enriched : [{ risk_level: 'No Data' as RiskLevel, count: 1 }];

    return (
        <div className="bg-card border border-border rounded-xl shadow-sm p-5 flex flex-col h-full">
            <div className="mb-2">
                <h3 className="text-sm font-semibold text-foreground">Risk Distribution</h3>
                <p className="text-[11px] text-foreground/40 mt-0.5">Breakdown by classified risk level</p>
            </div>
            <div className="flex-1 flex flex-col items-center justify-center">
                <div className="h-44 w-44 max-w-55">
                    <ResponsiveContainer width={176} height={176}>
                        <PieChart>
                            <Pie data={final} cx="50%" cy="50%" innerRadius={44} outerRadius={74} paddingAngle={3} dataKey="count" nameKey="risk_level" stroke="none">
                                {final.map((entry) => <Cell key={entry.risk_level} fill={DIST_COLORS[entry.risk_level] || '#6366f1'} />)}
                            </Pie>
                        </PieChart>
                    </ResponsiveContainer>
                </div>
                <div className="flex flex-wrap justify-center gap-x-4 gap-y-1.5 mt-3 text-[11px]">
                    {final.map((entry) => (
                        <div key={entry.risk_level} className="flex items-center gap-1.5">
                            <div className="w-2 h-2 rounded-full" style={{ backgroundColor: DIST_COLORS[entry.risk_level] || '#6366f1' }} />
                            <span className="text-foreground/60">{entry.risk_level}: {entry.count.toLocaleString()}</span>
                        </div>
                    ))}
                </div>
            </div>
        </div>
    );
}

/* ═══════════════════════════════════════════════════
   DASHBOARD PAGE
   ═══════════════════════════════════════════════════ */
export default function Dashboard() {
    const navigate = useNavigate();
    const qc = useQueryClient();
    const { connected } = useSocket();

    const [listFilter, setListFilter] = useState<{ label: string; risk_level?: RiskLevel; anomaly?: boolean } | null>(null);
    const [selectedContainerId, setSelectedContainerId] = useState<string | null>(null);
    const [readAlerts, setReadAlertsState] = useState<Set<string>>(() => {
        try {
            const stored = localStorage.getItem('smartcontainer-read-alerts');
            return stored ? new Set(JSON.parse(stored)) : new Set();
        } catch {
            return new Set();
        }
    });

    const markRead = (id: string) => {
        setReadAlertsState((prev) => {
            const next = new Set(prev).add(id);
            localStorage.setItem('smartcontainer-read-alerts', JSON.stringify(Array.from(next)));
            return next;
        });
    };

    /* API queries */
    const summary = useQuery({ queryKey: ['summary'], queryFn: fetchSummary });
    const risk = useQuery({ queryKey: ['risk-distribution'], queryFn: fetchRiskDistribution });
    const highRisk = useQuery({ queryKey: ['recent-high-risk'], queryFn: fetchRecentHighRisk });
    const containerDetail = useQuery({
        queryKey: ['container', selectedContainerId],
        queryFn: () => fetchContainerById(selectedContainerId!),
        enabled: !!selectedContainerId,
    });

    /* Live socket stream — listens to ALL jobs */
    const { rows: liveRows, progress, done, error: streamError, liveCounts, isStreaming } = useLivePredictions();

    /* Refresh API data after stream finishes */
    useEffect(() => {
        if (done) {
            setTimeout(() => {
                qc.invalidateQueries({ queryKey: ['summary'] });
                qc.invalidateQueries({ queryKey: ['risk-distribution'] });
                qc.invalidateQueries({ queryKey: ['recent-high-risk'] });
            }, 1000);
        }
    }, [done, qc]);

    const kpi = summary.data;
    const isLoading = summary.isLoading || risk.isLoading || highRisk.isLoading;
    const hasError = summary.error && !kpi;

    const stats = [
        {
            label: 'Active Shipments',
            value: (kpi?.total_containers ?? 0) + (isStreaming ? liveRows.length : 0),
            delta: isStreaming ? liveRows.length : 0,
            color: 'text-blue-400',
            bg: 'bg-blue-500/10 border-blue-500/20',
            icon: (
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20 12V6a2 2 0 00-2-2H6a2 2 0 00-2 2v6m16 0l-8 5-8-5m16 0v6a2 2 0 01-2 2H6a2 2 0 01-2-2v-6" />
                </svg>
            ),
            onClick: () => navigate('/tracking?filter=All'),
        },
        {
            label: 'Critical Alerts',
            value: (kpi?.critical_containers ?? 0) + (isStreaming ? liveCounts.critical : 0),
            delta: isStreaming ? liveCounts.critical : 0,
            color: 'text-red-400',
            bg: 'bg-red-500/10 border-red-500/20',
            icon: (
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94A2 2 0 0020.18 18L11.71 3.86a2 2 0 00-3.42 0z" />
                </svg>
            ),
            onClick: () => navigate('/tracking?filter=Critical'),
        },
        {
            label: 'Pending Review',
            value: (kpi?.low_risk_containers ?? 0) + (isStreaming ? liveCounts.lowRisk : 0),
            delta: isStreaming ? liveCounts.lowRisk : 0,
            color: 'text-amber-400',
            bg: 'bg-amber-500/10 border-amber-500/20',
            icon: (
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
            ),
            onClick: () => navigate('/tracking?filter=Low Risk'),
        },
        {
            label: 'Cleared Today',
            value: (kpi?.clear_containers ?? 0) + (isStreaming ? liveCounts.clear : 0),
            delta: isStreaming ? liveCounts.clear : 0,
            color: 'text-emerald-400',
            bg: 'bg-emerald-500/10 border-emerald-500/20',
            icon: (
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
                </svg>
            ),
            onClick: () => navigate('/tracking?filter=Clear'),
        },
    ];

    return (
        <div className="space-y-5 pb-8">
            {/* Header */}
            <div className="flex items-start justify-between">
                <div>
                    <h1 className="text-2xl font-bold text-foreground">Risk Operations Dashboard</h1>
                    <p className="text-sm text-foreground/50 mt-1">Real-time prediction monitoring and high-risk container detection</p>
                </div>
                <div className="flex items-center gap-3 mt-1 shrink-0">
                    <button
                        onClick={() => exportPredictionsCSV()}
                        className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-primary/10 border border-primary/30 text-primary hover:bg-primary/20 text-xs font-semibold transition-colors"
                    >
                        <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                        </svg>
                        Export CSV
                    </button>
                    <div className="flex items-center gap-1.5 text-xs text-foreground/40">
                        <span className={cn('w-1.5 h-1.5 rounded-full', connected ? 'bg-emerald-400' : 'bg-red-400')} />
                        {connected ? 'Live' : 'Reconnecting...'}
                    </div>
                </div>
            </div>

            {/* Live stream progress */}
            {progress && isStreaming && (
                <StreamBanner processed={progress.processed} total={progress.total} percent={progress.percent} jobId={progress.job_id} />
            )}

            {/* Stream error */}
            {streamError && (
                <div className="flex items-center gap-3 p-3 bg-red-500/10 border border-red-500/20 rounded-lg text-red-400 text-xs">
                    <svg className="w-4 h-4 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2m7-2a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                    Stream error: {streamError}
                </div>
            )}

            {/* KPI Cards */}
            {isLoading ? (
                <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                    {Array.from({ length: 4 }).map((_, i) => <CardSkeleton key={i} />)}
                </div>
            ) : (
                <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                    {stats.map((s) => (
                        <div key={s.label} onClick={s.onClick} className="flex flex-col rounded-xl p-4 border bg-card shadow-sm cursor-pointer hover:border-primary/50 transition-colors">
                            <div className="flex items-center justify-between mb-2">
                                <div className="flex items-center gap-2.5">
                                    <div className={cn('p-2 rounded-lg border', s.bg, s.color)}>{s.icon}</div>
                                    <span className="text-xs text-foreground/60 font-medium truncate">{s.label}</span>
                                </div>
                                {s.delta > 0 && (
                                    <span className="text-[10px] font-bold text-primary bg-primary/10 px-1.5 py-0.5 rounded-md">+{s.delta}</span>
                                )}
                            </div>
                            <span className="text-xl sm:text-2xl font-bold text-foreground">{s.value.toLocaleString()}</span>
                        </div>
                    ))}
                </div>
            )}

            {/* API error */}
            {hasError && (
                <div className="flex items-center gap-3 p-4 bg-red-500/10 border border-red-500/20 rounded-lg text-red-400 text-sm">
                    <svg className="w-5 h-5 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2m7-2a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                    Failed to load dashboard data. Ensure the backend API is running.
                </div>
            )}

            {/* Main content */}
            {isLoading ? (
                <div className="flex flex-col gap-6">
                    <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
                        <div className="lg:col-span-5"><div className="animate-pulse bg-border rounded-xl h-80" /></div>
                        <div className="lg:col-span-7"><div className="animate-pulse bg-border rounded-xl h-80" /></div>
                    </div>
                    <div className="animate-pulse bg-border rounded-xl h-100" />
                </div>
            ) : (
                <div className="flex flex-col gap-6">
                    <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
                        <div className="lg:col-span-5 h-full">
                            <RiskDonut
                                data={risk.data || []}
                                liveExtra={isStreaming ? liveCounts : { critical: 0, lowRisk: 0, clear: 0 }}
                            />
                        </div>
                        <div className="lg:col-span-7 h-full">
                            <LiveAlertFeed
                                socketRows={liveRows}
                                apiRows={highRisk.data || []}
                                readAlerts={readAlerts}
                                onItemClick={(id) => {
                                    setSelectedContainerId(id);
                                    markRead(id);
                                }}
                            />
                        </div>
                    </div>
                    <HighRiskTable
                        socketRows={liveRows}
                        apiRows={highRisk.data || []}
                        onSelectRow={setSelectedContainerId}
                    />
                </div>
            )}

            {/* Modals */}
            {listFilter && (
                <ShipmentListModal
                    filter={listFilter}
                    onClose={() => setListFilter(null)}
                    onSelectShipment={(id) => { setListFilter(null); setSelectedContainerId(id); }}
                />
            )}
            {selectedContainerId && (
                <ShipmentDetailModal
                    shipment={containerDetail.data || null}
                    onClose={() => setSelectedContainerId(null)}
                />
            )}
        </div>
    );
}
