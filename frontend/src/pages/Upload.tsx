import { useState, useRef, useEffect } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { streamUploadDataset, listJobs, deleteJob, clearAllData, exportLivePredictionsCSV, exportPredictionsCSV } from '@/api/routes';
import { cn } from '@/lib/utils';
import toast from 'react-hot-toast';
import { useLivePredictions } from '@/hooks/useLivePredictions';
import type { JobRecord, JobStatus, PredictionRow } from '@/types/apiTypes';
import { TableSkeleton } from '@/components/ui/Skeleton';

/* ── Status badge ── */
const statusColors: Record<JobStatus, string> = {
    waiting: 'text-amber-400 bg-amber-400/10 border-amber-400/20',
    active: 'text-blue-400 bg-blue-400/10 border-blue-400/20',
    completed: 'text-emerald-400 bg-emerald-400/10 border-emerald-400/20',
    failed: 'text-red-400 bg-red-400/10 border-red-400/20',
    delayed: 'text-orange-400 bg-orange-400/10 border-orange-400/20',
};

function JobStatusBadge({ status }: { status: JobStatus }) {
    const labels = { waiting: 'Waiting', active: 'Processing', completed: 'Done', failed: 'Failed', delayed: 'Delayed' };
    const icons: Record<JobStatus, React.ReactNode> = {
        waiting: <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>,
        active: <svg className="w-3 h-3 animate-spin" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" /></svg>,
        completed: <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" /></svg>,
        failed: <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>,
        delayed: <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>,
    };
    return (
        <span className={cn('inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-xs font-medium border', statusColors[status])}>
            {icons[status]}
            {labels[status]}
        </span>
    );
}

/* ── Live preview row ── */
function LiveRowCard({ row }: { row: PredictionRow }) {
    const levelColors: Record<string, string> = {
        Critical: 'border-l-red-500 bg-red-500/5',
        'Low Risk': 'border-l-amber-500 bg-amber-500/5',
        Clear: 'border-l-emerald-500 bg-emerald-500/5',
    };
    const pct = Math.round(row.risk_score * 100);
    return (
        <div className={cn('border-l-4 rounded-lg px-3 py-2.5 flex items-center gap-3', levelColors[row.risk_level] ?? 'border-l-border bg-card')}>
            <div className="flex-1 min-w-0 grid grid-cols-3 gap-x-4 gap-y-0.5">
                <span className="text-xs font-mono font-semibold text-foreground truncate col-span-1">{row.container_id}</span>
                <span className="text-xs text-foreground/50 col-span-2 truncate">{row.origin_country} → {row.destination_country}</span>
                <span className="text-xs text-foreground/60 col-span-3 line-clamp-1">{row.explanation}</span>
            </div>
            <div className="shrink-0 flex items-center gap-2">
                <div className="w-12 h-1.5 bg-white/10 rounded-full overflow-hidden">
                    <div className="h-full rounded-full" style={{ width: `${pct}%`, background: pct >= 70 ? '#ef4444' : pct >= 40 ? '#f59e0b' : '#10b981' }} />
                </div>
                <span className={cn('text-[10px] font-bold px-1.5 py-0.5 rounded', {
                    'bg-red-500/20 text-red-400': row.risk_level === 'Critical',
                    'bg-amber-500/20 text-amber-400': row.risk_level === 'Low Risk',
                    'bg-emerald-500/20 text-emerald-400': row.risk_level === 'Clear',
                })}>{row.risk_level}</span>
            </div>
        </div>
    );
}

