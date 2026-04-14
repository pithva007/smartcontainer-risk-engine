import { useEffect, useState, useCallback, useRef } from 'react';
import { getJobLiveUpdates, listJobs } from '@/api/routes';
import type { PredictionRow, PredictionProgress, PredictionDone } from '@/types/apiTypes';

const MAX_ROWS = 150;
const ACTIVE_POLL_MS = 2500;
const IDLE_POLL_MS = 8000;
const HIDDEN_POLL_MS = 15000;

export interface LivePredictionsState {
    rows: PredictionRow[];
    progress: PredictionProgress | null;
    done: PredictionDone | null;
    error: string | null;
    connected: boolean;
    liveCounts: { critical: number; lowRisk: number; clear: number };
    isStreaming: boolean;
    clearRows: () => void;
}

/**
 * Poll live prediction updates using a serverless-safe HTTP endpoint.
 *
 * @param filterJobId  When provided, only rows matching this job_id are collected.
 *                     Pass undefined on the Dashboard to auto-track the latest active job.
 */
export function useLivePredictions(filterJobId?: string): LivePredictionsState {
    const [rows, setRows] = useState<PredictionRow[]>([]);
    const [progress, setProgress] = useState<PredictionProgress | null>(null);
    const [done, setDone] = useState<PredictionDone | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [connected, setConnected] = useState(true);
    const [liveCounts, setLiveCounts] = useState({ critical: 0, lowRisk: 0, clear: 0 });
    const [isStreaming, setIsStreaming] = useState(false);
    const isStreamingRef = useRef(false);
    const cursorRef = useRef<string | null>(null);
    const activeJobIdRef = useRef<string | null>(filterJobId || null);
    const seenRef = useRef<Set<string>>(new Set());
    const timerRef = useRef<number | null>(null);

    const appendRows = useCallback((incoming: PredictionRow[]) => {
        if (!incoming.length) return;

        const unique: PredictionRow[] = [];
        for (const row of incoming) {
            const key = `${row.job_id}:${row.container_id}:${row.processed_at}`;
            if (seenRef.current.has(key)) continue;
            seenRef.current.add(key);
            unique.push(row);
        }
        if (!unique.length) return;

        setLiveCounts((prev) => {
            const next = { ...prev };
            unique.forEach((row) => {
                if (row.risk_level === 'Critical') next.critical += 1;
                else if (row.risk_level === 'Low Risk') next.lowRisk += 1;
                else next.clear += 1;
            });
            return next;
        });

        setRows((prev) => {
            const newestFirst = [...unique].reverse();
            const merged = [...newestFirst, ...prev];
            return merged.length > MAX_ROWS ? merged.slice(0, MAX_ROWS) : merged;
        });
    }, []);

    const clearRows = useCallback(() => {
        setRows([]);
        setProgress(null);
        setDone(null);
        setError(null);
        setConnected(true);
        setLiveCounts({ critical: 0, lowRisk: 0, clear: 0 });
        seenRef.current.clear();
        cursorRef.current = null;
        isStreamingRef.current = false;
        setIsStreaming(false);
    }, []);

    useEffect(() => {
        activeJobIdRef.current = filterJobId || null;
        cursorRef.current = null;
        setProgress(null);
        setDone(null);
        setError(null);
        setConnected(true);
        if (filterJobId) {
            setRows([]);
            setLiveCounts({ critical: 0, lowRisk: 0, clear: 0 });
            seenRef.current.clear();
        }
    }, [filterJobId]);

    useEffect(() => {
        let cancelled = false;

        const getPollDelay = () => {
            if (document.hidden) return HIDDEN_POLL_MS;
            return isStreamingRef.current ? ACTIVE_POLL_MS : IDLE_POLL_MS;
        };

        const schedule = (delay: number) => {
            if (cancelled) return;
            timerRef.current = window.setTimeout(run, delay);
        };

        const run = async () => {
            if (cancelled) return;

            try {
                let jobId = filterJobId || activeJobIdRef.current;
                if (!jobId) {
                    const jobs = await listJobs({ status: 'active', limit: 1, page: 1 });
                    jobId = jobs[0]?.job_id || null;
                    activeJobIdRef.current = jobId;
                }

                if (!jobId) {
                    setConnected(true);
                    isStreamingRef.current = false;
                    setIsStreaming(false);
                    schedule(getPollDelay());
                    return;
                }

                const data = await getJobLiveUpdates(jobId, {
                    since: cursorRef.current || undefined,
                    limit: 200,
                });

                if (cancelled) return;

                setConnected(true);
                setError(data.error || null);
                setProgress(data.progress || null);
                appendRows(data.rows || []);
                if (data.next_since) cursorRef.current = data.next_since;

                const running = data.status === 'active' || data.status === 'waiting';
                isStreamingRef.current = running;
                setIsStreaming(running);

                if (data.done) setDone(data.done);

                if (!running && !filterJobId) {
                    activeJobIdRef.current = null;
                    cursorRef.current = null;
                }
            } catch (err) {
                if (cancelled) return;
                setConnected(false);
                setError((err as Error).message || 'Live polling failed');
                isStreamingRef.current = false;
                setIsStreaming(false);
            } finally {
                schedule(getPollDelay());
            }
        };

        const onVisible = () => {
            if (timerRef.current !== null) {
                window.clearTimeout(timerRef.current);
                timerRef.current = null;
            }
            run();
        };

        run();
        document.addEventListener('visibilitychange', onVisible);

        return () => {
            cancelled = true;
            document.removeEventListener('visibilitychange', onVisible);
            if (timerRef.current !== null) {
                window.clearTimeout(timerRef.current);
                timerRef.current = null;
            }
        };
    }, [appendRows, filterJobId]);

    return { rows, progress, done, error, connected, liveCounts, isStreaming, clearRows };
}
