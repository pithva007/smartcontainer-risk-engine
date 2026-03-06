import { cn, riskBgClass } from '@/lib/utils';
import type { ConversationListItem } from '@/types/chatTypes';

export default function ConversationItem({
  item,
  active,
  onClick,
}: {
  item: ConversationListItem;
  active?: boolean;
  onClick: () => void;
}) {
  const lastTs = item.last_message?.timestamp ? new Date(item.last_message.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '';
  const statusClass =
    item.status === 'Resolved'
      ? 'bg-emerald-500/10 text-emerald-300 border-emerald-500/20'
      : item.status === 'Pending Documents'
        ? 'bg-amber-500/10 text-amber-200 border-amber-500/20'
        : 'bg-blue-500/10 text-blue-200 border-blue-500/20';

  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'w-full text-left p-3 rounded-lg border border-border hover:bg-foreground/5 transition-colors',
        active && 'bg-foreground/5 border-primary/40'
      )}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <span className="text-xs font-mono font-semibold text-foreground truncate">{item.container_id}</span>
            {item.risk_level && (
              <span className={cn('px-2 py-0.5 rounded-full text-[10px] font-semibold', riskBgClass[item.risk_level])}>
                {item.risk_level === 'Low Risk' ? 'Low' : item.risk_level}
              </span>
            )}
          </div>
          <div className="mt-1 text-[11px] text-foreground/55 truncate">
            {item.last_message?.preview || 'No messages yet'}
          </div>
        </div>
        <div className="shrink-0 text-right">
          <div className="text-[10px] text-foreground/45">{lastTs}</div>
          {item.unread_count > 0 && (
            <div className="mt-1 inline-flex items-center justify-center min-w-[18px] h-[18px] px-1 rounded-full text-[10px] font-bold bg-primary text-primary-foreground">
              {item.unread_count > 99 ? '99+' : item.unread_count}
            </div>
          )}
        </div>
      </div>
      <div className="mt-2 flex items-center justify-between">
        <span className={cn('px-2 py-0.5 rounded-full text-[10px] font-semibold border', statusClass)}>{item.status}</span>
      </div>
    </button>
  );
}

