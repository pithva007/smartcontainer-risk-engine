import type { SummaryData } from '@/types/apiTypes';
import { Box, AlertTriangle, Search, ShieldCheck, Activity } from 'lucide-react';
import { cn } from '@/lib/utils';

interface Props {
    data: SummaryData;
}

const cards = [
    { key: 'total_containers' as const, label: 'Total Containers', icon: Box, color: 'text-primary', bg: 'bg-primary/10' },
    { key: 'critical_containers' as const, label: 'Critical', icon: AlertTriangle, color: 'text-risk-critical', bg: 'bg-risk-critical/10' },
    { key: 'low_risk_containers' as const, label: 'Low Risk', icon: Search, color: 'text-risk-low', bg: 'bg-risk-low/10' },
    { key: 'clear_containers' as const, label: 'Clear', icon: ShieldCheck, color: 'text-risk-clear', bg: 'bg-risk-clear/10' },
    { key: 'total_anomalies' as const, label: 'Total Anomalies', icon: Activity, color: 'text-purple-500', bg: 'bg-purple-500/10' },
];

export default function SummaryCards({ data }: Props) {
    return (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
            {cards.map((c) => (
                <div
                    key={c.key}
                    className="bg-card border border-border rounded-xl p-5 shadow-sm hover:shadow-md transition-shadow"
                >
                    <div className="flex items-center justify-between mb-4">
                        <h3 className="text-sm font-medium text-foreground/60">{c.label}</h3>
                        <div className={cn('p-2 rounded-lg', c.bg)}>
                            <c.icon className={cn('w-4 h-4', c.color)} />
                        </div>
                    </div>
                    <p className="text-2xl font-bold text-foreground">{data[c.key].toLocaleString()}</p>
                </div>
            ))}
        </div>
    );
}
