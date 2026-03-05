import type { TrackingEvent } from '@/types/apiTypes';
import { Anchor, Ship, AlertTriangle, MapPin, Clock } from 'lucide-react';

const iconMap: Record<string, typeof Ship> = {
    departure: Ship,
    arrival: MapPin,
    delay: AlertTriangle,
    stop: Anchor,
};

interface Props {
    events: TrackingEvent[];
}

export default function TrackingTimeline({ events }: Props) {
    return (
        <div className="space-y-0">
            {events.map((ev, i) => {
                const Icon = iconMap[ev.type] || Clock;
                const isLast = i === events.length - 1;
                return (
                    <div key={i} className="flex gap-4">
                        {/* Timeline line + dot */}
                        <div className="flex flex-col items-center">
                            <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center text-primary shrink-0">
                                <Icon className="w-4 h-4" />
                            </div>
                            {!isLast && <div className="w-px flex-1 bg-border min-h-[24px]" />}
                        </div>
                        {/* Content */}
                        <div className="pb-6">
                            <p className="text-sm font-medium text-foreground">{ev.description}</p>
                            <p className="text-xs text-foreground/50 mt-0.5">{new Date(ev.timestamp).toLocaleString()}</p>
                        </div>
                    </div>
                );
            })}
        </div>
    );
}
