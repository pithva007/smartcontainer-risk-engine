/**
 * TimelinePanel — vertical shipment event timeline.
 * Fetches from /api/container-timeline/:id and displays events with icons.
 */
import { useQuery } from '@tanstack/react-query';
import { fetchContainerTimeline } from '@/api/routes';
import { X, ChevronDown, ChevronUp, Loader2, AlertTriangle } from 'lucide-react';
import { useState } from 'react';
import { cn } from '@/lib/utils';

interface Props {
    containerId: string;
    onClose: () => void;
}

function fmtDate(iso: string | null) {
    if (!iso) return null;
    const d = new Date(iso);
    return d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
}

const statusStyle: Record<string, string> = {
    completed: 'border-emerald-500 bg-emerald-500',
    active: 'border-primary bg-primary animate-pulse',
    pending: 'border-foreground/20 bg-foreground/10',
};
const connectorStyle: Record<string, string> = {
    completed: 'bg-emerald-500/40',
    active: 'bg-primary/30',
    pending: 'bg-foreground/10',
};

export default function TimelinePanel({ containerId, onClose }: Props) {
    const [expanded, setExpanded] = useState(true);

    const { data, isLoading, error } = useQuery({
        queryKey: ['timeline', containerId],
        queryFn: () => fetchContainerTimeline(containerId),
        enabled: !!containerId,
        staleTime: 60_000,
    });

    const events: any[] = data?.events ?? [];

    return (
        <div className={cn(
            'absolute bottom-4 left-4 w-[300px] z-[1001]',
            'bg-card/95 backdrop-blur-md border border-border rounded-2xl shadow-2xl',
            'flex flex-col overflow-hidden animate-in slide-in-from-bottom duration-300',
            expanded ? 'max-h-[70vh]' : 'max-h-[52px]'
        )}>
            {/* Header */}
            <div
                className="flex items-center justify-between px-4 py-3 bg-foreground/[0.03] border-b border-border cursor-pointer select-none shrink-0"
                onClick={() => setExpanded(e => !e)}
            >
                <div className="flex items-center gap-2">
                    <span className="text-base">🚢</span>
                    <div>
                        <p className="text-xs font-bold text-foreground">Shipment Timeline</p>
                        {data && (
                            <div className="flex flex-col">
                                <p className="text-[10px] text-foreground/40">
                                    {data.origin} → {data.destination}
                                </p>
                                {data.dwell_time_hours != null && (
                                    <p className="text-[10px] font-semibold text-amber-500 mt-0.5">
                                        ⏱ Dwell Time: {data.dwell_time_hours.toFixed(1)}h
                                    </p>
                                )}
                            </div>
                        )}
                    </div>
                </div>
                <div className="flex items-center gap-1">
                    {expanded ? <ChevronDown className="w-3.5 h-3.5 text-foreground/40" /> : <ChevronUp className="w-3.5 h-3.5 text-foreground/40" />}
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
                <div className="overflow-y-auto flex-1 px-4 py-3">
                    {isLoading && (
                        <div className="flex items-center justify-center py-8 gap-2 text-foreground/40">
                            <Loader2 className="w-4 h-4 animate-spin" />
                            <span className="text-xs">Loading timeline…</span>
                        </div>
                    )}

                    {error && (
                        <div className="flex items-center gap-2 p-3 rounded-lg bg-red-500/10 border border-red-500/20 text-red-400 text-xs">
                            <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
                            No timeline data available
                        </div>
                    )}

                    {events.length > 0 && (
                        <div className="relative">
                            {events.map((event, i) => {
                                const isLast = i === events.length - 1;
                                const st = event.status as string;
                                return (
                                    <div key={event.id} className="flex gap-3 relative">
                                        {/* Dot + connector line */}
                                        <div className="flex flex-col items-center">
                                            <div className={cn(
                                                'w-8 h-8 rounded-full border-2 flex items-center justify-center text-sm shrink-0 z-10 bg-card',
                                                statusStyle[st] ?? statusStyle.pending
                                            )}>
                                                {event.icon}
                                            </div>
                                            {!isLast && (
                                                <div className={cn('w-0.5 flex-1 my-1 min-h-[16px]', connectorStyle[st] ?? connectorStyle.pending)} />
                                            )}
                                        </div>

                                        {/* Content */}
                                        <div className={cn('pb-4 flex-1 min-w-0', isLast && 'pb-1')}>
                                            <div className="flex items-center justify-between gap-1 mb-0.5">
                                                <p className={cn(
                                                    'text-xs font-semibold',
                                                    st === 'active' ? 'text-primary' : st === 'completed' ? 'text-foreground' : 'text-foreground/40'
                                                )}>
                                                    {event.label}
                                                </p>
                                                {event.date && (
                                                    <span className="text-[10px] text-foreground/35 shrink-0">{fmtDate(event.date)}</span>
                                                )}
                                                {!event.date && st === 'active' && (
                                                    <span className="px-1.5 py-0.5 rounded-full bg-primary/15 text-primary text-[9px] font-bold border border-primary/20">LIVE</span>
                                                )}
                                            </div>
                                            {event.location && (
                                                <p className="text-[10px] text-foreground/50 font-medium">{event.location}</p>
                                            )}
                                            <p className="text-[10px] text-foreground/40 leading-relaxed mt-0.5">{event.detail}</p>
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    )}
                </div>
            )}
        </div>
    );
}
