import { useQuery } from '@tanstack/react-query';
import {
    BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
    LineChart, Line, Legend,
} from 'recharts';
import { TrendingUp, Users, Globe, FileSearch, ShieldAlert, History } from 'lucide-react';
import {
    fetchRouteRisk,
    fetchSuspiciousImporters,
    fetchFraudPatterns,
    fetchRiskTrend,
    fetchImporterRiskHistory,
    fetchEscalationStats,
} from '@/api/routes';
import type { RouteRisk, SuspiciousImporter, FraudPatterns, RiskTrendPoint, ImporterRiskHistory, EscalationStats } from '@/types/apiTypes';
import { cn } from '@/lib/utils';

const RISK_COLORS: Record<string, string> = {
    Critical: '#ef4444',
    'Low Risk': '#f59e0b',
    Clear: '#22c55e',
};

export default function Analytics() {
    const { data: routeRisk, isLoading: loadingRoutes } = useQuery<RouteRisk[]>({
        queryKey: ['analytics', 'route-risk'],
        queryFn: () => fetchRouteRisk(20),
    });

    const { data: importers, isLoading: loadingImporters } = useQuery<SuspiciousImporter[]>({
        queryKey: ['analytics', 'suspicious-importers'],
        queryFn: () => fetchSuspiciousImporters(15),
    });

    const { data: fraudPatterns, isLoading: loadingFraud } = useQuery<FraudPatterns | undefined>({
        queryKey: ['analytics', 'fraud-patterns'],
        queryFn: fetchFraudPatterns,
    });

    const { data: trend, isLoading: loadingTrend } = useQuery<RiskTrendPoint[]>({
        queryKey: ['analytics', 'risk-trend'],
        queryFn: () => fetchRiskTrend(30),
    });

    const { data: importerHistory, isLoading: loadingHistory } = useQuery<ImporterRiskHistory[]>({
        queryKey: ['analytics', 'importer-risk-history'],
        queryFn: () => fetchImporterRiskHistory(20),
        staleTime: 60_000,
    });

    const { data: escalationStats } = useQuery<EscalationStats | undefined>({
        queryKey: ['analytics', 'escalation-stats'],
        queryFn: fetchEscalationStats,
        staleTime: 60_000,
    });

    return (
        <div className="p-6 space-y-6">
            {/* Header */}
            <div>
                <h1 className="text-2xl font-bold text-foreground">Operational Insights</h1>
                <p className="text-sm text-muted-foreground mt-1">
                    Intelligence dashboards for route risk, suspicious entities, and fraud pattern detection.
                </p>
            </div>

            {/* ── Risk Trend Over Time ──────────────────────────────────────── */}
            <section className="bg-card border border-border rounded-xl p-5">
                <div className="flex items-center gap-2 mb-4">
                    <TrendingUp className="w-5 h-5 text-primary" />
                    <h2 className="text-base font-semibold">Risk Trend — Last 30 Days</h2>
                </div>
                {loadingTrend ? (
                    <div className="h-64 skeleton w-full rounded-lg" />
                ) : (
                    <ResponsiveContainer width="100%" height={260}>
                        <LineChart data={trend ?? []}>
                            <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                            <XAxis dataKey="date" tick={{ fontSize: 11 }} stroke="var(--muted-foreground)" />
                            <YAxis tick={{ fontSize: 11 }} stroke="var(--muted-foreground)" />
                            <Tooltip
                                contentStyle={{
                                    background: 'var(--card)',
                                    border: '1px solid var(--border)',
                                    borderRadius: 8,
                                    color: 'var(--foreground)',
                                }}
                            />
                            <Legend />
                            <Line type="monotone" dataKey="Critical" stroke={RISK_COLORS.Critical} strokeWidth={2} dot={false} />
                            <Line type="monotone" dataKey="Low Risk" stroke={RISK_COLORS['Low Risk']} strokeWidth={2} dot={false} />
                            <Line type="monotone" dataKey="Clear" stroke={RISK_COLORS.Clear} strokeWidth={2} dot={false} />
                        </LineChart>
                    </ResponsiveContainer>
                )}
            </section>

            {/* ── Route Risk Intelligence ───────────────────────────────────── */}
            <section className="bg-card border border-border rounded-xl p-5">
                <div className="flex items-center gap-2 mb-4">
                    <Globe className="w-5 h-5 text-primary" />
                    <h2 className="text-base font-semibold">Route Risk Intelligence</h2>
                    <span className="text-xs text-muted-foreground ml-auto">Top 20 routes by critical rate</span>
                </div>
                {loadingRoutes ? (
                    <div className="h-72 skeleton w-full rounded-lg" />
                ) : (
                    <div className="overflow-x-auto">
                        <table className="w-full text-sm">
                            <thead>
                                <tr className="border-b border-border text-left text-muted-foreground text-xs uppercase tracking-wide">
                                    <th className="pb-2 pr-4">Route</th>
                                    <th className="pb-2 pr-4 text-right">Total</th>
                                    <th className="pb-2 pr-4 text-right">Critical</th>
                                    <th className="pb-2 pr-4 text-right">Critical Rate</th>
                                    <th className="pb-2 pr-4 text-right">Avg Risk Score</th>
                                    <th className="pb-2 text-right">Avg Dwell (h)</th>
                                </tr>
                            </thead>
                            <tbody>
                                {(routeRisk ?? []).map((r, i) => (
                                    <tr key={i} className="border-b border-border/40 hover:bg-foreground/5 transition-colors">
                                        <td className="py-2 pr-4 font-medium">
                                            {r.origin} → {r.destination}
                                        </td>
                                        <td className="py-2 pr-4 text-right text-muted-foreground">{r.total_count.toLocaleString()}</td>
                                        <td className="py-2 pr-4 text-right">
                                            <span className="text-red-500 font-semibold">{r.critical_count}</span>
                                        </td>
                                        <td className="py-2 pr-4 text-right">
                                            <span
                                                className={`px-2 py-0.5 rounded-full text-xs font-medium ${
                                                    r.critical_rate > 20
                                                        ? 'bg-red-500/15 text-red-500'
                                                        : r.critical_rate > 5
                                                        ? 'bg-amber-500/15 text-amber-500'
                                                        : 'bg-green-500/15 text-green-600'
                                                }`}
                                            >
                                                {r.critical_rate}%
                                            </span>
                                        </td>
                                        <td className="py-2 pr-4 text-right text-muted-foreground">{r.avg_risk_score}</td>
                                        <td className="py-2 text-right text-muted-foreground">{r.avg_dwell_time}</td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                )}
            </section>

            {/* ── Two-column: Suspicious Importers + Fraud Patterns ─────────── */}
            <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
                {/* Suspicious Importers */}
                <section className="bg-card border border-border rounded-xl p-5">
                    <div className="flex items-center gap-2 mb-4">
                        <Users className="w-5 h-5 text-amber-500" />
                        <h2 className="text-base font-semibold">Suspicious Importers</h2>
                    </div>
                    {loadingImporters ? (
                        <div className="h-64 skeleton w-full rounded-lg" />
                    ) : (
                        <ResponsiveContainer width="100%" height={260}>
                            <BarChart
                                data={(importers ?? []).slice(0, 10)}
                                layout="vertical"
                                margin={{ left: 16, right: 24, top: 4, bottom: 4 }}
                            >
                                <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" horizontal={false} />
                                <XAxis type="number" tick={{ fontSize: 11 }} stroke="var(--muted-foreground)" />
                                <YAxis
                                    dataKey="importer_id"
                                    type="category"
                                    width={80}
                                    tick={{ fontSize: 10 }}
                                    stroke="var(--muted-foreground)"
                                />
                                <Tooltip
                                    contentStyle={{
                                        background: 'var(--card)',
                                        border: '1px solid var(--border)',
                                        borderRadius: 8,
                                        color: 'var(--foreground)',
                                    }}
                                />
                                <Bar dataKey="critical_count" name="Critical Shipments" fill="#ef4444" radius={[0, 4, 4, 0]} />
                            </BarChart>
                        </ResponsiveContainer>
                    )}
                    {/* Table below chart */}
                    {!loadingImporters && (
                        <div className="mt-4 overflow-x-auto">
                            <table className="w-full text-xs">
                                <thead>
                                    <tr className="border-b border-border text-muted-foreground uppercase tracking-wide">
                                        <th className="pb-1 pr-3 text-left">Importer</th>
                                        <th className="pb-1 pr-3 text-right">Shipments</th>
                                        <th className="pb-1 pr-3 text-right">Critical</th>
                                        <th className="pb-1 text-right">Critical %</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {(importers ?? []).slice(0, 8).map((imp, i) => (
                                        <tr key={i} className="border-b border-border/30 hover:bg-foreground/5">
                                            <td className="py-1 pr-3 font-mono font-medium">{imp.importer_id}</td>
                                            <td className="py-1 pr-3 text-right text-muted-foreground">{imp.total_shipments}</td>
                                            <td className="py-1 pr-3 text-right text-red-500 font-semibold">{imp.critical_count}</td>
                                            <td className="py-1 text-right">
                                                <span className={`px-1.5 py-0.5 rounded text-xs ${imp.critical_rate > 30 ? 'bg-red-500/15 text-red-500' : 'bg-amber-500/15 text-amber-500'}`}>
                                                    {imp.critical_rate}%
                                                </span>
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    )}
                </section>

                {/* Fraud Patterns */}
                <section className="bg-card border border-border rounded-xl p-5 space-y-5">
                    <div className="flex items-center gap-2">
                        <FileSearch className="w-5 h-5 text-red-500" />
                        <h2 className="text-base font-semibold">Fraud Pattern Detection</h2>
                    </div>

                    {loadingFraud ? (
                        <div className="space-y-3">
                            <div className="h-32 skeleton w-full rounded-lg" />
                            <div className="h-32 skeleton w-full rounded-lg" />
                        </div>
                    ) : (
                        <>
                            {/* High-risk HS Codes */}
                            <div>
                                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">
                                    High-Risk HS Codes
                                </p>
                                <div className="space-y-1.5">
                                    {(fraudPatterns?.high_risk_hs_codes ?? []).slice(0, 5).map((h, i) => (
                                        <div key={i} className="flex items-center gap-3">
                                            <span className="font-mono text-xs w-16 shrink-0">{h.hs_code}</span>
                                            <div className="flex-1 bg-border rounded-full h-2">
                                                <div
                                                    className="h-2 rounded-full bg-red-500"
                                                    style={{ width: `${Math.min(h.critical_rate, 100)}%` }}
                                                />
                                            </div>
                                            <span className="text-xs text-red-500 font-semibold w-10 text-right">{h.critical_rate}%</span>
                                            <span className="text-xs text-muted-foreground w-14 text-right">{h.critical_count}/{h.total}</span>
                                        </div>
                                    ))}
                                </div>
                            </div>

                            {/* High-risk Shipping Lines */}
                            <div>
                                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">
                                    High-Risk Shipping Lines
                                </p>
                                <div className="space-y-1.5">
                                    {(fraudPatterns?.high_risk_shipping_lines ?? []).slice(0, 5).map((s, i) => (
                                        <div key={i} className="flex items-center gap-3">
                                            <span className="text-xs w-28 shrink-0 truncate">{s.shipping_line}</span>
                                            <div className="flex-1 bg-border rounded-full h-2">
                                                <div
                                                    className="h-2 rounded-full bg-amber-500"
                                                    style={{ width: `${Math.min(s.critical_rate, 100)}%` }}
                                                />
                                            </div>
                                            <span className="text-xs text-amber-500 font-semibold w-10 text-right">{s.critical_rate}%</span>
                                            <span className="text-xs text-muted-foreground w-14 text-right">{s.critical_count}/{s.total}</span>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        </>
                    )}
                </section>
            </div>

            {/* ── Feature 7: Importer Critical History Auto-Escalation ──── */}
            <section>
                <div className="flex items-center gap-2 mb-4">
                    <ShieldAlert className="w-5 h-5 text-red-500" />
                    <h2 className="text-base font-semibold">Importer Critical History &amp; Auto-Escalation</h2>
                    {escalationStats && (
                        <span className="ml-auto text-xs text-muted-foreground">
                            <span className="font-semibold text-red-500">{escalationStats.total_auto_escalated}</span> containers auto-escalated
                            ({escalationStats.escalation_rate}% of all processed)
                        </span>
                    )}
                </div>

                {/* Escalation summary stats */}
                {escalationStats && (
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-4">
                        <div className="bg-card border border-border rounded-xl p-4">
                            <p className="text-xs text-muted-foreground mb-1">Total Auto-Escalated</p>
                            <p className="text-2xl font-bold text-red-500">{escalationStats.total_auto_escalated}</p>
                        </div>
                        <div className="bg-card border border-border rounded-xl p-4">
                            <p className="text-xs text-muted-foreground mb-1">Escalation Rate</p>
                            <p className="text-2xl font-bold">{escalationStats.escalation_rate}%</p>
                        </div>
                        <div className="bg-card border border-border rounded-xl p-4">
                            <p className="text-xs text-muted-foreground mb-1">Flagged Importers</p>
                            <p className="text-2xl font-bold">{escalationStats.by_importer.length}</p>
                        </div>
                    </div>
                )}

                {/* Importer risk history table */}
                <div className="bg-card border border-border rounded-xl overflow-hidden">
                    <div className="flex items-center gap-2 p-4 border-b border-border">
                        <History className="w-4 h-4 text-primary" />
                        <p className="text-sm font-semibold">Importers by Historical Critical Rate</p>
                        <span className="ml-auto text-xs text-muted-foreground">
                            Importers with &gt;20% critical rate trigger automatic escalation
                        </span>
                    </div>
                    {loadingHistory ? (
                        <div className="p-4 space-y-2">
                            {[...Array(5)].map((_, i) => (
                                <div key={i} className="h-8 bg-foreground/5 rounded animate-pulse" />
                            ))}
                        </div>
                    ) : (
                        <div className="overflow-x-auto">
                            <table className="w-full text-sm">
                                <thead>
                                    <tr className="border-b border-border bg-foreground/3">
                                        <th className="text-left p-3 text-xs font-semibold text-muted-foreground">Importer ID</th>
                                        <th className="text-right p-3 text-xs font-semibold text-muted-foreground">Total</th>
                                        <th className="text-right p-3 text-xs font-semibold text-muted-foreground">Critical</th>
                                        <th className="text-right p-3 text-xs font-semibold text-muted-foreground">Critical %</th>
                                        <th className="text-right p-3 text-xs font-semibold text-muted-foreground">Auto-Escalated</th>
                                        <th className="text-right p-3 text-xs font-semibold text-muted-foreground">Avg Score</th>
                                        <th className="text-center p-3 text-xs font-semibold text-muted-foreground">Rule Trigger</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {(importerHistory ?? []).map((imp) => (
                                        <tr key={imp.importer_id} className={cn(
                                            'border-b border-border/50 hover:bg-foreground/3 transition-colors',
                                            imp.triggers_escalation ? 'bg-red-500/5' : ''
                                        )}>
                                            <td className="p-3 font-mono text-xs">{imp.importer_id}</td>
                                            <td className="p-3 text-right">{imp.total_shipments}</td>
                                            <td className="p-3 text-right text-red-500 font-semibold">{imp.critical_count}</td>
                                            <td className="p-3 text-right">
                                                <span className={cn(
                                                    'font-bold',
                                                    imp.critical_percentage > 20 ? 'text-red-500' :
                                                    imp.critical_percentage > 10 ? 'text-amber-500' : 'text-foreground'
                                                )}>
                                                    {imp.critical_percentage.toFixed(1)}%
                                                </span>
                                                <div className="w-full h-1 bg-foreground/10 rounded-full mt-1 overflow-hidden">
                                                    <div
                                                        className="h-full rounded-full"
                                                        style={{
                                                            width: `${Math.min(imp.critical_percentage, 100)}%`,
                                                            backgroundColor: imp.triggers_escalation ? '#ef4444' : '#f59e0b',
                                                        }}
                                                    />
                                                </div>
                                            </td>
                                            <td className="p-3 text-right">
                                                {imp.auto_escalated_count > 0 ? (
                                                    <span className="text-red-500 font-semibold">{imp.auto_escalated_count}</span>
                                                ) : (
                                                    <span className="text-muted-foreground">—</span>
                                                )}
                                            </td>
                                            <td className="p-3 text-right">{imp.avg_risk_score.toFixed(3)}</td>
                                            <td className="p-3 text-center">
                                                {imp.triggers_escalation ? (
                                                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold bg-red-500/15 text-red-500">
                                                        <ShieldAlert className="w-3 h-3" /> Active
                                                    </span>
                                                ) : (
                                                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs bg-foreground/10 text-muted-foreground">
                                                        Below threshold
                                                    </span>
                                                )}
                                            </td>
                                        </tr>
                                    ))}
                                    {(!importerHistory || importerHistory.length === 0) && (
                                        <tr>
                                            <td colSpan={7} className="p-8 text-center text-muted-foreground text-sm">
                                                No importer history data yet.
                                            </td>
                                        </tr>
                                    )}
                                </tbody>
                            </table>
                        </div>
                    )}
                </div>
            </section>
        </div>
    );
}
