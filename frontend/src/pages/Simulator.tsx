import { useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { Crosshair, Zap, AlertTriangle, CheckCircle, Info, ChevronRight } from 'lucide-react';
import { simulateRisk } from '@/api/routes';
import type { SimulationResult } from '@/types/apiTypes';

const RISK_BADGE: Record<string, string> = {
    Critical: 'bg-red-500/15 text-red-500 border border-red-500/30',
    'Low Risk': 'bg-amber-500/15 text-amber-600 border border-amber-500/30',
    Clear: 'bg-green-500/15 text-green-600 border border-green-500/30',
};

const CONFIDENCE_COLORS: Record<string, string> = {
    High: 'text-red-500',
    Medium: 'text-amber-500',
    Low: 'text-green-600',
};

const defaultForm = {
    container_id: '',
    origin_country: '',
    destination_country: '',
    hs_code: '',
    importer_id: '',
    exporter_id: '',
    declared_weight: '',
    measured_weight: '',
    declared_value: '',
    dwell_time_hours: '',
    shipping_line: '',
    trade_regime: 'Import',
};

type FormData = typeof defaultForm;

export default function Simulator() {
    const [form, setForm] = useState<FormData>(defaultForm);

    const mutation = useMutation({
        mutationFn: () =>
            simulateRisk({
                ...form,
                declared_weight: form.declared_weight ? parseFloat(form.declared_weight) : undefined,
                measured_weight: form.measured_weight ? parseFloat(form.measured_weight) : undefined,
                declared_value: form.declared_value ? parseFloat(form.declared_value) : undefined,
                dwell_time_hours: form.dwell_time_hours ? parseFloat(form.dwell_time_hours) : undefined,
            }),
    });

    const result: SimulationResult | undefined = mutation.data?.simulation;

    const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
        setForm((prev) => ({ ...prev, [e.target.name]: e.target.value }));
    };

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        mutation.mutate();
    };

    const scorePercent = result ? Math.round(result.risk_score * 100) : 0;
    const scoreColor =
        result?.risk_level === 'Critical'
            ? 'text-red-500'
            : result?.risk_level === 'Low Risk'
            ? 'text-amber-500'
            : 'text-green-600';

    return (
        <div className="p-6 max-w-6xl mx-auto space-y-6">
            {/* Header */}
            <div>
                <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
                    <Crosshair className="w-6 h-6 text-primary" />
                    Container Risk Simulator
                </h1>
                <p className="text-sm text-muted-foreground mt-1">
                    Evaluate hypothetical shipment scenarios against the live ML model without persisting to the database.
                </p>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                {/* ── Input Form ──────────────────────────────────────────── */}
                <form onSubmit={handleSubmit} className="bg-card border border-border rounded-xl p-5 space-y-4">
                    <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">Shipment Parameters</h2>

                    {/* Container ID */}
                    <div>
                        <label className="block text-xs font-medium text-muted-foreground mb-1">Container ID (optional)</label>
                        <input
                            type="text"
                            name="container_id"
                            value={form.container_id}
                            onChange={handleChange}
                            placeholder="SIM-001"
                            className="w-full bg-background border border-border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50"
                        />
                    </div>

                    {/* Origin / Destination */}
                    <div className="grid grid-cols-2 gap-3">
                        <div>
                            <label className="block text-xs font-medium text-muted-foreground mb-1">Origin Country</label>
                            <input
                                type="text"
                                name="origin_country"
                                value={form.origin_country}
                                onChange={handleChange}
                                placeholder="e.g. China"
                                className="w-full bg-background border border-border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50"
                            />
                        </div>
                        <div>
                            <label className="block text-xs font-medium text-muted-foreground mb-1">Destination Country</label>
                            <input
                                type="text"
                                name="destination_country"
                                value={form.destination_country}
                                onChange={handleChange}
                                placeholder="e.g. USA"
                                className="w-full bg-background border border-border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50"
                            />
                        </div>
                    </div>

                    {/* Weight fields */}
                    <div className="grid grid-cols-2 gap-3">
                        <div>
                            <label className="block text-xs font-medium text-muted-foreground mb-1">Declared Weight (kg)</label>
                            <input
                                type="number"
                                name="declared_weight"
                                value={form.declared_weight}
                                onChange={handleChange}
                                placeholder="e.g. 5000"
                                min="0"
                                className="w-full bg-background border border-border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50"
                            />
                        </div>
                        <div>
                            <label className="block text-xs font-medium text-muted-foreground mb-1">Measured Weight (kg)</label>
                            <input
                                type="number"
                                name="measured_weight"
                                value={form.measured_weight}
                                onChange={handleChange}
                                placeholder="e.g. 7500"
                                min="0"
                                className="w-full bg-background border border-border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50"
                            />
                        </div>
                    </div>

                    {/* Value and Dwell */}
                    <div className="grid grid-cols-2 gap-3">
                        <div>
                            <label className="block text-xs font-medium text-muted-foreground mb-1">Declared Value (USD)</label>
                            <input
                                type="number"
                                name="declared_value"
                                value={form.declared_value}
                                onChange={handleChange}
                                placeholder="e.g. 25000"
                                min="0"
                                className="w-full bg-background border border-border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50"
                            />
                        </div>
                        <div>
                            <label className="block text-xs font-medium text-muted-foreground mb-1">Dwell Time (hours)</label>
                            <input
                                type="number"
                                name="dwell_time_hours"
                                value={form.dwell_time_hours}
                                onChange={handleChange}
                                placeholder="e.g. 96"
                                min="0"
                                className="w-full bg-background border border-border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50"
                            />
                        </div>
                    </div>

                    {/* IDs */}
                    <div className="grid grid-cols-2 gap-3">
                        <div>
                            <label className="block text-xs font-medium text-muted-foreground mb-1">Importer ID</label>
                            <input
                                type="text"
                                name="importer_id"
                                value={form.importer_id}
                                onChange={handleChange}
                                placeholder="IMP-001"
                                className="w-full bg-background border border-border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50"
                            />
                        </div>
                        <div>
                            <label className="block text-xs font-medium text-muted-foreground mb-1">HS Code</label>
                            <input
                                type="text"
                                name="hs_code"
                                value={form.hs_code}
                                onChange={handleChange}
                                placeholder="e.g. 8471.30"
                                className="w-full bg-background border border-border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50"
                            />
                        </div>
                    </div>

                    {/* Trade Regime */}
                    <div>
                        <label className="block text-xs font-medium text-muted-foreground mb-1">Trade Regime</label>
                        <select
                            name="trade_regime"
                            value={form.trade_regime}
                            onChange={handleChange}
                            className="w-full bg-background border border-border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50"
                        >
                            <option>Import</option>
                            <option>Export</option>
                            <option>Transit</option>
                            <option>Re-Export</option>
                        </select>
                    </div>

                    <button
                        type="submit"
                        disabled={mutation.isPending}
                        className="w-full flex items-center justify-center gap-2 bg-primary text-primary-foreground py-2.5 rounded-lg text-sm font-semibold hover:bg-primary/90 transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
                    >
                        <Zap className="w-4 h-4" />
                        {mutation.isPending ? 'Simulating…' : 'Run Simulation'}
                    </button>

                    {mutation.isError && (
                        <p className="text-xs text-red-500 flex items-center gap-1">
                            <AlertTriangle className="w-3 h-3" />
                            Simulation failed. Check server connection.
                        </p>
                    )}
                </form>

                {/* ── Results Panel ───────────────────────────────────────── */}
                <div className="space-y-4">
                    {!result && !mutation.isPending && (
                        <div className="bg-card border border-border rounded-xl p-8 flex flex-col items-center justify-center text-center h-full">
                            <Crosshair className="w-12 h-12 text-muted-foreground/30 mb-3" />
                            <p className="text-sm text-muted-foreground">
                                Fill in shipment parameters and click <strong>Run Simulation</strong> to see the ML risk assessment.
                            </p>
                        </div>
                    )}

                    {mutation.isPending && (
                        <div className="bg-card border border-border rounded-xl p-8 flex flex-col items-center justify-center">
                            <div className="w-10 h-10 border-4 border-primary/30 border-t-primary rounded-full animate-spin mb-3" />
                            <p className="text-sm text-muted-foreground">Running ML inference…</p>
                        </div>
                    )}

                    {result && (
                        <>
                            {/* Risk Score */}
                            <div className="bg-card border border-border rounded-xl p-5">
                                <div className="flex items-center justify-between mb-3">
                                    <span className="text-sm font-semibold text-muted-foreground">Risk Assessment</span>
                                    <span className={`px-3 py-1 rounded-full text-xs font-bold ${RISK_BADGE[result.risk_level] ?? ''}`}>
                                        {result.risk_level}
                                    </span>
                                </div>
                                <div className="flex items-end gap-3 mb-3">
                                    <span className={`text-5xl font-bold tabular-nums ${scoreColor}`}>
                                        {scorePercent}
                                    </span>
                                    <span className="text-lg text-muted-foreground pb-1">/ 100</span>
                                </div>
                                <div className="w-full bg-border rounded-full h-3">
                                    <div
                                        className={`h-3 rounded-full transition-all duration-700 ${
                                            result.risk_level === 'Critical'
                                                ? 'bg-red-500'
                                                : result.risk_level === 'Low Risk'
                                                ? 'bg-amber-500'
                                                : 'bg-green-500'
                                        }`}
                                        style={{ width: `${scorePercent}%` }}
                                    />
                                </div>
                                <div className="flex justify-between mt-1 text-xs text-muted-foreground">
                                    <span>Clear</span>
                                    <span>Low Risk</span>
                                    <span>Critical</span>
                                </div>
                                <p className="mt-3 text-sm text-foreground/80">{result.explanation}</p>
                            </div>

                            {/* Top Risk Factors */}
                            {result.top_factors && result.top_factors.length > 0 && (
                                <div className="bg-card border border-border rounded-xl p-5">
                                    <h3 className="text-sm font-semibold text-muted-foreground mb-3">Top Contributing Factors</h3>
                                    <div className="space-y-2.5">
                                        {result.top_factors.map((f, i) => (
                                            <div key={i} className="flex items-center gap-3">
                                                <span className="text-xs text-muted-foreground w-4 shrink-0">{i + 1}.</span>
                                                <span className="text-xs font-mono flex-1 truncate">{f.feature}</span>
                                                <div className="w-24 bg-border rounded-full h-2">
                                                    <div
                                                        className="h-2 rounded-full bg-primary"
                                                        style={{ width: `${Math.min(f.impact * 500, 100)}%` }}
                                                    />
                                                </div>
                                                <span className="text-xs text-primary font-semibold w-12 text-right">
                                                    {(f.impact * 100).toFixed(1)}%
                                                </span>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            )}

                            {/* Inspection Recommendation */}
                            {result.inspection_recommendation && (
                                <div className={`border rounded-xl p-5 ${
                                    result.risk_level === 'Critical'
                                        ? 'bg-red-500/5 border-red-500/30'
                                        : result.risk_level === 'Low Risk'
                                        ? 'bg-amber-500/5 border-amber-500/30'
                                        : 'bg-green-500/5 border-green-500/30'
                                }`}>
                                    <div className="flex items-center gap-2 mb-2">
                                        {result.risk_level === 'Critical' ? (
                                            <AlertTriangle className="w-4 h-4 text-red-500" />
                                        ) : result.risk_level === 'Low Risk' ? (
                                            <Info className="w-4 h-4 text-amber-500" />
                                        ) : (
                                            <CheckCircle className="w-4 h-4 text-green-600" />
                                        )}
                                        <span className="text-sm font-semibold">Recommended Action</span>
                                        <span className={`ml-auto text-xs font-semibold ${CONFIDENCE_COLORS[result.inspection_recommendation.confidence]}`}>
                                            {result.inspection_recommendation.confidence} Confidence
                                        </span>
                                    </div>
                                    <p className="text-sm font-bold">{result.inspection_recommendation.recommendedAction}</p>
                                    <p className="text-xs text-muted-foreground mt-1">{result.inspection_recommendation.reason}</p>
                                </div>
                            )}

                            {/* Engineered Features */}
                            <details className="bg-card border border-border rounded-xl">
                                <summary className="px-5 py-3 text-sm font-semibold cursor-pointer select-none flex items-center gap-2">
                                    <ChevronRight className="w-4 h-4 transition-transform [[open]&]:rotate-90" />
                                    Engineered Features
                                </summary>
                                <div className="px-5 pb-4 grid grid-cols-2 gap-x-4 gap-y-1 text-xs">
                                    {result.engineered_features &&
                                        Object.entries(result.engineered_features).map(([k, v]) => (
                                            <div key={k} className="flex justify-between py-0.5 border-b border-border/30">
                                                <span className="text-muted-foreground font-mono">{k}</span>
                                                <span className="font-semibold">
                                                    {typeof v === 'number' ? v.toFixed(3) : String(v)}
                                                </span>
                                            </div>
                                        ))}
                                </div>
                            </details>
                        </>
                    )}
                </div>
            </div>
        </div>
    );
}
