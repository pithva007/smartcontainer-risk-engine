import { cn } from '@/lib/utils';
import type { RiskLevel } from '@/types/apiTypes';

export default function ChatHeader({
  exporterId,
  containerId,
  riskLevel,
  onClose,
}: {
  exporterId: string;
  containerId: string;
  riskLevel: RiskLevel;
  onClose: () => void;
}) {
  const riskClass =
    riskLevel === 'Critical'
      ? 'bg-red-500/15 text-red-300 border-red-500/25'
      : riskLevel === 'Low Risk'
        ? 'bg-amber-500/15 text-amber-200 border-amber-500/25'
        : 'bg-emerald-500/15 text-emerald-200 border-emerald-500/25';

  return (
    <div className="p-4 border-b border-border bg-card flex items-start justify-between gap-4">
      <div className="min-w-0">
        <div className="text-sm font-semibold text-foreground truncate">Chat with Exporter: {exporterId}</div>
        <div className="mt-1 text-xs text-foreground/55 flex flex-wrap items-center gap-x-4 gap-y-1">
          <span>Container: <span className="font-mono font-semibold text-foreground/80">{containerId}</span></span>
          <span className={cn('px-2 py-0.5 rounded-full text-[10px] font-semibold border', riskClass)}>
            Risk Level: {riskLevel}
          </span>
        </div>
      </div>
      <button
        type="button"
        onClick={onClose}
        className="px-3 py-1.5 rounded-lg bg-foreground/10 hover:bg-foreground/15 text-foreground/80 text-sm"
      >
        Close
      </button>
    </div>
  );
}

