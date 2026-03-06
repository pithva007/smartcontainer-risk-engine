import { useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { fetchContainerById } from '@/api/routes';
import { Printer, MapPin, Anchor, AlertTriangle, ShieldCheck, ShieldAlert, Activity, Package, User, Clock, TrendingUp, Scale, DollarSign, Route, FileWarning, CheckCircle2, XCircle, ChevronRight } from 'lucide-react';
import { cn } from '@/lib/utils';

/* ── helpers ── */
function Field({ label, value, mono = false, highlight = false }: { label: string; value?: string | number | null; mono?: boolean; highlight?: boolean }) {
    return (
        <div className="py-2 border-b border-gray-100 last:border-0">
            <dt className="text-[10px] font-bold uppercase tracking-widest text-gray-400 mb-0.5">{label}</dt>
            <dd className={cn('text-sm font-semibold text-gray-900', mono && 'font-mono', highlight && 'text-red-600')}>{value ?? '—'}</dd>
        </div>
    );
}

function SectionHeader({ icon, title, color = 'bg-gray-800' }: { icon: React.ReactNode; title: string; color?: string }) {
    return (
        <div className={cn('flex items-center gap-2.5 px-5 py-3 text-white', color)}>
            {icon}
            <span className="text-xs font-black uppercase tracking-[0.15em]">{title}</span>
        </div>
    );
}

function FlagRow({ label, value, flagged }: { label: string; value: string; flagged: boolean }) {
    return (
        <div className="flex items-center justify-between py-2 border-b border-gray-100 last:border-0">
            <div className="flex items-center gap-2">
                {flagged
                    ? <XCircle className="w-3.5 h-3.5 text-red-500 shrink-0" />
                    : <CheckCircle2 className="w-3.5 h-3.5 text-green-500 shrink-0" />}
                <span className="text-xs text-gray-600">{label}</span>
            </div>
            <span className={cn('text-xs font-mono font-bold', flagged ? 'text-red-600' : 'text-gray-700')}>{value}</span>
        </div>
    );
}

export default function Dossier() {
    const { id } = useParams<{ id: string }>();

    const { data: container, isLoading, isError, refetch } = useQuery({
        queryKey: ['container', id],
        queryFn: () => fetchContainerById(id!),
        enabled: !!id,
        retry: 2,
    });

    if (isLoading) {
        return (
            <div className="p-12 flex flex-col items-center justify-center gap-3 text-foreground/50">
                <div className="w-8 h-8 border-2 border-current border-t-transparent rounded-full animate-spin" />
                <span className="text-sm">Loading case dossier for {id}…</span>
            </div>
        );
    }

    if (isError || !container) {
        return (
            <div className="p-12 flex flex-col items-center justify-center gap-4">
                <AlertTriangle className="w-10 h-10 text-red-500" />
                <p className="text-red-500 font-semibold">Container &quot;{id}&quot; not found or failed to load.</p>
                <p className="text-sm text-foreground/50">The container may not yet be processed, or the backend is unavailable.</p>
                <button onClick={() => refetch()} className="mt-2 px-4 py-2 border border-border rounded-lg text-sm hover:bg-accent transition-colors">Retry</button>
            </div>
        );
    }

    const isCritical = container.risk_level === 'Critical';
    const isLowRisk  = container.risk_level === 'Low Risk';
    const isClear    = container.risk_level === 'Clear';

    const riskPct      = Math.round((container.risk_score ?? 0) * 100);
    const anomalyPct   = Math.round((container.anomaly_score ?? 0) * 100);
    const weightDelta  = container.declared_weight ? ((container.measured_weight - container.declared_weight) / container.declared_weight) * 100 : 0;
    const weightAbs    = (container.measured_weight ?? 0) - (container.declared_weight ?? 0);
    const estValue     = container.declared_value ? Math.round(container.declared_value * (container.measured_weight / (container.declared_weight || 1))) : 0;
    const valueDelta   = container.declared_value ? ((estValue - container.declared_value) / container.declared_value) * 100 : 0;

    const statusColor: Record<string, string> = {
        NEW: 'bg-gray-100 text-gray-700', ASSIGNED: 'bg-blue-100 text-blue-700',
        IN_REVIEW: 'bg-amber-100 text-amber-700', CLEARED: 'bg-green-100 text-green-700',
        HOLD: 'bg-orange-100 text-orange-700', DETENTION: 'bg-red-100 text-red-700',
    };

    const generated = new Date().toLocaleString('en-GB', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
    const processedAt = container.processed_at ? new Date(container.processed_at).toLocaleString('en-GB', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '—';
    const declarationDate = container.declaration_date ? new Date(container.declaration_date).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }) : '—';

    return (
        <div className="max-w-[900px] mx-auto bg-white text-black min-h-screen print:max-w-none print:mx-0">

            {/* ═══ CLASSIFICATION BANNER ═══ */}
            <div className={cn(
                'text-center py-1.5 text-[10px] font-black uppercase tracking-[0.3em] print:block',
                isCritical ? 'bg-red-700 text-white' : isLowRisk ? 'bg-amber-500 text-white' : 'bg-green-700 text-white'
            )}>
                {isCritical ? '⚠ RESTRICTED — CRITICAL RISK ASSESSMENT — AUTHORISED PERSONNEL ONLY ⚠'
                    : isLowRisk ? '— CONTROLLED — ELEVATED RISK — REVIEW REQUIRED —'
                    : '— UNRESTRICTED — CLEARED FOR PROCESSING —'}
            </div>

            <div className="p-8 print:p-6 space-y-6">

                {/* ═══ MASTHEAD ═══ */}
                <header className="border-b-[3px] border-black pb-5">
                    <div className="flex items-start justify-between gap-4">
                        <div className="flex-1">
                            <div className="flex items-center gap-3 mb-2">
                                <div className="w-10 h-10 bg-gray-900 rounded flex items-center justify-center shrink-0">
                                    <Package className="w-5 h-5 text-white" />
                                </div>
                                <div>
                                    <p className="text-[9px] font-black uppercase tracking-[0.25em] text-gray-500">SmartContainer Risk Engine  ·  Official Case Dossier</p>
                                    <h1 className="text-3xl font-black font-mono tracking-tight leading-none mt-0.5">
                                        CNT-{container.container_id}
                                    </h1>
                                </div>
                            </div>
                            <div className="flex flex-wrap gap-x-6 gap-y-1 mt-3 text-[11px] font-mono text-gray-500">
                                <span>Generated: <strong className="text-gray-800">{generated}</strong></span>
                                <span>Processed: <strong className="text-gray-800">{processedAt}</strong></span>
                                {container.upload_batch_id && <span>Batch: <strong className="text-gray-800 font-mono">{container.upload_batch_id}</strong></span>}
                                <span>HS Code: <strong className="text-gray-800">{container.hs_code ?? '—'}</strong></span>
                            </div>
                        </div>
                        {/* Risk verdict stamp */}
                        <div className={cn(
                            'shrink-0 border-4 px-5 py-3 text-center transform rotate-3 shadow-sm',
                            isCritical ? 'border-red-700 bg-red-50' : isLowRisk ? 'border-amber-500 bg-amber-50' : 'border-green-700 bg-green-50'
                        )}>
                            {isCritical ? <ShieldAlert className="w-7 h-7 text-red-700 mx-auto mb-1" />
                                : isLowRisk ? <AlertTriangle className="w-7 h-7 text-amber-600 mx-auto mb-1" />
                                : <ShieldCheck className="w-7 h-7 text-green-700 mx-auto mb-1" />}
                            <p className={cn('text-xl font-black font-mono uppercase leading-none', isCritical ? 'text-red-700' : isLowRisk ? 'text-amber-600' : 'text-green-700')}>
                                {container.risk_level ?? 'UNKNOWN'}
                            </p>
                            <p className="text-[9px] font-bold uppercase tracking-widest text-gray-500 mt-1">Risk Verdict</p>
                        </div>
                    </div>
                </header>

                {/* ═══ ROW 1: SHIPMENT IDENTITY + PARTIES + TRADE ═══ */}
                <div className="grid grid-cols-3 gap-4">

                    {/* Shipment Identity */}
                    <div className="border border-gray-200 rounded-lg overflow-hidden">
                        <SectionHeader icon={<Package className="w-3.5 h-3.5" />} title="Shipment Identity" />
                        <dl className="px-4 py-2 space-y-0">
                            <Field label="Container ID"     value={container.container_id} mono />
                            <Field label="Declaration Date" value={declarationDate} />
                            <Field label="Declaration Time" value={container.declaration_time} mono />
                            <Field label="HS Code"          value={container.hs_code} mono />
                            <Field label="Trade Regime"     value={container.trade_regime} />
                            <Field label="Clearance Status" value={container.clearance_status} />
                            <Field label="Shipping Line"    value={container.shipping_line} />
                        </dl>
                    </div>

                    {/* Parties */}
                    <div className="border border-gray-200 rounded-lg overflow-hidden">
                        <SectionHeader icon={<User className="w-3.5 h-3.5" />} title="Parties Involved" />
                        <dl className="px-4 py-2 space-y-0">
                            <Field label="Exporter ID"          value={container.exporter_id} mono />
                            <Field label="Exporter Frequency"   value={container.exporter_frequency != null ? `${container.exporter_frequency} shipments` : undefined} />
                            <Field label="Importer ID"          value={container.importer_id} mono />
                            <Field label="Importer Frequency"   value={container.importer_frequency != null ? `${container.importer_frequency} shipments` : undefined} />
                        </dl>
                        <SectionHeader icon={<Clock className="w-3.5 h-3.5" />} title="Dwell &amp; Timing" color="bg-gray-600" />
                        <dl className="px-4 py-2 space-y-0">
                            <Field label="Dwell Time"         value={container.dwell_time_hours != null ? `${container.dwell_time_hours} hours` : undefined} highlight={(container.dwell_time_hours ?? 0) > 48} />
                            <Field label="High Dwell Flag"    value={container.high_dwell_time_flag ? 'YES — ELEVATED' : 'NO'} highlight={!!container.high_dwell_time_flag} />
                        </dl>
                    </div>

                    {/* Route */}
                    <div className="border border-gray-200 rounded-lg overflow-hidden">
                        <SectionHeader icon={<Route className="w-3.5 h-3.5" />} title="Trade Route" />
                        <div className="p-4 flex flex-col items-center gap-3">
                            <div className="w-full text-center bg-gray-50 border border-gray-200 rounded-lg px-3 py-3">
                                <MapPin className="w-5 h-5 text-gray-500 mx-auto mb-1" />
                                <p className="font-black text-lg font-mono">{container.origin_country ?? '—'}</p>
                                <p className="text-[9px] uppercase tracking-widest text-gray-400 font-bold">Origin Country</p>
                            </div>
                            <div className="flex items-center gap-1 text-gray-400">
                                <ChevronRight className="w-3.5 h-3.5" />
                                <Anchor className="w-3.5 h-3.5" />
                                <ChevronRight className="w-3.5 h-3.5" />
                            </div>
                            <div className="w-full text-center bg-indigo-50 border border-indigo-200 rounded-lg px-3 py-3">
                                <MapPin className="w-5 h-5 text-indigo-600 mx-auto mb-1" />
                                <p className="font-black text-lg font-mono">{container.destination_port ?? container.destination_country ?? '—'}</p>
                                <p className="text-[9px] uppercase tracking-widest text-indigo-400 font-bold">Destination Port</p>
                                {container.destination_country && container.destination_port && (
                                    <p className="text-[10px] text-indigo-400 font-mono mt-0.5">{container.destination_country}</p>
                                )}
                            </div>
                            <dl className="w-full space-y-0">
                                <Field label="Trade Route Risk Score" value={container.trade_route_risk != null ? `${(container.trade_route_risk * 100).toFixed(1)}% risk index` : undefined} highlight={(container.trade_route_risk ?? 0) > 0.5} />
                            </dl>
                        </div>
                    </div>
                </div>

                {/* ═══ ROW 2: ML RISK PREDICTION ═══ */}
                <div className="border-2 border-gray-800 rounded-lg overflow-hidden">
                    <SectionHeader icon={<Activity className="w-3.5 h-3.5" />} title="ML Risk Prediction — Model Output" color="bg-gray-900" />
                    <div className="grid grid-cols-4 divide-x divide-gray-200">

                        {/* Risk Score */}
                        <div className={cn('p-5 text-center', isCritical ? 'bg-red-50' : isLowRisk ? 'bg-amber-50' : 'bg-green-50')}>
                            <p className="text-[9px] font-black uppercase tracking-[0.2em] text-gray-500 mb-2">Composite Risk Score</p>
                            <p className={cn('text-6xl font-black font-mono leading-none', isCritical ? 'text-red-700' : isLowRisk ? 'text-amber-600' : 'text-green-700')}>
                                {riskPct}<span className="text-2xl">%</span>
                            </p>
                            <div className="mt-3 w-full bg-gray-200 rounded-full h-2.5">
                                <div className={cn('h-2.5 rounded-full transition-all', isCritical ? 'bg-red-600' : isLowRisk ? 'bg-amber-500' : 'bg-green-600')} style={{ width: `${riskPct}%` }} />
                            </div>
                            <p className="text-[9px] text-gray-400 font-mono mt-1.5">raw: {container.risk_score?.toFixed(4) ?? '—'}</p>
                        </div>

                        {/* Risk Level */}
                        <div className={cn('p-5 text-center flex flex-col items-center justify-center gap-2', isCritical ? 'bg-red-50' : isLowRisk ? 'bg-amber-50' : 'bg-green-50')}>
                            <p className="text-[9px] font-black uppercase tracking-[0.2em] text-gray-500">Risk Classification</p>
                            {isCritical ? <ShieldAlert className="w-12 h-12 text-red-600" />
                                : isLowRisk ? <AlertTriangle className="w-12 h-12 text-amber-500" />
                                : <ShieldCheck className="w-12 h-12 text-green-600" />}
                            <p className={cn('text-2xl font-black font-mono uppercase', isCritical ? 'text-red-700' : isLowRisk ? 'text-amber-600' : 'text-green-700')}>
                                {container.risk_level ?? 'N/A'}
                            </p>
                        </div>

                        {/* Anomaly */}
                        <div className={cn('p-5 text-center', container.anomaly_flag ? 'bg-red-50' : 'bg-gray-50')}>
                            <p className="text-[9px] font-black uppercase tracking-[0.2em] text-gray-500 mb-2">Isolation Forest</p>
                            <p className={cn('text-3xl font-black font-mono', container.anomaly_flag ? 'text-red-700' : 'text-green-700')}>
                                {container.anomaly_flag ? '⚠ ANOMALY' : '✓ NORMAL'}
                            </p>
                            {container.anomaly_score != null && (
                                <>
                                    <p className="text-4xl font-black font-mono text-gray-800 mt-2">{anomalyPct}<span className="text-xl">%</span></p>
                                    <div className="mt-2 w-full bg-gray-200 rounded-full h-1.5">
                                        <div className={cn('h-1.5 rounded-full', container.anomaly_flag ? 'bg-red-500' : 'bg-green-500')} style={{ width: `${anomalyPct}%` }} />
                                    </div>
                                    <p className="text-[9px] text-gray-400 font-mono mt-1">raw: {container.anomaly_score.toFixed(4)}</p>
                                </>
                            )}
                        </div>

                        {/* Inspection Workflow */}
                        <div className="p-5 bg-gray-50">
                            <p className="text-[9px] font-black uppercase tracking-[0.2em] text-gray-500 mb-3">Workflow Status</p>
                            {container.inspection_status && (
                                <span className={cn('inline-block px-3 py-1 rounded-full text-xs font-bold mb-3', statusColor[container.inspection_status] ?? 'bg-gray-100 text-gray-700')}>
                                    {container.inspection_status}
                                </span>
                            )}
                            <dl className="space-y-0 text-xs">
                                <div className="py-1 border-b border-gray-200">
                                    <dt className="text-[9px] uppercase tracking-wider text-gray-400">Assigned To</dt>
                                    <dd className="font-mono font-bold text-gray-800">{container.assigned_to ?? 'Unassigned'}</dd>
                                </div>
                                <div className="py-1">
                                    <dt className="text-[9px] uppercase tracking-wider text-gray-400">Notes on File</dt>
                                    <dd className="font-bold text-gray-800">{container.notes?.length ?? 0} note(s)</dd>
                                </div>
                            </dl>
                        </div>
                    </div>
                </div>

                {/* ═══ ROW 3: PHYSICAL & FINANCIAL ANALYSIS ═══ */}
                <div className="grid grid-cols-2 gap-4">

                    {/* Weight Analysis */}
                    <div className="border border-gray-200 rounded-lg overflow-hidden">
                        <SectionHeader icon={<Scale className="w-3.5 h-3.5" />} title="Physical Weight Analysis" color="bg-slate-700" />
                        <div className="p-5">
                            <div className="grid grid-cols-2 gap-3 mb-4">
                                <div className="bg-gray-50 border border-gray-200 rounded-lg p-3 text-center">
                                    <p className="text-[9px] font-bold uppercase tracking-widest text-gray-400 mb-1">Declared Weight</p>
                                    <p className="text-2xl font-black font-mono">{container.declared_weight?.toLocaleString() ?? '—'}</p>
                                    <p className="text-xs text-gray-400 font-mono">kg</p>
                                </div>
                                <div className="bg-gray-50 border border-gray-200 rounded-lg p-3 text-center">
                                    <p className="text-[9px] font-bold uppercase tracking-widest text-gray-400 mb-1">Measured Weight</p>
                                    <p className="text-2xl font-black font-mono">{container.measured_weight?.toLocaleString() ?? '—'}</p>
                                    <p className="text-xs text-gray-400 font-mono">kg</p>
                                </div>
                            </div>
                            <div className={cn('rounded-lg px-4 py-3 grid grid-cols-3 gap-2 text-center text-sm', Math.abs(weightDelta) > 10 ? 'bg-red-100' : Math.abs(weightDelta) > 5 ? 'bg-amber-100' : 'bg-gray-100')}>
                                <div>
                                    <p className="text-[9px] uppercase text-gray-500 font-bold">Δ Absolute</p>
                                    <p className={cn('font-black font-mono', Math.abs(weightAbs) > 20 ? 'text-red-700' : 'text-gray-800')}>{weightAbs > 0 ? '+' : ''}{weightAbs.toFixed(1)} kg</p>
                                </div>
                                <div>
                                    <p className="text-[9px] uppercase text-gray-500 font-bold">Δ Percentage</p>
                                    <p className={cn('font-black font-mono', Math.abs(weightDelta) > 10 ? 'text-red-700' : 'text-gray-800')}>{weightDelta > 0 ? '+' : ''}{weightDelta.toFixed(1)}%</p>
                                </div>
                                <div>
                                    <p className="text-[9px] uppercase text-gray-500 font-bold">Mismatch %</p>
                                    <p className={cn('font-black font-mono', (container.weight_mismatch_percentage ?? 0) > 10 ? 'text-red-700' : 'text-gray-800')}>{container.weight_mismatch_percentage?.toFixed(1) ?? '—'}%</p>
                                </div>
                            </div>
                            <div className="mt-3 grid grid-cols-2 gap-2 text-xs">
                                <FlagRow label="Weight Mismatch" value={`${container.weight_mismatch_percentage?.toFixed(1) ?? '?'}%`} flagged={Math.abs(container.weight_mismatch_percentage ?? 0) > 10} />
                                <FlagRow label="Weight Difference" value={`${container.weight_difference?.toFixed(1) ?? '?'} kg`} flagged={Math.abs(container.weight_difference ?? 0) > 20} />
                            </div>
                        </div>
                    </div>

                    {/* Value Analysis */}
                    <div className="border border-gray-200 rounded-lg overflow-hidden">
                        <SectionHeader icon={<DollarSign className="w-3.5 h-3.5" />} title="Financial Value Analysis" color="bg-slate-700" />
                        <div className="p-5">
                            <div className="grid grid-cols-2 gap-3 mb-4">
                                <div className="bg-gray-50 border border-gray-200 rounded-lg p-3 text-center">
                                    <p className="text-[9px] font-bold uppercase tracking-widest text-gray-400 mb-1">Declared Value</p>
                                    <p className="text-2xl font-black font-mono">{container.declared_value?.toLocaleString() ?? '—'}</p>
                                    <p className="text-xs text-gray-400 font-mono">USD</p>
                                </div>
                                <div className="bg-gray-50 border border-gray-200 rounded-lg p-3 text-center">
                                    <p className="text-[9px] font-bold uppercase tracking-widest text-gray-400 mb-1">Estimated Value</p>
                                    <p className="text-2xl font-black font-mono">{estValue.toLocaleString()}</p>
                                    <p className="text-xs text-gray-400 font-mono">USD (derived)</p>
                                </div>
                            </div>
                            <div className={cn('rounded-lg px-4 py-3 grid grid-cols-3 gap-2 text-center text-sm', Math.abs(valueDelta) > 15 ? 'bg-red-100' : Math.abs(valueDelta) > 8 ? 'bg-amber-100' : 'bg-gray-100')}>
                                <div>
                                    <p className="text-[9px] uppercase text-gray-500 font-bold">Δ Absolute</p>
                                    <p className={cn('font-black font-mono', Math.abs(estValue - (container.declared_value ?? 0)) > 5000 ? 'text-red-700' : 'text-gray-800')}>
                                        {(estValue - (container.declared_value ?? 0)) > 0 ? '+' : ''}${(estValue - (container.declared_value ?? 0)).toLocaleString()}
                                    </p>
                                </div>
                                <div>
                                    <p className="text-[9px] uppercase text-gray-500 font-bold">Δ Percentage</p>
                                    <p className={cn('font-black font-mono', Math.abs(valueDelta) > 15 ? 'text-red-700' : 'text-gray-800')}>{valueDelta > 0 ? '+' : ''}{valueDelta.toFixed(1)}%</p>
                                </div>
                                <div>
                                    <p className="text-[9px] uppercase text-gray-500 font-bold">Val/Weight</p>
                                    <p className="font-black font-mono text-gray-800">${container.value_to_weight_ratio?.toFixed(2) ?? '—'}/kg</p>
                                </div>
                            </div>
                            <div className="mt-3 grid grid-cols-2 gap-2 text-xs">
                                <FlagRow label="Value Discrepancy" value={`${valueDelta.toFixed(1)}%`} flagged={Math.abs(valueDelta) > 15} />
                                <FlagRow label="V/W Ratio" value={`$${container.value_to_weight_ratio?.toFixed(2) ?? '?'}/kg`} flagged={false} />
                            </div>
                        </div>
                    </div>
                </div>

                {/* ═══ ROW 4: ML FEATURE INDICATORS ═══ */}
                <div className="border border-gray-200 rounded-lg overflow-hidden">
                    <SectionHeader icon={<TrendingUp className="w-3.5 h-3.5" />} title="ML Feature Indicators — Anomaly Detection Signals" color="bg-indigo-800" />
                    <div className="p-5 grid grid-cols-4 gap-x-8 gap-y-0">
                        <FlagRow label="Weight Mismatch >10%"     value={`${container.weight_mismatch_percentage?.toFixed(1) ?? '?'}%`}  flagged={Math.abs(container.weight_mismatch_percentage ?? 0) > 10} />
                        <FlagRow label="Weight Diff >20 kg"        value={`${container.weight_difference?.toFixed(1) ?? '?'} kg`}           flagged={Math.abs(container.weight_difference ?? 0) > 20} />
                        <FlagRow label="High Dwell Time (>48h)"   value={container.high_dwell_time_flag ? 'FLAGGED' : 'NORMAL'}            flagged={!!container.high_dwell_time_flag} />
                        <FlagRow label="Anomaly Detected"         value={container.anomaly_flag ? 'YES' : 'NO'}                            flagged={!!container.anomaly_flag} />
                        <FlagRow label="Trade Route Risk >50%"    value={`${((container.trade_route_risk ?? 0) * 100).toFixed(1)}%`}       flagged={(container.trade_route_risk ?? 0) > 0.5} />
                        <FlagRow label="Risk Score >70%"          value={`${riskPct}%`}                                                    flagged={riskPct > 70} />
                        <FlagRow label="Value Delta >15%"         value={`${valueDelta.toFixed(1)}%`}                                      flagged={Math.abs(valueDelta) > 15} />
                        <FlagRow label="Weight Delta >10%"        value={`${weightDelta.toFixed(1)}%`}                                     flagged={Math.abs(weightDelta) > 10} />
                    </div>
                </div>

                {/* ═══ ROW 5: AI SMART SUMMARY ═══ */}
                <div className="border border-gray-200 rounded-lg overflow-hidden">
                    <SectionHeader icon={<FileWarning className="w-3.5 h-3.5" />} title="AI Smart Summary — Automated Risk Narrative" color="bg-indigo-700" />
                    <div className="p-5 bg-indigo-50">
                        <div className="bg-white border border-indigo-200 rounded-lg p-4 font-mono text-sm leading-relaxed shadow-inner">
                            <p className="text-indigo-400 text-xs mb-2 font-bold">// ENGINE NARRATIVE OUTPUT</p>
                            <p className="text-gray-800 whitespace-pre-wrap">
                                {container.explanation ?? `No anomaly narrative generated. Risk score: ${container.risk_score?.toFixed(4) ?? 'N/A'}.`}
                            </p>
                        </div>
                    </div>
                </div>

                {/* ═══ ROW 6: OFFICER NOTES ═══ */}
                {container.notes && container.notes.length > 0 && (
                    <div className="border border-gray-200 rounded-lg overflow-hidden">
                        <SectionHeader icon={<User className="w-3.5 h-3.5" />} title={`Officer Notes — ${container.notes.length} entr${container.notes.length === 1 ? 'y' : 'ies'}`} color="bg-gray-700" />
                        <div className="divide-y divide-gray-100">
                            {container.notes.map((note: { text: string; added_by?: string; timestamp?: string }, i: number) => (
                                <div key={i} className="px-5 py-3 flex gap-4">
                                    <div className="w-7 h-7 rounded-full bg-gray-200 flex items-center justify-center shrink-0 mt-0.5">
                                        <User className="w-3.5 h-3.5 text-gray-500" />
                                    </div>
                                    <div className="flex-1">
                                        <div className="flex items-center gap-2 mb-1">
                                            <span className="text-xs font-bold text-gray-800">{note.added_by ?? 'Officer'}</span>
                                            {note.timestamp && <span className="text-[10px] text-gray-400 font-mono">{new Date(note.timestamp).toLocaleString('en-GB')}</span>}
                                        </div>
                                        <p className="text-sm text-gray-700">{note.text}</p>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>
                )}

                {/* ═══ PRINT CONTROLS ═══ */}
                <div className="print:hidden flex items-center justify-between pt-2 border-t-2 border-dashed border-gray-200 mt-6">
                    <p className="text-xs text-gray-400 font-mono">Case Dossier · CNT-{container.container_id} · SmartContainer Risk Engine v2</p>
                    <button
                        onClick={() => window.print()}
                        className="flex items-center gap-2 bg-gray-900 text-white hover:bg-black px-6 py-2.5 rounded-lg font-bold text-sm transition-colors font-mono"
                    >
                        <Printer className="w-4 h-4" />
                        Download PDF
                    </button>
                </div>

            </div>

            {/* ═══ PRINT FOOTER ═══ */}
            <div className="hidden print:block border-t-2 border-gray-300 mx-8 py-3 text-center">
                <p className="text-[9px] font-mono text-gray-400 uppercase tracking-widest">
                    SMARTCONTAINER RISK ENGINE — OFFICIAL CASE DOSSIER — CNT-{container.container_id} — GENERATED {generated} — {isCritical ? 'RESTRICTED' : isLowRisk ? 'CONTROLLED' : 'UNRESTRICTED'}
                </p>
            </div>

        </div>
    );
}
