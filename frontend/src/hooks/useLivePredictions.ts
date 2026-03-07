import { useEffect, useState, useCallback, useRef } from 'react';
import { useSocket } from '@/context/SocketContext';
import type { PredictionRow, PredictionProgress, PredictionDone } from '@/types/apiTypes';

const MAX_ROWS = 150;

export interface LivePredictionsState {
    rows: PredictionRow[];
    progress: PredictionProgress | null;
    done: PredictionDone | null;
    error: string | null;
    liveCounts: { critical: number; lowRisk: number; clear: number };
    isStreaming: boolean;
    clearRows: () => void;
}

/**
 * Subscribe to real-time prediction events from the Socket.IO server.
 *
 * @param filterJobId  When provided, only rows matching this job_id are collected.
 *                     Pass undefined on the Dashboard to receive events from ALL jobs.
 */
export function useLivePredictions(filterJobId?: string): LivePredictionsState {
    const { socket } = useSocket();
    const [rows, setRows] = useState<PredictionRow[]>([]);
    const [progress, setProgress] = useState<PredictionProgress | null>(null);
    const [done, setDone] = useState<PredictionDone | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [liveCounts, setLiveCounts] = useState({ critical: 0, lowRisk: 0, clear: 0 });
    // Track whether any job is actively streaming
    const streamingRef = useRef(false);
    const [isStreaming, setIsStreaming] = useState(false);

    const clearRows = useCallback(() => {
        setRows([]);
        setProgress(null);
        setDone(null);
        setError(null);
        setLiveCounts({ critical: 0, lowRisk: 0, clear: 0 });
        streamingRef.current = false;
        setIsStreaming(false);
    }, []);

    useEffect(() => {
        const onRow = (row: PredictionRow) => {
            if (filterJobId && row.job_id !== filterJobId) return;

            if (!streamingRef.current) {
                streamingRef.current = true;
                setIsStreaming(true);
            }

            setLiveCounts((prev) => {
                const next = { ...prev };
                if (row.risk_level === 'Critical') next.critical++;
                else if (row.risk_level === 'Low Risk') next.lowRisk++;
                else next.clear++;
                return next;
            });

            setRows((prev) => {
                const next = [row, ...prev];
                return next.length > MAX_ROWS ? next.slice(0, MAX_ROWS) : next;
            });
        };

        const onProgress = (p: PredictionProgress) => {
            if (filterJobId && p.job_id !== filterJobId) return;
            setProgress(p);
        };

        const onDone = (d: PredictionDone) => {
            if (filterJobId && d.job_id !== filterJobId) return;
            setDone(d);
            setProgress(null);
            streamingRef.current = false;
            setIsStreaming(false);
        };

        const onError = (e: { job_id: string; message: string }) => {
            if (filterJobId && e.job_id !== filterJobId) return;
            setError(e.message);
            streamingRef.current = false;
            setIsStreaming(false);
        };

        socket.on('prediction:row', onRow);
        socket.on('prediction:progress', onProgress);
        socket.on('prediction:done', onDone);
        socket.on('prediction:error', onError);

        return () => {
            socket.off('prediction:row', onRow);
            socket.off('prediction:progress', onProgress);
            socket.off('prediction:done', onDone);
            socket.off('prediction:error', onError);
        };
    }, [socket, filterJobId]);

    return { rows, progress, done, error, liveCounts, isStreaming, clearRows };
}
