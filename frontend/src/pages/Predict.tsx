import { useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { predictContainer } from '@/api/routes';
import type { PredictionInput, SinglePredictionResult } from '@/types/apiTypes';
import { cn, riskBgClass, riskColor } from '@/lib/utils';
import { Crosshair, Loader2, AlertTriangle, CheckCircle2, ShieldAlert, TrendingUp, History, Info } from 'lucide-react';
import toast from 'react-hot-toast';

const defaultForm: PredictionInput = {
    Container_ID: '',
    Declaration_Date: '',
    Declaration_Time: '',
    Trade_Regime: '',
    Origin_Country: '',
    Destination_Country: '',
    Destination_Port: '',
    HS_Code: '',
    Importer_ID: '',
    Exporter_ID: '',
    Declared_Value: 0,
    Declared_Weight: 0,
    Measured_Weight: 0,
    Shipping_Line: '',
    Dwell_Time_Hours: 0,
    Clearance_Status: '',
};

const fields: { key: keyof PredictionInput; label: string; type: string }[] = [
    { key: 'Container_ID', label: 'Container ID', type: 'text' },
    { key: 'Declaration_Date', label: 'Declaration Date', type: 'date' },
    { key: 'Declaration_Time', label: 'Declaration Time', type: 'time' },
    { key: 'Trade_Regime', label: 'Trade Regime', type: 'text' },
    { key: 'Origin_Country', label: 'Origin Country', type: 'text' },
    { key: 'Destination_Country', label: 'Destination Country', type: 'text' },
    { key: 'Destination_Port', label: 'Destination Port', type: 'text' },
    { key: 'HS_Code', label: 'HS Code', type: 'text' },
    { key: 'Importer_ID', label: 'Importer ID', type: 'text' },
    { key: 'Exporter_ID', label: 'Exporter ID', type: 'text' },
    { key: 'Declared_Value', label: 'Declared Value ($)', type: 'number' },
    { key: 'Declared_Weight', label: 'Declared Weight (kg)', type: 'number' },
    { key: 'Measured_Weight', label: 'Measured Weight (kg)', type: 'number' },
    { key: 'Shipping_Line', label: 'Shipping Line', type: 'text' },
    { key: 'Dwell_Time_Hours', label: 'Dwell Time (Hours)', type: 'number' },
    { key: 'Clearance_Status', label: 'Clearance Status', type: 'text' },
];

export default function Predict() {
    const [form, setForm] = useState<PredictionInput>(defaultForm);
    const [result, setResult] = useState<SinglePredictionResult | null>(null);

    const mutation = useMutation({
        mutationFn: (input: PredictionInput) => predictContainer(input),
        onSuccess: (data) => {
            setResult(data);
            toast.success(
                data.auto_escalated_by_importer_history
                    ? 'Prediction complete — auto-escalated!'
                    : 'Prediction complete!'
            );
        },
        onError: () => toast.error('Prediction failed.'),
    });

    const handleChange = (key: keyof PredictionInput, value: string) => {
        const numKeys = ['Declared_Value', 'Declared_Weight', 'Measured_Weight', 'Dwell_Time_Hours'];
        setForm((prev) => ({
            ...prev,
            [key]: numKeys.includes(key) ? parseFloat(value) || 0 : value,
        }));
    };

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        setResult(null);
        mutation.mutate(form);
    };

    return (
        <div className="space-y-8 pb-8 max-w-5xl mx-auto">
            <div>
                <h1 className="text-2xl font-bold text-foreground">Single Container Prediction</h1>
                <p className="text-sm text-foreground/60 mt-1">Manually enter container details to get a risk prediction.</p>
            </div>

            <form onSubmit={handleSubmit} className="bg-card border border-border rounded-xl p-6 shadow-sm">
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                    {fields.map((f) => (
                        <div key={f.key}>
                            <label className="block text-xs font-medium text-foreground/60 mb-1.5">{f.label}</label>
                            <input
                                type={f.type}
                                value={form[f.key]}
                                onChange={(e) => handleChange(f.key, e.target.value)}
                                className="w-full px-3 py-2 bg-background border border-border rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-primary/50 text-foreground"
                                required={f.key === 'Container_ID'}
                            />
                        </div>
                    ))}
                </div>

                <div className="flex justify-end mt-6">
                    <button
                        type="submit"
                        disabled={mutation.isPending || !form.Container_ID}
                        className="px-6 py-2.5 bg-primary text-white font-medium rounded-md hover:bg-primary/90 disabled:opacity-40 text-sm flex items-center gap-2"
                    >
                        {mutation.isPending ? <><Loader2 className="w-4 h-4 animate-spin" /> Predicting...</> : <><Crosshair className="w-4 h-4" /> Run Prediction</>}
                    </button>
                </div>
            </form>

            {/* ── Prediction Result ─────────────────────────────────────── */}
            {result && (
                <div className="space-y-4">
                    {/* Auto-Escalation Alert Banner */}
                    {result.auto_escalated_by_importer_history && (
                        <div className="flex items-start gap-3 p-4 rounded-xl border border-red-500/30 bg-red-500/10">
                            <ShieldAlert className="w-5 h-5 text-red-500 flex-shrink-0 mt-0.5" />
                            <div>
                                <p className="text-sm font-semibold text-red-500">
                                    Auto-Escalated to Critical by Business Rule
                                </p>
                                <p className="text-xs text-foreground/70 mt-0.5">
                                    {result.override_reason}
                                </p>
                            </div>
                        </div>
                    )}

                    <div className="bg-card border border-border rounded-xl p-6 shadow-sm space-y-5">
                        <div className="flex items-center justify-between">
                            <h2 className="text-lg font-semibold text-foreground">Prediction Result</h2>
                            <span className="text-xs text-muted-foreground font-mono bg-foreground/5 px-2 py-1 rounded">
                                {result.container_id}
                            </span>
                        </div>

                        {/* ── Model vs Final risk comparison ─────────────────── */}
                        {result.auto_escalated_by_importer_history ? (
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                                {/* Raw model prediction */}
                                <div className="p-4 bg-foreground/5 rounded-lg border border-border">
                                    <p className="text-xs text-muted-foreground mb-2 flex items-center gap-1">
                                        <TrendingUp className="w-3.5 h-3.5" /> ML Model Raw Output
                                    </p>
                                    <div className="flex items-center gap-2 mb-2">
                                        <span className="font-bold text-xl">{(result.model_risk_score * 100).toFixed(0)}</span>
                                        <span className="text-sm text-muted-foreground">/ 100</span>
                                        <span className={cn('ml-auto px-2.5 py-0.5 rounded-full text-xs font-semibold', riskBgClass[result.model_risk_level])}>
                                            {result.model_risk_level}
                                        </span>
                                    </div>
                                    <div className="w-full h-2 bg-foreground/10 rounded-full overflow-hidden">
                                        <div
                                            className="h-full rounded-full"
                                            style={{ width: `${result.model_risk_score * 100}%`, backgroundColor: riskColor[result.model_risk_level] }}
                                        />
                                    </div>
                                </div>
                                {/* Final business-adjusted decision */}
                                <div className="p-4 bg-red-500/10 rounded-lg border border-red-500/30">
                                    <p className="text-xs text-red-500 mb-2 flex items-center gap-1">
                                        <ShieldAlert className="w-3.5 h-3.5" /> Final Decision (Business Override)
                                    </p>
                                    <div className="flex items-center gap-2 mb-2">
                                        <span className="font-bold text-xl">{(result.final_risk_score * 100).toFixed(0)}</span>
                                        <span className="text-sm text-muted-foreground">/ 100</span>
                                        <span className={cn('ml-auto px-2.5 py-0.5 rounded-full text-xs font-semibold', riskBgClass[result.final_risk_level])}>
                                            {result.final_risk_level}
                                        </span>
                                    </div>
                                    <div className="w-full h-2 bg-foreground/10 rounded-full overflow-hidden">
                                        <div
                                            className="h-full rounded-full"
                                            style={{ width: `${result.final_risk_score * 100}%`, backgroundColor: riskColor[result.final_risk_level] }}
                                        />
                                    </div>
                                </div>
                            </div>
                        ) : (
                            /* Single card when no escalation */
                            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                                <div className="p-4 bg-foreground/5 rounded-lg">
                                    <p className="text-xs text-foreground/50 mb-1">Risk Score</p>
                                    <p className="font-bold text-xl">{(result.risk_score * 100).toFixed(0)}<span className="text-sm text-muted-foreground">/100</span></p>
                                    <div className="w-full h-1.5 bg-foreground/10 rounded-full mt-2 overflow-hidden">
                                        <div className="h-full rounded-full" style={{ width: `${result.risk_score * 100}%`, backgroundColor: riskColor[result.risk_level] }} />
                                    </div>
                                </div>
                                <div className="p-4 bg-foreground/5 rounded-lg">
                                    <p className="text-xs text-foreground/50 mb-1">Risk Level</p>
                                    <span className={cn('px-3 py-1 rounded-full text-sm font-semibold', riskBgClass[result.risk_level])}>{result.risk_level}</span>
                                </div>
                                <div className="p-4 bg-foreground/5 rounded-lg">
                                    <p className="text-xs text-foreground/50 mb-1">Anomaly</p>
                                    <div className="flex items-center gap-1.5">
                                        {result.anomaly_flag
                                            ? <><AlertTriangle className="w-4 h-4 text-risk-critical" /><span className="font-semibold text-risk-critical">Detected</span></>
                                            : <><CheckCircle2 className="w-4 h-4 text-risk-clear" /><span className="font-semibold text-risk-clear">Clear</span></>}
                                    </div>
                                </div>
                                <div className="p-4 bg-foreground/5 rounded-lg">
                                    <p className="text-xs text-foreground/50 mb-1">Anomaly Score</p>
                                    <p className="font-bold">{(result.anomaly_score ?? 0).toFixed(3)}</p>
                                </div>
                            </div>
                        )}

                        {/* ── Importer History Stats ─────────────────────────── */}
                        {result.importer_stats && (
                            <div className="flex flex-wrap gap-3 p-3 bg-foreground/5 rounded-lg border border-border text-xs">
                                <span className="flex items-center gap-1.5 text-muted-foreground">
                                    <History className="w-3.5 h-3.5" />
                                    <span className="font-medium">Importer History:</span>
                                </span>
                                <span className="text-foreground">
                                    <span className="font-semibold">{result.importer_stats.total_shipments}</span> total shipments
                                </span>
                                <span className="text-foreground">
                                    <span className={cn('font-semibold', result.importer_stats.critical_percentage > 20 ? 'text-red-500' : 'text-foreground')}>
                                        {result.importer_stats.critical_percentage.toFixed(1)}%
                                    </span> critical rate
                                    {result.importer_stats.critical_percentage > 20 && (
                                        <span className="ml-1 text-red-500">(exceeds 20% threshold)</span>
                                    )}
                                </span>
                            </div>
                        )}

                        {/* ── Top Contributing Factors ───────────────────────── */}
                        {result.top_factors && result.top_factors.length > 0 && (
                            <div>
                                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-3">
                                    Top Contributing Factors
                                </p>
                                <div className="space-y-2.5">
                                    {result.top_factors.map((f, i) => {
                                        const pct = Math.round(Math.abs(f.impact) * 100);
                                        const color =
                                            result.final_risk_level === 'Critical' ? '#ef4444' :
                                            result.final_risk_level === 'Low Risk' ? '#f59e0b' : '#22c55e';
                                        return (
                                            <div key={i}>
                                                <div className="flex justify-between text-xs mb-1">
                                                    <span className="text-foreground/80 font-medium">{f.feature.replace(/_/g, ' ')}</span>
                                                    <span className="text-foreground/60">{pct}%</span>
                                                </div>
                                                <div className="w-full h-1.5 bg-foreground/10 rounded-full overflow-hidden">
                                                    <div className="h-full rounded-full transition-all duration-500" style={{ width: `${Math.min(pct, 100)}%`, backgroundColor: color }} />
                                                </div>
                                            </div>
                                        );
                                    })}
                                </div>
                            </div>
                        )}

                        {/* ── Inspection Recommendation ──────────────────────── */}
                        {result.inspection_recommendation && (
                            <div className={cn(
                                'p-4 rounded-lg border text-sm',
                                result.final_risk_level === 'Critical' ? 'bg-red-500/10 border-red-500/30' :
                                result.final_risk_level === 'Low Risk' ? 'bg-amber-500/10 border-amber-500/30' :
                                    'bg-green-500/10 border-green-500/30'
                            )}>
                                <p className="font-semibold text-foreground mb-1">
                                    Recommended Action: {result.inspection_recommendation.recommendedAction}
                                </p>
                                <p className="text-foreground/70 text-xs">{result.inspection_recommendation.reason}</p>
                                <span className={cn(
                                    'inline-block mt-2 text-xs font-semibold px-2 py-0.5 rounded-full',
                                    result.inspection_recommendation.confidence === 'High' ? 'bg-red-500/15 text-red-500' :
                                    result.inspection_recommendation.confidence === 'Medium' ? 'bg-amber-500/15 text-amber-600' :
                                        'bg-green-500/15 text-green-600'
                                )}>
                                    {result.inspection_recommendation.confidence} Confidence
                                </span>
                            </div>
                        )}

                        {/* ── Explanation ────────────────────────────────────── */}
                        {result.explanation && (
                            <div className={cn(
                                'p-4 rounded-lg border text-sm',
                                result.final_risk_level === 'Critical' ? 'bg-risk-critical/10 border-risk-critical/20' :
                                result.final_risk_level === 'Low Risk' ? 'bg-risk-low/10 border-risk-low/20' :
                                    'bg-risk-clear/10 border-risk-clear/20'
                            )}>
                                <p className="font-semibold text-foreground flex items-center gap-1.5 mb-1">
                                    <Info className="w-3.5 h-3.5" /> Risk Explanation
                                </p>
                                <p className="text-foreground/80">{result.explanation}</p>
                            </div>
                        )}
                    </div>
                </div>
            )}
        </div>
    );
}
