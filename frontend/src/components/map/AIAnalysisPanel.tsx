/**
 * AIAnalysisPanel — slides in from the right when a container is tracked.
 * Shows explainable AI feature importance bars + natural-language bullets.
 */
import { useQuery } from '@tanstack/react-query';
import { fetchContainerAnalysis } from '@/api/routes';
import { X, Brain, AlertTriangle, Loader2, ChevronDown, ChevronUp } from 'lucide-react';
import { useState } from 'react';
import { cn } from '@/lib/utils';

interface Props {
    containerId: string;
    onClose: () => void;
}

const riskColor: Record<string, string> = {
    Critical: 'text-red-400',
    'Low Risk': 'text-amber-400',
    Clear: 'text-emerald-400',
};
const riskBg: Record<string, string> = {
    Critical: 'bg-red-500/10 border-red-500/20',
    'Low Risk': 'bg-amber-500/10 border-amber-500/20',
    Clear: 'bg-emerald-500/10 border-emerald-500/20',
};
const barColor = (value: number) => {
    if (value >= 0.7) return 'bg-red-500';
    if (value >= 0.4) return 'bg-amber-400';
    return 'bg-emerald-400';
};

export default function AIAnalysisPanel({ containerId, onClose }: Props) {
    const [expanded, setExpanded] = useState(true);

    const { data, isLoading, error } = useQuery({
        queryKey: ['ai-analysis', containerId],
        queryFn: () => fetchContainerAnalysis(containerId),
        enabled: !!containerId,
        staleTime: 60_000,
    });

    return (
        <div className={cn(
            'absolute top-4 right-4 w-[360px] z-[1001]',
            'bg-card/95 backdrop-blur-md border border-border rounded-2xl shadow-2xl',
            'flex flex-col overflow-hidden animate-in slide-in-from-right duration-300',
            expanded ? 'max-h-[85vh]' : 'max-h-[56px]'
        )}>
            {/* Header */}
            <div
                className="flex items-center justify-between px-4 py-3 bg-foreground/[0.03] border-b border-border cursor-pointer select-none shrink-0"
                onClick={() => setExpanded(e => !e)}
            >
                <div className="flex items-center gap-2">
                    <div className="w-7 h-7 rounded-lg bg-primary/10 border border-primary/20 flex items-center justify-center">
                        <Brain className="w-4 h-4 text-primary" />
                    </div>
                    <div>
                        <p className="text-xs font-bold text-foreground">AI Risk Analysis</p>
                        <p className="text-[10px] text-foreground/40 font-mono">{containerId}</p>
                    </div>
                </div>
                <div className="flex items-center gap-1">
                    {expanded ? <ChevronUp className="w-3.5 h-3.5 text-foreground/40" /> : <ChevronDown className="w-3.5 h-3.5 text-foreground/40" />}
                    <button
                        onClick={(e) => { e.stopPropagation(); onClose(); }}
                        className="p-1 rounded-full hover:bg-foreground/10 text-foreground/40 hover:text-foreground/80 ml-1"
                    >
                        <X className="w-3.5 h-3.5" />
                    </button>
                </div>
            </div>

            {/* Body */}
            {expanded && (
                <div className="overflow-y-auto flex-1 p-4 space-y-4">
                    {isLoading && (
                        <div className="flex items-center justify-center py-10 gap-2 text-foreground/40">
                            <Loader2 className="w-5 h-5 animate-spin" />
                            <span className="text-sm">Analysing container…</span>
                        </div>
                    )}

                    {error && (
                        <div className="flex items-center gap-2 p-3 rounded-lg bg-red-500/10 border border-red-500/20 text-red-400 text-xs">
                            <AlertTriangle className="w-4 h-4 shrink-0" />
                            Unable to load AI analysis. Container may lack model data.
                        </div>
                    )}

                    {data && (
                        <>
                            {/* Risk score + model confidence */}
                            <div className={cn('p-3 rounded-xl border', riskBg[data.risk_level] ?? 'bg-foreground/5 border-border')}>
                                <div className="flex items-center justify-between mb-2">
                                    <div>
                                        <p className="text-[10px] uppercase tracking-widest text-foreground/40 font-medium mb-0.5">ML Risk Assessment</p>
                                        <p className={cn('text-xl font-black', riskColor[data.risk_level] ?? 'text-foreground')}>{data.risk_level}</p>
                                    </div>
                                    <div className="text-right">
                                        <p className="text-[10px] uppercase tracking-widest text-foreground/40 font-medium mb-0.5">Risk Score</p>
                                        <p className="text-3xl font-black text-foreground tabular-nums">
                                            {Math.round((data.risk_score ?? 0) * 100)}
                                            <span className="text-sm font-normal text-foreground/40">/100</span>
                                        </p>
                                    </div>
                                </div>
                                {/* Model confidence bar */}
                                {data.model_confidence != null && (
                                    <div>
                                        <div className="flex justify-between text-[9px] text-foreground/40 font-medium mb-1">
                                            <span>Model Confidence</span>
                                            <span>{Math.round(data.model_confidence * 100)}%</span>
                                        </div>
                                        <div className="h-1.5 bg-foreground/10 rounded-full overflow-hidden">
                                            <div
                                                className="h-full rounded-full bg-primary/70 transition-all duration-700"
                                                style={{ width: `${Math.round(data.model_confidence * 100)}%` }}
                                            />
                                        </div>
                                    </div>
                                )}
                            </div>

                            {/* Feature importance bars */}
                            {data.features && data.features.length > 0 && (
                                <div>
                                    <p className="text-[10px] uppercase tracking-widest text-foreground/40 font-semibold mb-3">Feature Contributions</p>
                                    <div className="space-y-3">
                                        {data.features.map((f: any, i: number) => (
                                            <div key={i}>
                                                <div className="flex items-center justify-between mb-1">
                                                    <div className="flex items-center gap-1.5">
                                                        <span className="text-sm">{f.icon}</span>
                                                        <span className="text-xs font-medium text-foreground/80">{f.name}</span>
                                                    </div>
                                                    <span className="text-[10px] font-mono font-bold text-foreground/50">
                                                        {Math.round(f.value * 100)}%
                                                    </span>
                                                </div>
                                                {/* Bar */}
                                                <div className="h-2 bg-foreground/8 rounded-full overflow-hidden">
                                                    <div
                                                        className={cn('h-full rounded-full transition-all duration-700', barColor(f.value))}
                                                        style={{ width: `${Math.round(f.value * 100)}%` }}
                                                    />
                                                </div>
                                                <p className="text-[10px] text-foreground/40 mt-0.5 leading-relaxed">{f.detail}</p>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            )}

                            {/* Explanation bullets */}
                            {data.explanation_bullets && data.explanation_bullets.length > 0 && (
                                <div className="p-3 rounded-xl bg-amber-500/5 border border-amber-500/15">
                                    <p className="text-[10px] uppercase tracking-widest text-amber-500/60 font-semibold mb-2 flex items-center gap-1">
                                        <AlertTriangle className="w-3 h-3" /> Risk Explanation
                                    </p>

                                    {data.explanation && (
                                        <p className="text-[11px] text-foreground/80 italic leading-relaxed mb-3 border-b border-amber-500/10 pb-2">
                                            "{data.explanation}"
                                        </p>
                                    )}

                                    <ul className="space-y-1.5">
                                        {data.explanation_bullets.map((b: string, i: number) => (
                                            <li key={i} className="text-[11px] text-foreground/60 leading-relaxed flex items-start gap-1.5">
                                                <span className="text-amber-400 mt-0.5 shrink-0">•</span>
                                                {b}
                                            </li>
                                        ))}
                                    </ul>
                                </div>
                            )}

                            {/* Raw data grid */}
                            {data.raw && (
                                <div>
                                    <p className="text-[10px] uppercase tracking-widest text-foreground/40 font-semibold mb-2">Shipment Data</p>
                                    <div className="grid grid-cols-2 gap-1.5">
                                        {Object.entries(data.raw).filter(([, v]) => v != null).map(([k, v]) => (
                                            <div key={k} className="p-2 rounded-lg bg-foreground/[0.04] border border-border/50">
                                                <p className="text-[9px] uppercase tracking-wider text-foreground/30 font-medium">{k.replace(/_/g, ' ')}</p>
                                                <p className="text-[11px] font-semibold text-foreground/70 truncate mt-0.5">{String(v)}</p>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            )}

                            {/* Anomaly badge */}
                            {data.anomaly_flag && (
                                <div className="flex items-center gap-2 p-2.5 rounded-lg bg-red-500/8 border border-red-500/15">
                                    <AlertTriangle className="w-3.5 h-3.5 text-red-400 shrink-0" />
                                    <p className="text-[11px] text-red-400 font-medium">Anomaly detected by ML model</p>
                                </div>
                            )}
                        </>
                    )}
                </div>
            )}
        </div>
    );
}
