import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { fetchQueue } from '@/api/routes';
import { X, Search, Filter, Loader2, ArrowRight } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { RiskLevel } from '@/types/apiTypes';

interface ShipmentListModalProps {
    filter: { label: string; risk_level?: RiskLevel; anomaly?: boolean };
    onClose: () => void;
    onSelectShipment: (id: string) => void;
}

export default function ShipmentListModal({ filter, onClose, onSelectShipment }: ShipmentListModalProps) {
    const [search, setSearch] = useState('');

    // We reuse the /api/queue endpoint which supports risk_level and anomaly filters
    const { data, isLoading } = useQuery({
        queryKey: ['queue', filter.risk_level, filter.anomaly],
        queryFn: () => fetchQueue(), // The actual fetchQueue in routes.ts doesn't take params yet, I should fix that or filter client side for now.
        // Wait, looking at routes.ts, fetchQueue doesn't take params. I'll filter client-side for simplicity since the prototype usually has limited data.
    });

    // Client-side filtering for the prototype
    const shipments = (data || []).filter(s => {
        const matchesRisk = !filter.risk_level || s.risk_level === filter.risk_level;
        const matchesAnomaly = filter.anomaly === undefined || s.anomaly_flag === filter.anomaly;
        const matchesSearch = s.container_id.toLowerCase().includes(search.toLowerCase()) ||
            s.origin_country.toLowerCase().includes(search.toLowerCase());
        return matchesRisk && matchesAnomaly && matchesSearch;
    });

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-background/80 backdrop-blur-sm">
            <div className="bg-card border border-border w-full max-w-2xl max-h-[80vh] rounded-2xl shadow-2xl flex flex-col overflow-hidden animate-in fade-in slide-in-from-bottom-4 duration-200">
                {/* Header */}
                <div className="p-5 border-b border-border flex items-center justify-between">
                    <div>
                        <h2 className="text-lg font-bold text-foreground">{filter.label}</h2>
                        <p className="text-xs text-foreground/40">{shipments.length} shipments found</p>
                    </div>
                    <button
                        onClick={onClose}
                        className="p-1.5 rounded-lg hover:bg-foreground/5 text-foreground/40 hover:text-foreground transition-colors"
                    >
                        <X className="w-5 h-5" />
                    </button>
                </div>

                {/* Toolbar */}
                <div className="p-4 bg-foreground/5 border-b border-border flex gap-3">
                    <div className="relative flex-1">
                        <Search className="absolute left-3 top-2.5 w-4 h-4 text-foreground/30" />
                        <input
                            type="text"
                            placeholder="Search by ID or Origin..."
                            value={search}
                            onChange={e => setSearch(e.target.value)}
                            className="w-full pl-9 pr-4 py-2 bg-background border border-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary/40"
                        />
                    </div>
                    <button className="px-3 py-2 border border-border rounded-lg text-foreground/60 hover:text-foreground hover:bg-background transition-colors flex items-center gap-2 text-sm">
                        <Filter className="w-4 h-4" /> Filter
                    </button>
                </div>

                {/* List */}
                <div className="flex-1 overflow-y-auto p-4 space-y-2">
                    {isLoading ? (
                        <div className="flex flex-col items-center justify-center py-12 gap-3 text-foreground/40">
                            <Loader2 className="w-8 h-8 animate-spin" />
                            <p className="text-sm">Loading shipments...</p>
                        </div>
                    ) : shipments.length > 0 ? (
                        shipments.map((s) => (
                            <div
                                key={s.container_id}
                                onClick={() => onSelectShipment(s.container_id)}
                                className="group flex items-center justify-between p-4 bg-foreground/5 hover:bg-foreground/10 border border-border/50 rounded-xl cursor-not-allowed hover:cursor-pointer transition-all duration-200"
                            >
                                <div className="flex items-center gap-4">
                                    <div className={cn(
                                        "w-2 h-10 rounded-full",
                                        s.risk_level === 'Critical' ? 'bg-red-500' : s.risk_level === 'Low Risk' ? 'bg-amber-500' : 'bg-emerald-500'
                                    )} />
                                    <div>
                                        <h4 className="text-sm font-bold text-foreground font-mono">{s.container_id}</h4>
                                        <p className="text-xs text-foreground/40">{s.origin_country} → {s.destination_country || 'Target'}</p>
                                    </div>
                                </div>
                                <div className="flex items-center gap-6">
                                    <div className="text-right">
                                        <div className="text-sm font-bold text-foreground">{(s.risk_score * 100).toFixed(0)}</div>
                                        <div className="text-[10px] uppercase font-semibold text-foreground/40">Score</div>
                                    </div>
                                    <div className="p-2 rounded-full bg-foreground/5 group-hover:bg-primary/20 group-hover:text-primary transition-colors">
                                        <ArrowRight className="w-4 h-4" />
                                    </div>
                                </div>
                            </div>
                        ))
                    ) : (
                        <div className="text-center py-12 text-foreground/30">
                            <p className="text-sm italic">No shipments match your current filters.</p>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}
