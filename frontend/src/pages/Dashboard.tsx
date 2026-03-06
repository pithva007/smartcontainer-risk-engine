import { useQuery } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import {
    fetchSummary,
    fetchRiskDistribution,
    fetchRecentHighRisk,
    fetchContainerById,
} from '@/api/routes';
import { useState } from 'react';
import ShipmentListModal from '@/components/dashboard/ShipmentListModal';
import ShipmentDetailModal from '@/components/dashboard/ShipmentDetailModal';
import {
    PieChart, Pie, Cell, ResponsiveContainer,
} from 'recharts';
import {
    Ship, AlertTriangle, Clock, ShieldCheck,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import type { RiskLevel, RecentHighRisk, RiskDistribution } from '@/types/apiTypes';
import { CardSkeleton } from '@/components/ui/Skeleton';
import ContainerChatModal from '../components/chat/ContainerChatModal';
import { openChatForContainer } from '@/components/chat/chatEvents';

/* ───────── Risk badge ───────── */
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

/* ───────── Risk Score Bar ───────── */
function ScoreBar({ score }: { score: number }) {
    const pct = Math.round(score * 100);
    return (
        <div className="flex items-center gap-2">
            <div className="w-20 h-2 bg-white/10 rounded-full overflow-hidden">
                <div
                    className="h-full rounded-full"
                    style={{
                        width: `${pct}%`,
                        background: pct >= 80 ? '#ef4444' : pct >= 50 ? '#f59e0b' : '#10b981',
                    }}
                />
            </div>
            <span className="text-xs font-mono font-semibold text-foreground/80 min-w-[26px]">{pct}</span>
        </div>
    );
}

/* ───────── Live Alert Feed ───────── */
function LiveAlertFeed({ data, readAlerts }: { data: RecentHighRisk[], readAlerts: Set<string> }) {
    const [dismissed, setDismissed] = useState<Set<string>>(new Set());

    const borderColor: Record<RiskLevel, string> = {
        Critical: 'border-l-red-500',
        'Low Risk': 'border-l-amber-500',
        Clear: 'border-l-emerald-500',
    };
    const badgeColor: Record<RiskLevel, string> = {
        Critical: 'bg-red-500/15 text-red-400 border-red-500/20',
        'Low Risk': 'bg-amber-500/15 text-amber-400 border-amber-500/20',
        Clear: 'bg-emerald-500/15 text-emerald-400 border-emerald-500/20',
    };

    const visible = data.filter(item => !dismissed.has(item.container_id));
    const clearAll = () => setDismissed(new Set(data.map(d => d.container_id)));

    return (
        <div className="bg-card border border-border rounded-xl shadow-sm flex flex-col h-full max-h-[480px]">
            {/* Header */}
            <div className="px-4 py-3 border-b border-border flex items-center justify-between shrink-0">
                <div className="flex items-center gap-2">
                    <AlertTriangle className="w-4 h-4 text-red-400" />
                    <h3 className="text-sm font-semibold text-foreground">Live Alert Feed</h3>
                    {visible.length > 0 && (
                        <span className="px-1.5 py-0.5 rounded-full bg-red-500/15 text-red-400 text-[10px] font-bold border border-red-500/20">
                            {visible.length}
                        </span>
                    )}
                </div>
                {visible.length > 0 && (
                    <button
                        onClick={clearAll}
                        className="text-[10px] font-medium text-foreground/40 hover:text-foreground/70 border border-border hover:border-foreground/20 rounded-md px-2 py-1 transition-all"
                    >
                        Clear All
                    </button>
                )}
            </div>

            {/* Feed */}
            <div className="flex-1 overflow-y-auto p-3 space-y-2">
                {visible.length === 0 ? (
                    <div className="flex flex-col items-center justify-center h-full gap-2 py-8 text-foreground/30">
                        <ShieldCheck className="w-8 h-8" />
                        <p className="text-xs font-medium">No active alerts</p>
                    </div>
                ) : (
                    visible.map((item, i) => {
                        const isSeen = readAlerts.has(item.container_id);
                        const diffMs = Date.now() - new Date(item.processed_at || Date.now()).getTime();
                        const diffMins = Math.floor(diffMs / 60000);
                        const timeStr = diffMins < 60 ? `${Math.max(1, diffMins)} min ago` : `${Math.floor(diffMins / 60)} hr ago`;

                        const explanations = [
                            'Extreme value-to-weight anomaly detected',
                            'Shipper flagged in intelligence database',
                            'Documentation discrepancy: weight mismatch',
                            'High-risk origin-destination pairing',
                            'Minor customs declaration inconsistency',
                            'Radiation detection threshold exceeded',
                            'Unusual clearance timing pattern',
                            'Multiple prior violations on file',
                        ];

                        return (
                            <div
                                key={item.container_id + i}
                                data-container-id={item.container_id}
                                className={cn(
                                    'border-l-4 rounded-lg p-3 bg-foreground/5 hover:bg-foreground/[0.08] transition-all duration-150 group cursor-pointer',
                                    isSeen ? 'opacity-40' : borderColor[item.risk_level]
                                )}
                                onClick={() => openChatForContainer(item.container_id)}
                            >
                                {/* Row 1: ID + time + dismiss */}
                                <div className="flex items-center justify-between mb-1.5 gap-2">
                                    <div className="flex items-center gap-2 min-w-0">
                                        <span className="text-xs font-mono font-bold text-foreground shrink-0">{item.container_id}</span>
                                        <span className={cn('px-1.5 py-0.5 rounded-full text-[9px] font-semibold border', badgeColor[item.risk_level])}>
                                            {item.risk_level}
                                        </span>
                                        {isSeen && <span className="text-[9px] text-primary font-semibold tracking-widest uppercase">✓ Seen</span>}
                                    </div>
                                    <div className="flex items-center gap-1.5 shrink-0">
                                        <span className="text-[10px] text-foreground/35 flex items-center gap-1">
                                            <Clock className="w-3 h-3" />{timeStr}
                                        </span>
                                        <button
                                            onClick={(e) => {
                                                e.stopPropagation();
                                                setDismissed(prev => new Set([...prev, item.container_id]));
                                            }}
                                            className="opacity-0 group-hover:opacity-100 transition-opacity w-5 h-5 flex items-center justify-center rounded-full hover:bg-foreground/15 text-foreground/40 hover:text-foreground/70"
                                            title="Dismiss alert"
                                        >
                                            <svg className="w-3 h-3" fill="none" stroke="currentColor" strokeWidth={2.5} viewBox="0 0 24 24">
                                                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                                            </svg>
                                        </button>
                                    </div>
                                </div>
                                {/* Row 2: explanation */}
                                <p className="text-[11px] text-foreground/55 leading-relaxed line-clamp-2">
                                    {item.explanation || explanations[i % explanations.length]}
                                </p>
                            </div>
                        );
                    })
                )}
            </div>
        </div>
    );
}

/* ───────── High-Risk Containers Table ───────── */
function HighRiskTable({ data, onChat }: { data: RecentHighRisk[]; onChat: (containerId: string, riskLevel: RiskLevel) => void }) {
    const explanations = [
        'High value-to-weight ratio with significant documentation...',
        'Exceptionally high value-to-weight ratio, shipper has limit...',
        'Moderate weight discrepancy, elevated risk profile for rou...',
        'Transshipment hub origin with high declared value',
        'Suspicious routing pattern via multiple ports',
    ];

    return (
        <div className="bg-card border border-border rounded-xl shadow-sm flex flex-col h-full">
            <div className="p-4 border-b border-border">
                <h3 className="text-sm font-semibold text-foreground">High-Risk Containers</h3>
                <p className="text-[11px] text-foreground/40 mt-0.5">Requiring immediate inspection</p>
            </div>
            <div className="flex-1 overflow-x-auto overflow-y-auto max-h-[400px]">
                <table className="w-full text-xs">
                    <thead className="sticky top-0 bg-card z-10">
                        <tr className="text-foreground/40 uppercase text-[10px] tracking-wider border-b border-border">
                            <th className="px-4 py-2.5 text-left font-medium bg-card">Container ID</th>
                            <th className="px-4 py-2.5 text-left font-medium bg-card">Origin</th>
                            <th className="px-4 py-2.5 text-left font-medium bg-card">Risk Score</th>
                            <th className="px-4 py-2.5 text-left font-medium bg-card">Level</th>
                            <th className="px-4 py-2.5 text-left font-medium bg-card">Explanation</th>
                            <th className="px-4 py-2.5 text-left font-medium bg-card">Chat</th>
                        </tr>
                    </thead>
                    <tbody>
                        {data.map((item, i) => (
                            <tr
                                key={item.container_id}
                                data-container-id={item.container_id}
                                className="border-b border-border/50 hover:bg-foreground/5 transition-colors cursor-pointer"
                            >
                                <td className="px-4 py-3 font-mono font-medium text-foreground/90 whitespace-nowrap">{item.container_id}</td>
                                <td className="px-4 py-3 text-foreground/60 whitespace-nowrap">
                                    {['Shanghai, CN', 'Hong Kong, HK', 'Rotterdam, NL', 'Dubai, AE', 'Singapore, SG'][i % 5]}
                                </td>
                                <td className="px-4 py-3">
                                    <ScoreBar score={item.risk_score} />
                                </td>
                                <td className="px-4 py-3">
                                    <RiskBadge level={item.risk_level} />
                                </td>
                                <td className="px-4 py-3 text-foreground/50 max-w-[200px] truncate">
                                    {explanations[i % explanations.length]}
                                </td>
                                <td className="px-4 py-3">
                                    <button
                                        type="button"
                                        className="px-3 py-1 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-sm"
                                        onClick={(e) => {
                                            e.stopPropagation();
                                            onChat(item.container_id, item.risk_level);
                                        }}
                                    >
                                        Chat
                                    </button>
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
        </div>
    );
}

/* ───────── Risk Distribution Donut ───────── */
const DIST_COLORS: Record<string, string> = {
    Critical: '#ef4444',
    High: '#f59e0b',
    Medium: '#3b82f6',
    Low: '#10b981',
    'Low Risk': '#f59e0b',
    Clear: '#10b981',
    'No Data': '#374151',
};

function RiskDonut({ data }: { data: RiskDistribution[] }) {
    const enriched = data.length > 0
        ? data.map(d => ({ risk_level: d.risk_level, count: d.count }))
        : [{ risk_level: 'No Data', count: 1 }];

    return (
        <div className="bg-card border border-border rounded-xl shadow-sm p-5 flex flex-col h-full">
            <div className="mb-2">
                <h3 className="text-sm font-semibold text-foreground">Risk Distribution</h3>
                <p className="text-[11px] text-foreground/40 mt-0.5">Container risk level breakdown</p>
            </div>
            <div className="flex-1 flex flex-col items-center justify-center">
                {/* Full-width responsive pie — no fixed wrapper needed */}
                <div className="w-full" style={{ height: 192 }}>
                    <ResponsiveContainer width="100%" height="100%">
                        <PieChart>
                            <Pie
                                data={enriched}
                                cx="50%"
                                cy="50%"
                                innerRadius={54}
                                outerRadius={84}
                                paddingAngle={0}
                                dataKey="count"
                                nameKey="risk_level"
                                stroke="none"
                            >
                                {enriched.map((entry) => (
                                    <Cell
                                        key={entry.risk_level}
                                        fill={DIST_COLORS[entry.risk_level] || '#6366f1'}
                                    />
                                ))}
                            </Pie>
                        </PieChart>
                    </ResponsiveContainer>
                </div>

                {/* Legend */}
                <div className="flex flex-wrap justify-center gap-x-4 gap-y-1 mt-3 text-[11px]">
                    {enriched.map((entry) => (
                        <div key={entry.risk_level} className="flex items-center gap-1.5">
                            <div
                                className="w-2 h-2 rounded-full"
                                style={{ backgroundColor: DIST_COLORS[entry.risk_level] || '#6366f1' }}
                            />
                            <span className="text-foreground/60">{entry.risk_level}: {entry.count}</span>
                        </div>
                    ))}
                </div>

                {/* Stats Grid */}
                <div className="grid grid-cols-2 gap-x-6 gap-y-2 mt-5 text-xs w-full max-w-[220px]">
                    {enriched.map((entry) => (
                        <div key={entry.risk_level} className="flex items-center justify-between">
                            <div className="flex items-center gap-1.5">
                                <div
                                    className="w-2 h-2 rounded-full"
                                    style={{ backgroundColor: DIST_COLORS[entry.risk_level] || '#6366f1' }}
                                />
                                <span className="text-foreground/60">{entry.risk_level}</span>
                            </div>
                            <span className="font-semibold text-foreground/80">{entry.count}</span>
                        </div>
                    ))}
                </div>
            </div>
        </div>
    );
}

/* ═══════════════════════════════════════════════════════════
   DASHBOARD PAGE
   ═══════════════════════════════════════════════════════════ */
export default function Dashboard() {
    const navigate = useNavigate();
    const [listFilter, setListFilter] = useState<{ label: string; risk_level?: RiskLevel; anomaly?: boolean } | null>(null);
    const [selectedContainerId, setSelectedContainerId] = useState<string | null>(null);
    const [chatTarget, setChatTarget] = useState<{ containerId: string; exporterId: string; riskLevel: RiskLevel } | null>(null);
    const [readAlerts, setReadAlertsState] = useState<Set<string>>(() => {
        try {
            const stored = localStorage.getItem('smartcontainer-read-alerts');
            return stored ? new Set(JSON.parse(stored)) : new Set();
        } catch {
            return new Set();
        }
    });

    const setReadAlerts = (updater: (prev: Set<string>) => Set<string>) => {
        setReadAlertsState((prev) => {
            const next = updater(prev);
            localStorage.setItem('smartcontainer-read-alerts', JSON.stringify(Array.from(next)));
            return next;
        });
    };

    const summary = useQuery({ queryKey: ['summary'], queryFn: fetchSummary });
    const risk = useQuery({ queryKey: ['risk-distribution'], queryFn: fetchRiskDistribution });
    const highRisk = useQuery({ queryKey: ['recent-high-risk'], queryFn: fetchRecentHighRisk });

    // Fetch single container details when one is selected
    const containerDetail = useQuery({
        queryKey: ['container', selectedContainerId],
        queryFn: () => fetchContainerById(selectedContainerId!),
        enabled: !!selectedContainerId
    });

    const kpi = summary.data;
    // Use isLoading (no data at all) not isFetching — so cached data shows immediately
    const isLoading = summary.isLoading || risk.isLoading || highRisk.isLoading;
    const hasError = summary.error || risk.error || highRisk.error;

    const stats = [
        { label: 'Active Shipments', value: kpi?.total_containers ?? 0, icon: Ship, color: 'text-blue-400', bg: 'bg-blue-500/10 border-blue-500/20' },
        { label: 'Critical Alerts', value: kpi?.critical_containers ?? 0, icon: AlertTriangle, color: 'text-red-400', bg: 'bg-red-500/10 border-red-500/20' },
        { label: 'Pending Review', value: kpi?.low_risk_containers ?? 0, icon: Clock, color: 'text-amber-400', bg: 'bg-amber-500/10 border-amber-500/20' },
        { label: 'Cleared Today', value: kpi?.clear_containers ?? 0, icon: ShieldCheck, color: 'text-emerald-400', bg: 'bg-emerald-500/10 border-emerald-500/20' },
    ];

    return (
        <div className="space-y-6 pb-8">
            {/* Header */}
            <div>
                <h1 className="text-2xl font-bold text-foreground">Risk Operations Dashboard</h1>
                <p className="text-sm text-foreground/50 mt-1">Real-time monitoring and high-risk container detection</p>
            </div>

            {/* Summary Cards */}
            {isLoading ? (
                <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                    {Array.from({ length: 4 }).map((_, i) => <CardSkeleton key={i} />)}
                </div>
            ) : (
                <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                    {stats.map((s) => (
                        <div
                            key={s.label}
                            onClick={() => {
                                if (s.label === 'Active Shipments') navigate('/tracking?filter=All');
                                else if (s.label === 'Critical Alerts') navigate('/tracking?filter=Critical');
                                else if (s.label === 'Cleared Today') navigate('/tracking?filter=Clear');
                                else if (s.label === 'Pending Review') navigate('/tracking?filter=Low Risk');
                            }}
                            className={cn('flex flex-col rounded-xl p-4 border bg-card shadow-sm cursor-pointer hover:border-primary/50 transition-colors')}
                        >
                            <div className="flex items-center gap-2.5 mb-2">
                                <div className={cn('p-2 rounded-lg border', s.bg)}>
                                    <s.icon className={cn('w-4 h-4', s.color)} />
                                </div>
                                <span className="text-xs text-foreground/60 font-medium truncate">{s.label}</span>
                            </div>
                            <span className="text-xl sm:text-2xl font-bold text-foreground truncate">
                                {s.value.toLocaleString()}
                            </span>
                        </div>
                    ))}
                </div>
            )}

            {/* Main Content Area */}
            {isLoading ? (
                <div className="flex flex-col gap-6">
                    <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
                        <div className="lg:col-span-6"><div className="skeleton h-[320px] rounded-xl" /></div>
                        <div className="lg:col-span-6"><div className="skeleton h-[320px] rounded-xl" /></div>
                    </div>
                    <div className="w-full">
                        <div className="skeleton h-[400px] rounded-xl" />
                    </div>
                </div>
            ) : hasError ? (
                <div className="flex items-center gap-3 p-4 bg-risk-critical/10 border border-risk-critical/20 rounded-lg text-risk-critical text-sm">
                    <AlertTriangle className="w-5 h-5 shrink-0" />
                    Failed to load dashboard data. Make sure the backend API is running.
                </div>
            ) : (
                <div className="flex flex-col gap-6">
                    {/* Charts & Alerts Row */}
                    <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
                        {/* Risk Distribution — left side */}
                        <div className="lg:col-span-6 h-full">
                            <RiskDonut data={risk.data || []} />
                        </div>

                        {/* Live Alert Feed — right side */}
                        <div className="lg:col-span-6 h-full">
                            <div className="h-full" onClick={(e) => {
                                const target = e.target as HTMLElement;
                                const card = target.closest('[data-container-id]');
                                if (card) {
                                    const id = card.getAttribute('data-container-id');
                                    if (id) {
                                        setSelectedContainerId(id);
                                        setReadAlerts(prev => new Set(prev).add(id));
                                    }
                                }
                            }}>
                                <LiveAlertFeed data={highRisk.data || []} readAlerts={readAlerts} />
                            </div>
                        </div>
                    </div>

                    {/* High-Risk Containers — full width bottom */}
                    <div className="w-full h-full">
                        <div className="h-full" onClick={(e) => {
                            const target = e.target as HTMLElement;
                            const row = target.closest('tr[data-container-id]');
                            if (row) setSelectedContainerId(row.getAttribute('data-container-id'));
                        }}>
                            <HighRiskTable
                                data={highRisk.data || []}
                                onChat={async (containerId, riskLevel) => {
                                    try {
                                        const detail = await fetchContainerById(containerId);
                                        const exporterId = detail?.exporter_id;
                                        if (!exporterId) return;
                                        setChatTarget({ containerId, exporterId, riskLevel });
                                    } catch (err) {
                                        console.error('Failed to load container detail for chat', err);
                                    }
                                }}
                            />
                        </div>
                    </div>
                </div>
            )}

            {/* Modals */}
            {listFilter && (
                <ShipmentListModal
                    filter={listFilter}
                    onClose={() => setListFilter(null)}
                    onSelectShipment={(id) => {
                        setListFilter(null);
                        setSelectedContainerId(id);
                    }}
                />
            )}

            {selectedContainerId && (
                <ShipmentDetailModal
                    shipment={containerDetail.data || null}
                    onClose={() => setSelectedContainerId(null)}
                />
            )}

            {chatTarget && (
                <ContainerChatModal
                    open
                    containerId={chatTarget.containerId}
                    exporterId={chatTarget.exporterId}
                    riskLevel={chatTarget.riskLevel}
                    onClose={() => setChatTarget(null)}
                />
            )}
        </div>
    );
}
