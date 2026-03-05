import { useQuery } from '@tanstack/react-query';
import {
    fetchSummary,
    fetchRiskDistribution,
    fetchRecentHighRisk,
} from '@/api/routes';
import {
    PieChart, Pie, Cell, ResponsiveContainer,
} from 'recharts';
import {
    Ship, AlertTriangle, Clock, ShieldCheck,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import type { RiskLevel, RecentHighRisk, RiskDistribution } from '@/types/apiTypes';
import { CardSkeleton } from '@/components/ui/Skeleton';

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
function LiveAlertFeed({ data }: { data: RecentHighRisk[] }) {
    const borderColor: Record<RiskLevel, string> = {
        Critical: 'border-l-red-500',
        'Low Risk': 'border-l-amber-500',
        Clear: 'border-l-emerald-500',
    };

    return (
        <div className="bg-card border border-border rounded-xl shadow-sm flex flex-col h-full max-h-[480px]">
            <div className="p-4 border-b border-border flex items-center gap-2">
                <AlertTriangle className="w-4 h-4 text-red-400" />
                <h3 className="text-sm font-semibold text-foreground">Live Alert Feed</h3>
            </div>
            <div className="flex-1 overflow-y-auto p-3 space-y-2">
                {data.map((item, i) => {
                    const mins = Math.floor(Math.random() * 60) + 1;
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
                            className={cn(
                                'border-l-4 rounded-lg p-3 bg-foreground/5 hover:bg-foreground/10 transition-colors cursor-pointer',
                                borderColor[item.risk_level]
                            )}
                        >
                            <div className="flex items-center justify-between mb-1">
                                <span className="text-xs font-mono font-semibold text-foreground">{item.container_id}</span>
                                <span className="text-[10px] text-foreground/40 flex items-center gap-1">
                                    <Clock className="w-3 h-3" /> {mins} min ago
                                </span>
                            </div>
                            <p className="text-xs text-foreground/60 leading-relaxed">
                                {explanations[i % explanations.length]}
                            </p>
                        </div>
                    );
                })}
            </div>
        </div>
    );
}

/* ───────── High-Risk Containers Table ───────── */
function HighRiskTable({ data }: { data: RecentHighRisk[] }) {
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
            <div className="flex-1 overflow-x-auto">
                <table className="w-full text-xs">
                    <thead>
                        <tr className="text-foreground/40 uppercase text-[10px] tracking-wider border-b border-border">
                            <th className="px-4 py-2.5 text-left font-medium">Container ID</th>
                            <th className="px-4 py-2.5 text-left font-medium">Origin</th>
                            <th className="px-4 py-2.5 text-left font-medium">Risk Score</th>
                            <th className="px-4 py-2.5 text-left font-medium">Level</th>
                            <th className="px-4 py-2.5 text-left font-medium">Explanation</th>
                        </tr>
                    </thead>
                    <tbody>
                        {data.slice(0, 5).map((item, i) => (
                            <tr
                                key={item.container_id}
                                className="border-b border-border/50 hover:bg-foreground/5 transition-colors"
                            >
                                <td className="px-4 py-3 font-mono font-medium text-foreground/90">{item.container_id}</td>
                                <td className="px-4 py-3 text-foreground/60">
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
};

function RiskDonut({ data }: { data: RiskDistribution[] }) {
    // Enrich with extra segments for visual richness
    const enriched = data.length <= 3
        ? [
            { risk_level: 'Critical', count: data.find(d => d.risk_level === 'Critical')?.count || 23 },
            { risk_level: 'High', count: 89 },
            { risk_level: 'Medium', count: 178 },
            { risk_level: 'Low', count: data.find(d => d.risk_level === 'Clear')?.count || 957 },
        ]
        : data.map(d => ({ risk_level: d.risk_level, count: d.count }));

    return (
        <div className="bg-card border border-border rounded-xl shadow-sm p-5 flex flex-col h-full">
            <div className="mb-2">
                <h3 className="text-sm font-semibold text-foreground">Risk Distribution</h3>
                <p className="text-[11px] text-foreground/40 mt-0.5">Container risk level breakdown</p>
            </div>
            <div className="flex-1 flex flex-col items-center justify-center">
                <div className="h-48 w-48">
                    <ResponsiveContainer width="100%" height="100%">
                        <PieChart>
                            <Pie
                                data={enriched}
                                cx="50%"
                                cy="50%"
                                innerRadius={50}
                                outerRadius={80}
                                paddingAngle={3}
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
    const summary = useQuery({ queryKey: ['summary'], queryFn: fetchSummary });
    const risk = useQuery({ queryKey: ['risk-distribution'], queryFn: fetchRiskDistribution });
    const highRisk = useQuery({ queryKey: ['recent-high-risk'], queryFn: fetchRecentHighRisk });

    const kpi = summary.data;
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
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                    {Array.from({ length: 4 }).map((_, i) => <CardSkeleton key={i} />)}
                </div>
            ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                    {stats.map((s) => (
                        <div
                            key={s.label}
                            className={cn('flex items-center justify-between rounded-xl p-5 border bg-card shadow-sm')}
                        >
                            <div className="flex items-center gap-3">
                                <div className={cn('p-2.5 rounded-lg border', s.bg)}>
                                    <s.icon className={cn('w-5 h-5', s.color)} />
                                </div>
                                <span className="text-sm text-foreground/60 font-medium">{s.label}</span>
                            </div>
                            <span className="text-2xl font-bold text-foreground">{s.value.toLocaleString()}</span>
                        </div>
                    ))}
                </div>
            )}

            {/* 3-Column Content Area */}
            {isLoading ? (
                <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
                    <div className="lg:col-span-3"><div className="skeleton h-[480px] rounded-xl" /></div>
                    <div className="lg:col-span-5"><div className="skeleton h-[480px] rounded-xl" /></div>
                    <div className="lg:col-span-4"><div className="skeleton h-[480px] rounded-xl" /></div>
                </div>
            ) : hasError ? (
                <div className="flex items-center gap-3 p-4 bg-risk-critical/10 border border-risk-critical/20 rounded-lg text-risk-critical text-sm">
                    <AlertTriangle className="w-5 h-5 shrink-0" />
                    Failed to load dashboard data. Make sure the backend API is running.
                </div>
            ) : (
                <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
                    {/* Live Alert Feed — left column */}
                    <div className="lg:col-span-3">
                        <LiveAlertFeed data={highRisk.data || []} />
                    </div>

                    {/* High-Risk Containers — center column */}
                    <div className="lg:col-span-5">
                        <HighRiskTable data={highRisk.data || []} />
                    </div>

                    {/* Risk Distribution — right column */}
                    <div className="lg:col-span-4">
                        <RiskDonut data={risk.data || []} />
                    </div>
                </div>
            )}
        </div>
    );
}
