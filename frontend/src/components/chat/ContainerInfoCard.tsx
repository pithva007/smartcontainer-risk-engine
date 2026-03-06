import { cn, riskBgClass } from '@/lib/utils';
import type { ChatContainerInfo } from '@/types/chatTypes';

export default function ContainerInfoCard({ info }: { info: ChatContainerInfo | null }) {
  if (!info) return null;
  const isCritical = info.risk_level === 'Critical';

  return (
    <div className="p-3 border-b border-border bg-card">
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <span className="text-xs font-mono font-semibold text-foreground">{info.container_id}</span>
            {info.risk_level && (
              <span className={cn('px-2 py-0.5 rounded-full text-[10px] font-semibold', riskBgClass[info.risk_level])}>
                {info.risk_level}
              </span>
            )}
            {isCritical && (
              <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-risk-critical/20 text-risk-critical border border-risk-critical/30">
                Critical Warning
              </span>
            )}
          </div>
          <div className="mt-1 text-[11px] text-foreground/55 grid grid-cols-2 gap-x-6 gap-y-1">
            <div><span className="text-foreground/40">Risk Score:</span> <span className="font-mono">{typeof info.risk_score === 'number' ? info.risk_score.toFixed(2) : '—'}</span></div>
            <div><span className="text-foreground/40">Origin:</span> {info.origin_country || '—'}</div>
            <div><span className="text-foreground/40">Destination Port:</span> {info.destination_port || '—'}</div>
            <div><span className="text-foreground/40">Destination:</span> {info.destination_country || '—'}</div>
          </div>
        </div>
      </div>
    </div>
  );
}

