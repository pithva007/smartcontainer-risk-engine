import { useState, useRef } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { uploadDataset, listJobs, getJob } from '@/api/routes';
import { UploadCloud, File, AlertCircle, CheckCircle2, Loader2, Clock, XCircle } from 'lucide-react';
import { cn } from '@/lib/utils';
import toast from 'react-hot-toast';
import type { UploadJobResponse, JobRecord, JobStatus } from '@/types/apiTypes';
import { TableSkeleton } from '@/components/ui/Skeleton';

const statusColors: Record<JobStatus, string> = {
    waiting: 'text-amber-400 bg-amber-400/10 border-amber-400/20',
    active: 'text-blue-400 bg-blue-400/10 border-blue-400/20',
    completed: 'text-emerald-400 bg-emerald-400/10 border-emerald-400/20',
    failed: 'text-red-400 bg-red-400/10 border-red-400/20',
    delayed: 'text-orange-400 bg-orange-400/10 border-orange-400/20',
};

const statusIcon: Record<JobStatus, React.ReactNode> = {
    waiting: <Clock className="w-4 h-4" />,
    active: <Loader2 className="w-4 h-4 animate-spin" />,
    completed: <CheckCircle2 className="w-4 h-4" />,
    failed: <XCircle className="w-4 h-4" />,
    delayed: <Clock className="w-4 h-4" />,
};

function JobStatusBadge({ status }: { status: JobStatus }) {
    return (
        <span className={cn('inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-xs font-medium border', statusColors[status])}>
            {statusIcon[status]}
            {status.charAt(0).toUpperCase() + status.slice(1)}
        </span>
    );
}

function ActiveJobPoller({ jobId, onDone }: { jobId: string; onDone: (job: JobRecord) => void }) {
    const { data } = useQuery({
        queryKey: ['job', jobId],
        queryFn: () => getJob(jobId),
        refetchInterval: (query) => {
            const s = query.state.data?.status;
            return s === 'completed' || s === 'failed' ? false : 2000;
        },
    });

    if (data && (data.status === 'completed' || data.status === 'failed')) {
        onDone(data);
    }

    return (
        <div className="bg-card border border-border rounded-xl p-5 space-y-3">
            <div className="flex items-center justify-between">
                <div>
                    <p className="text-sm font-semibold text-foreground">Processing Job</p>
                    <p className="text-xs text-foreground/50 font-mono mt-0.5">{jobId}</p>
                </div>
                <JobStatusBadge status={data?.status ?? 'waiting'} />
            </div>
            {data && (
                <div className="space-y-1">
                    <div className="flex justify-between text-xs text-foreground/60">
                        <span>Progress</span>
                        <span>{data.progress ?? 0}%</span>
                    </div>
                    <div className="w-full h-2 bg-foreground/10 rounded-full overflow-hidden">
                        <div
                            className="h-full bg-primary transition-all duration-500 rounded-full"
                            style={{ width: `${data.progress ?? 0}%` }}
                        />
                    </div>
                </div>
            )}
        </div>
    );
}

