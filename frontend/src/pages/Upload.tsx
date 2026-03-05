import { useState, useRef } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { uploadDataset, fetchBatches } from '@/api/routes';
import { UploadCloud, File, AlertCircle, CheckCircle2, Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import toast from 'react-hot-toast';
import type { UploadResponse } from '@/types/apiTypes';
import { TableSkeleton } from '@/components/ui/Skeleton';

export default function Upload() {
    const [isDragging, setIsDragging] = useState(false);
    const [file, setFile] = useState<File | null>(null);
    const [progress, setProgress] = useState(0);
    const [result, setResult] = useState<UploadResponse | null>(null);
    const fileRef = useRef<HTMLInputElement>(null);
    const qc = useQueryClient();

    const batches = useQuery({ queryKey: ['batches'], queryFn: fetchBatches });

    const mutation = useMutation({
        mutationFn: (f: File) => {
            const fd = new FormData();
            fd.append('dataset', f);
            return uploadDataset(fd, setProgress);
        },
        onSuccess: (data) => {
            setResult(data);
            toast.success('Dataset uploaded successfully!');
            qc.invalidateQueries({ queryKey: ['batches'] });
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
        setProgress(0);
        setResult(null);
        mutation.mutate(file);
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
                                    <div className="h-full bg-primary transition-all duration-300" style={{ width: `${progress}%` }} />
                                </div>
                            )}
                        </div>
                        {!mutation.isPending && (
                            <button onClick={(e) => { e.stopPropagation(); setFile(null); setResult(null); }} className="text-xs text-risk-critical hover:underline">Remove</button>
                        )}
                    </div>
                )}
            </div>

            {/* Actions */}
            <div className="flex justify-end gap-3">
                <button
                    onClick={() => { setFile(null); setResult(null); }}
                    disabled={!file || mutation.isPending}
                    className="px-5 py-2 rounded-md border border-border bg-transparent text-foreground hover:bg-foreground/5 disabled:opacity-40 font-medium text-sm"
                >Cancel</button>
                <button
                    onClick={handleUpload}
                    disabled={!file || mutation.isPending}
                    className="px-6 py-2 rounded-md bg-primary text-white font-medium hover:bg-primary/90 disabled:opacity-40 text-sm flex items-center gap-2"
                >
                    {mutation.isPending ? <><Loader2 className="w-4 h-4 animate-spin" /> Uploading {progress}%</> : 'Upload Dataset'}
                </button>
            </div>

            {/* Upload Result */}
            {result && (
                <div className="bg-risk-clear/10 border border-risk-clear/20 rounded-xl p-5 flex items-start gap-4">
                    <CheckCircle2 className="w-6 h-6 text-risk-clear shrink-0 mt-0.5" />
                    <div className="space-y-1 text-sm">
                        <p className="font-semibold text-foreground">Upload Complete</p>
                        <p className="text-foreground/70">Batch ID: <span className="font-mono">{result.batch_id}</span></p>
                        <p className="text-foreground/70">Total Records: {result.total_records.toLocaleString()}</p>
                        <p className="text-foreground/70">Processed: {result.processed.toLocaleString()}</p>
                    </div>
                </div>
            )}

            {/* Info */}
            <div className="bg-risk-low/10 border border-risk-low/20 rounded-lg p-4 flex gap-3 text-sm text-foreground/80">
                <AlertCircle className="w-5 h-5 text-risk-low shrink-0" />
                <p>Datasets must include columns for Container_ID, Origin_Country, Destination_Port, Declared_Value, Declared_Weight, and Measured_Weight.</p>
            </div>

            {/* Upload History */}
            <div>
                <h2 className="text-lg font-semibold text-foreground mb-4">Upload History</h2>
                {batches.isLoading ? <TableSkeleton rows={3} /> : batches.error ? (
                    <p className="text-sm text-risk-critical">Failed to load batch history.</p>
                ) : batches.data && batches.data.length > 0 ? (
                    <div className="bg-card border border-border rounded-xl overflow-hidden">
                        <table className="w-full text-sm">
                            <thead className="text-xs uppercase text-foreground/60 bg-foreground/5">
                                <tr>
                                    <th className="px-4 py-3 text-left font-medium">Batch ID</th>
                                    <th className="px-4 py-3 text-left font-medium">Total Records</th>
                                    <th className="px-4 py-3 text-left font-medium">Created At</th>
                                </tr>
                            </thead>
                            <tbody>
                                {batches.data.map((b) => (
                                    <tr key={b.batch_id} className="border-t border-border hover:bg-foreground/[0.02]">
                                        <td className="px-4 py-3 font-mono">{b.batch_id}</td>
                                        <td className="px-4 py-3">{b.total_records.toLocaleString()}</td>
                                        <td className="px-4 py-3 text-foreground/60">{new Date(b.created_at).toLocaleString()}</td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                ) : (
                    <p className="text-sm text-foreground/50">No uploads yet.</p>
                )}
            </div>
        </div>
    );
}