export default function Upload() {
    const [isDragging, setIsDragging] = useState(false);
    const [file, setFile] = useState<File | null>(null);
    const [uploadProgress, setUploadProgress] = useState(0);
    const [activeJobId, setActiveJobId] = useState<string | null>(null);
    const [lastBatchId, setLastBatchId] = useState<string | null>(null);
    const [completedSummary, setCompletedSummary] = useState<{ total: number; processed: number; failed: number } | null>(null);
    const fileRef = useRef<HTMLInputElement>(null);
    const qc = useQueryClient();

    /* Listen to live rows for the active job only */
    const { rows: liveRows, progress, done, error: streamError, liveCounts, isStreaming, clearRows } = useLivePredictions(activeJobId ?? undefined);

    /* When stream finishes, refresh all relevant queries */
    useEffect(() => {
        if (done) {
            setLastBatchId(done.batch_id ?? null);
            setCompletedSummary({ total: done.total, processed: done.processed, failed: done.failed });
            setActiveJobId(null);
            qc.invalidateQueries({ queryKey: ['jobs'] });
            qc.invalidateQueries({ queryKey: ['summary'] });
            qc.invalidateQueries({ queryKey: ['risk-distribution'] });
            qc.invalidateQueries({ queryKey: ['recent-high-risk'] });
            qc.invalidateQueries({ queryKey: ['tracking-list'] });
            toast.success(`Stream complete — ${done.processed.toLocaleString()} rows processed`);
        }
    }, [done, qc]);

    const jobs = useQuery({ queryKey: ['jobs'], queryFn: listJobs });

    const deleteMutation = useMutation({
        mutationFn: (jobId: string) => deleteJob(jobId),
        onSuccess: (data) => {
            qc.invalidateQueries({ queryKey: ['jobs'] });
            qc.invalidateQueries({ queryKey: ['summary'] });
            qc.invalidateQueries({ queryKey: ['risk-distribution'] });
            qc.invalidateQueries({ queryKey: ['recent-high-risk'] });
            qc.invalidateQueries({ queryKey: ['tracking-list'] });
            const deleted = (data as { deleted_containers?: number }).deleted_containers;
            toast.success(deleted ? `Job removed — ${deleted} containers cleared.` : 'Job removed.');
        },
        onError: () => toast.error('Could not delete job.'),
    });

    const clearAllMutation = useMutation({
        mutationFn: clearAllData,
        onSuccess: (data: { deleted_containers?: number }) => {
            qc.invalidateQueries({ queryKey: ['jobs'] });
            qc.invalidateQueries({ queryKey: ['summary'] });
            qc.invalidateQueries({ queryKey: ['risk-distribution'] });
            qc.invalidateQueries({ queryKey: ['recent-high-risk'] });
            qc.invalidateQueries({ queryKey: ['tracking-list'] });
            toast.success(`All data cleared — ${data.deleted_containers?.toLocaleString() ?? 0} containers removed.`);
        },
        onError: () => toast.error('Failed to clear data.'),
    });

    const mutation = useMutation({
        mutationFn: (f: File) => {
            const fd = new FormData();
            fd.append('dataset', f);
            return streamUploadDataset(fd, setUploadProgress);
        },
        onSuccess: (data) => {
            setActiveJobId(data.job_id);
            setLastBatchId(data.batch_id ?? null);
            clearRows();
            qc.invalidateQueries({ queryKey: ['jobs'] });
            toast.success('File received — streaming predictions live');
        },
        onError: () => toast.error('Upload failed. Please try again.'),
    });

    const validate = (f: File) => {
        if (f.name.endsWith('.csv') || f.name.endsWith('.xlsx')) return true;
        toast.error('Only CSV and XLSX files are supported.');
        return false;
    };

    const handleDrop = (e: React.DragEvent) => {
        e.preventDefault();
        setIsDragging(false);
        const f = e.dataTransfer.files[0];
        if (f && validate(f)) setFile(f);
    };

    const handleFile = (e: React.ChangeEvent<HTMLInputElement>) => {
        const f = e.target.files?.[0];
        if (f && validate(f)) setFile(f);
    };

    const handleUpload = () => {
        if (!file) return;
        setUploadProgress(0);
        setCompletedSummary(null);
        mutation.mutate(file);
    };

    const handleDelete = (jobId: string) => {
        if (!window.confirm('Remove this job from history?')) return;
        deleteMutation.mutate(jobId);
    };

    const handleClearAll = () => {
        if (!window.confirm('This will permanently delete ALL container records and job history. This cannot be undone. Continue?')) return;
        clearAllMutation.mutate();
    };

    const isUploading = mutation.isPending;
    const streaming = isStreaming || !!activeJobId;

    return (
        <div className="space-y-8 pb-8 max-w-4xl mx-auto">
            <div>
                <h1 className="text-2xl font-bold text-foreground">Upload Dataset</h1>
                <p className="text-sm text-foreground/60 mt-1">Upload shipment data in CSV or XLSX format. Predictions stream live row-by-row as soon as each record is processed.</p>
            </div>

            {/* Drop Zone */}
            <div
                className={cn(
                    'border-2 border-dashed rounded-xl p-10 flex flex-col items-center justify-center transition-colors cursor-pointer bg-card',
                    isDragging ? 'border-primary bg-primary/5' : 'border-border hover:border-foreground/30',
                    file ? 'border-solid border-primary bg-primary/5' : ''
                )}
                onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
                onDragLeave={() => setIsDragging(false)}
                onDrop={handleDrop}
                onClick={() => !file && fileRef.current?.click()}
            >
                <input ref={fileRef} type="file" accept=".csv,.xlsx" className="hidden" onChange={handleFile} />
                {!file ? (
                    <>
                        <div className="w-16 h-16 rounded-full bg-primary/10 flex items-center justify-center mb-4 text-primary">
                            <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
                            </svg>
                        </div>
                        <p className="font-medium text-lg text-foreground">Click to upload or drag and drop</p>
                        <p className="text-sm text-foreground/50 mt-1">CSV or XLSX — predictions stream live as each row is classified</p>
                    </>
                ) : (
                    <div className="flex items-center gap-4 w-full">
                        <div className="w-12 h-12 bg-primary/10 rounded-lg flex items-center justify-center text-primary shrink-0">
                            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                            </svg>
                        </div>
                        <div className="flex-1 min-w-0">
                            <p className="font-semibold text-sm truncate">{file.name}</p>
                            <p className="text-xs text-foreground/50">{(file.size / 1024 / 1024).toFixed(2)} MB</p>
                            {isUploading && (
                                <div className="w-full h-1.5 bg-foreground/10 rounded-full mt-2 overflow-hidden">
                                    <div className="h-full bg-primary transition-all duration-300" style={{ width: `${uploadProgress}%` }} />
                                </div>
                            )}
                        </div>
                        {!isUploading && !streaming && (
                            <button
                                onClick={(e) => { e.stopPropagation(); setFile(null); setCompletedSummary(null); }}
                                className="text-xs text-red-400 hover:underline shrink-0"
                            >Remove</button>
                        )}
                    </div>
                )}
            </div>

            {/* Actions */}
            <div className="flex justify-end gap-3">
                <button
                    onClick={() => { setFile(null); setCompletedSummary(null); }}
                    disabled={!file || isUploading || streaming}
                    className="px-5 py-2 rounded-md border border-border bg-transparent text-foreground hover:bg-foreground/5 disabled:opacity-40 font-medium text-sm"
                >Cancel</button>
                <button
                    onClick={handleUpload}
                    disabled={!file || isUploading || streaming}
                    className="px-6 py-2 rounded-md bg-primary text-white font-medium hover:bg-primary/90 disabled:opacity-40 text-sm flex items-center gap-2"
                >
                    {isUploading
                        ? <><svg className="w-4 h-4 animate-spin" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" /></svg> Uploading {uploadProgress}%</>
                        : 'Upload & Stream Predictions'}
                </button>
            </div>

            {/* Live Streaming Panel */}
            {(streaming || liveRows.length > 0) && (
                <div className="space-y-4">
                    {/* Progress header */}
                    <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                            {streaming && (
                                <span className="relative flex h-2.5 w-2.5">
                                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-primary opacity-75" />
                                    <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-primary" />
                                </span>
                            )}
                            <h2 className="text-base font-semibold text-foreground">
                                {streaming ? 'Live Predictions' : 'Stream Complete'}
                            </h2>
                        </div>
                        {liveRows.length > 0 && (
                            <div className="flex items-center gap-3 text-xs">
                                <span className="text-red-400 font-semibold">{liveCounts.critical} Critical</span>
                                <span className="text-amber-400 font-semibold">{liveCounts.lowRisk} Low Risk</span>
                                <span className="text-emerald-400 font-semibold">{liveCounts.clear} Clear</span>
                            </div>
                        )}
                    </div>

                    {/* Progress bar */}
                    {progress && streaming && (
                        <div className="rounded-xl border border-primary/20 bg-primary/5 px-5 py-3 space-y-2">
                            <div className="flex items-center justify-between text-xs">
                                <span className="text-foreground/70 font-medium">{progress.processed.toLocaleString()} / {progress.total.toLocaleString()} rows</span>
                                <span className="text-foreground/50 font-mono">{progress.percent}%</span>
                            </div>
                            <div className="w-full h-2 bg-foreground/10 rounded-full overflow-hidden">
                                <div className="h-full bg-primary rounded-full transition-all duration-300" style={{ width: `${progress.percent}%` }} />
                            </div>
                        </div>
                    )}

                    {/* Stream error */}
                    {streamError && (
                        <div className="flex items-center gap-3 p-3 bg-red-500/10 border border-red-500/20 rounded-lg text-red-400 text-xs">
                            <svg className="w-4 h-4 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2m7-2a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                            Stream error: {streamError}
                        </div>
                    )}

                    {/* Live rows feed */}
                    {liveRows.length > 0 && (
                        <div className="border border-border rounded-xl overflow-hidden bg-card">
                            <div className="px-4 py-3 border-b border-border flex items-center justify-between">
                                <span className="text-xs font-semibold text-foreground/60 uppercase tracking-wide">Latest Predictions</span>
                                <span className="text-xs text-foreground/40">{liveRows.length} rows received</span>
                            </div>
                            <div className="p-3 space-y-2 max-h-[420px] overflow-y-auto">
                                {liveRows.map((row, i) => <LiveRowCard key={row.container_id + i} row={row} />)}
                            </div>
                        </div>
                    )}
                </div>
            )}

            {/* Completion summary */}
            {completedSummary && !streaming && (
                <div className="bg-emerald-500/5 border border-emerald-500/20 rounded-xl p-5 flex items-start gap-4">
                    <svg className="w-6 h-6 text-emerald-400 shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                    <div className="space-y-1 text-sm flex-1">
                        <p className="font-semibold text-foreground">Stream Complete</p>
                        <p className="text-foreground/70">
                            {completedSummary.processed.toLocaleString()} rows processed
                            {completedSummary.failed > 0 && <span className="text-red-400 ml-1">({completedSummary.failed} failed)</span>}
                            {' '}— Dashboard stats updated.
                        </p>
                        <div className="flex items-center gap-4 mt-2">
                            <div className="flex gap-3 text-xs font-semibold">
                                <span className="text-red-400">{liveCounts.critical} Critical</span>
                                <span className="text-amber-400">{liveCounts.lowRisk} Low Risk</span>
                                <span className="text-emerald-400">{liveCounts.clear} Clear</span>
                            </div>
                            <button
                                onClick={() => liveRows.length > 0
                                    ? exportLivePredictionsCSV(liveRows)
                                    : exportPredictionsCSV({ batch_id: lastBatchId ?? undefined })}
                                className="ml-auto flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-emerald-500/20 border border-emerald-500/30 text-emerald-400 hover:bg-emerald-500/30 text-xs font-semibold transition-colors"
                            >
                                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                                </svg>
                                Export CSV
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Info box */}
            <div className="bg-amber-500/5 border border-amber-500/20 rounded-lg p-4 flex gap-3 text-sm text-foreground/80">
                <svg className="w-5 h-5 text-amber-400 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                <p>Datasets must include columns: Container_ID, Origin_Country, Destination_Port, Declared_Value, Declared_Weight, and Measured_Weight.</p>
            </div>

            {/* Danger Zone */}
            <div className="border border-red-500/20 rounded-xl p-5 bg-red-500/5">
                <div className="flex items-center justify-between">
                    <div>
                        <h3 className="text-sm font-semibold text-red-400">Danger Zone</h3>
                        <p className="text-xs text-foreground/50 mt-0.5">Permanently delete all container records and job history from the database.</p>
                    </div>
                    <button
                        onClick={handleClearAll}
                        disabled={clearAllMutation.isPending || streaming}
                        className="flex items-center gap-2 px-4 py-2 rounded-lg bg-red-500/10 border border-red-500/30 text-red-400 hover:bg-red-500/20 disabled:opacity-40 disabled:cursor-not-allowed text-sm font-medium transition-colors"
                    >
                        {clearAllMutation.isPending
                            ? <><svg className="w-4 h-4 animate-spin" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" /></svg> Clearing...</>
                            : <><svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg> Clear All Data</>}
                    </button>
                </div>
            </div>

            {/* Job History */}
            <div>
                <h2 className="text-lg font-semibold text-foreground mb-4">Job History</h2>
                {jobs.isLoading ? <TableSkeleton rows={3} /> : jobs.error ? (
                    <p className="text-sm text-red-400">Failed to load job history.</p>
                ) : jobs.data && jobs.data.length > 0 ? (
                    <div className="bg-card border border-border rounded-xl overflow-hidden">
                        <table className="w-full text-sm">
                            <thead className="text-xs uppercase text-foreground/60 bg-foreground/5">
                                <tr>
                                    <th className="px-4 py-3 text-left font-medium">Job ID</th>
                                    <th className="px-4 py-3 text-left font-medium">Type</th>
                                    <th className="px-4 py-3 text-left font-medium">Status</th>
                                    <th className="px-4 py-3 text-left font-medium">Progress</th>
                                    <th className="px-4 py-3 text-left font-medium">Created</th>
                                    <th className="px-4 py-3 text-left font-medium">Actions</th>
                                </tr>
                            </thead>
                            <tbody>
                                {jobs.data.map((j: JobRecord) => (
                                    <tr key={j.job_id} className="border-t border-border hover:bg-foreground/[0.02]">
                                        <td className="px-4 py-3 font-mono text-xs">{j.job_id}</td>
                                        <td className="px-4 py-3 text-foreground/70">{j.type}</td>
                                        <td className="px-4 py-3"><JobStatusBadge status={j.status} /></td>
                                        <td className="px-4 py-3">
                                            <div className="flex items-center gap-2">
                                                <div className="w-16 h-1.5 bg-foreground/10 rounded-full overflow-hidden">
                                                    <div className="h-full bg-primary rounded-full" style={{ width: `${j.progress ?? 0}%` }} />
                                                </div>
                                                <span className="text-xs text-foreground/50">{j.progress ?? 0}%</span>
                                            </div>
                                        </td>
                                        <td className="px-4 py-3 text-foreground/60 text-xs">{new Date(j.created_at).toLocaleString()}</td>
                                        <td className="px-4 py-3">
                                            <button
                                                disabled={j.status === 'active' || deleteMutation.isPending}
                                                onClick={() => handleDelete(j.job_id)}
                                                className="p-1.5 rounded hover:bg-red-500/10 text-foreground/30 hover:text-red-400 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                                                title={j.status === 'active' ? 'Cannot delete an active job' : 'Remove job'}
                                            >
                                                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                                                </svg>
                                            </button>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                ) : (
                    <p className="text-sm text-foreground/50">No jobs yet.</p>
                )}
            </div>
        </div>
    );
}