export default function Upload() {
    const [isDragging, setIsDragging] = useState(false);
    const [file, setFile] = useState<File | null>(null);
    const [uploadProgress, setUploadProgress] = useState(0);
    const [activeJobId, setActiveJobId] = useState<string | null>(null);
    const [completedJob, setCompletedJob] = useState<JobRecord | null>(null);
    const fileRef = useRef<HTMLInputElement>(null);
    const qc = useQueryClient();

    const jobs = useQuery({ queryKey: ['jobs'], queryFn: listJobs });

    const mutation = useMutation<UploadJobResponse, Error, File>({
        mutationFn: (f: File) => {
            const fd = new FormData();
            fd.append('dataset', f);
            return uploadDataset(fd, setUploadProgress);
        },
        onSuccess: (data) => {
            setActiveJobId(data.job_id);
            toast.success('File received — processing in background');
            qc.invalidateQueries({ queryKey: ['jobs'] });
        },
        onError: () => {
            toast.error('Upload failed. Please try again.');
        },
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
        setCompletedJob(null);
        setActiveJobId(null);
        mutation.mutate(file);
    };

    const handleJobDone = (job: JobRecord) => {
        setActiveJobId(null);
        setCompletedJob(job);
        if (job.status === 'completed') {
            toast.success('Processing complete!');
        } else {
            toast.error('Processing failed. Check job logs.');
        }
        qc.invalidateQueries({ queryKey: ['jobs'] });
    };

    return (
        <div className="space-y-8 pb-8 max-w-4xl mx-auto">
            <div>
                <h1 className="text-2xl font-bold text-foreground">Upload Dataset</h1>
                <p className="text-sm text-foreground/60 mt-1">Upload shipment data in CSV or XLSX format for analysis.</p>
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
                            <UploadCloud className="w-8 h-8" />
                        </div>
                        <p className="font-medium text-lg text-foreground">Click to upload or drag and drop</p>
                        <p className="text-sm text-foreground/50 mt-1">Only CSV and XLSX files are supported</p>
                    </>
                ) : (
                    <div className="flex items-center gap-4 w-full">
                        <div className="w-12 h-12 bg-primary/10 rounded-lg flex items-center justify-center text-primary shrink-0">
                            <File className="w-6 h-6" />
                        </div>
                        <div className="flex-1 min-w-0">
                            <p className="font-semibold text-sm truncate">{file.name}</p>
                            <p className="text-xs text-foreground/50">{(file.size / 1024 / 1024).toFixed(2)} MB</p>
                            {mutation.isPending && (
                                <div className="w-full h-1.5 bg-foreground/10 rounded-full mt-2 overflow-hidden">
                                    <div className="h-full bg-primary transition-all duration-300" style={{ width: `${uploadProgress}%` }} />
                                </div>
                            )}
                        </div>
                        {!mutation.isPending && !activeJobId && (
                            <button
                                onClick={(e) => { e.stopPropagation(); setFile(null); setCompletedJob(null); }}
                                className="text-xs text-risk-critical hover:underline"
                            >Remove</button>
                        )}
                    </div>
                )}
            </div>

            {/* Actions */}
            <div className="flex justify-end gap-3">
                <button
                    onClick={() => { setFile(null); setCompletedJob(null); setActiveJobId(null); }}
                    disabled={!file || mutation.isPending || !!activeJobId}
                    className="px-5 py-2 rounded-md border border-border bg-transparent text-foreground hover:bg-foreground/5 disabled:opacity-40 font-medium text-sm"
                >Cancel</button>
                <button
                    onClick={handleUpload}
                    disabled={!file || mutation.isPending || !!activeJobId}
                    className="px-6 py-2 rounded-md bg-primary text-white font-medium hover:bg-primary/90 disabled:opacity-40 text-sm flex items-center gap-2"
                >
                    {mutation.isPending
                        ? <><Loader2 className="w-4 h-4 animate-spin" /> Uploading {uploadProgress}%</>
                        : 'Upload Dataset'}
                </button>
            </div>

            {/* Job polling indicator */}
            {activeJobId && (
                <ActiveJobPoller jobId={activeJobId} onDone={handleJobDone} />
            )}

            {/* Completed job result */}
            {completedJob && (
                <div className={cn(
                    'border rounded-xl p-5 flex items-start gap-4',
                    completedJob.status === 'completed'
                        ? 'bg-emerald-500/5 border-emerald-500/20'
                        : 'bg-red-500/5 border-red-500/20'
                )}>
                    {completedJob.status === 'completed'
                        ? <CheckCircle2 className="w-6 h-6 text-emerald-400 shrink-0 mt-0.5" />
                        : <XCircle className="w-6 h-6 text-red-400 shrink-0 mt-0.5" />
                    }
                    <div className="space-y-1 text-sm">
                        <p className="font-semibold text-foreground">
                            {completedJob.status === 'completed' ? 'Processing Complete' : 'Processing Failed'}
                        </p>
                        <p className="text-foreground/70">Job ID: <span className="font-mono">{completedJob.job_id}</span></p>
                        {completedJob.result?.total_records !== undefined && (
                            <p className="text-foreground/70">
                                Records: {completedJob.result.processed_records?.toLocaleString()} / {completedJob.result.total_records?.toLocaleString()} processed
                            </p>
                        )}
                    </div>
                </div>
            )}

            {/* Info */}
            <div className="bg-risk-low/10 border border-risk-low/20 rounded-lg p-4 flex gap-3 text-sm text-foreground/80">
                <AlertCircle className="w-5 h-5 text-risk-low shrink-0" />
                <p>Datasets must include columns for Container_ID, Origin_Country, Destination_Port, Declared_Value, Declared_Weight, and Measured_Weight.</p>
            </div>

            {/* Job History */}
            <div>
                <h2 className="text-lg font-semibold text-foreground mb-4">Job History</h2>
                {jobs.isLoading ? <TableSkeleton rows={3} /> : jobs.error ? (
                    <p className="text-sm text-risk-critical">Failed to load job history.</p>
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
                                </tr>
                            </thead>
                            <tbody>
                                {jobs.data.map((j) => (
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
                                        <td className="px-4 py-3 text-foreground/60 text-xs">
                                            {new Date(j.created_at).toLocaleString()}
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
