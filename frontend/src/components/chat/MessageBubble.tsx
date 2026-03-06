import { cn } from '@/lib/utils';
import type { ChatMessage } from '@/types/chatTypes';

const roleLabel = (role: string) => {
  if (role === 'viewer') return 'Exporter';
  if (role === 'system') return 'System';
  return 'Admin';
};

export default function MessageBubble({ msg }: { msg: ChatMessage }) {
  const isSystem = msg.sender_role === 'system';
  const ts = new Date(msg.timestamp).toLocaleString();

  if (isSystem) {
    return (
      <div className="px-3 py-2">
        <div className="text-[11px] px-3 py-2 rounded-lg bg-amber-500/15 border border-amber-500/25 text-amber-200">
          {msg.message_text}
          <div className="mt-1 text-[10px] text-amber-200/60">{ts}</div>
        </div>
      </div>
    );
  }

  const isExporter = msg.sender_role === 'viewer';
  const bubbleClass = isExporter
    ? 'bg-blue-500/20 text-blue-100 border-blue-500/25'
    : 'bg-foreground/10 text-foreground border-border';

  return (
    <div className={'px-3 py-2 flex ' + (isExporter ? 'justify-start' : 'justify-end')}>
      <div className={cn('max-w-[78%] rounded-xl border px-3 py-2', bubbleClass)}>
        <div className="flex items-baseline justify-between gap-3">
          <div className="text-[11px] font-semibold text-foreground/90">
            {msg.sender_name || roleLabel(msg.sender_role)}{' '}
            <span className="font-normal text-foreground/50">({roleLabel(msg.sender_role)})</span>
          </div>
          <div className="text-[10px] text-foreground/45 whitespace-nowrap">{ts}</div>
        </div>
        {msg.message_text && <div className="mt-1 text-sm leading-relaxed whitespace-pre-wrap">{msg.message_text}</div>}
        {msg.attachment_url && (
          <a
            href={msg.attachment_url}
            target="_blank"
            rel="noreferrer"
            className="mt-2 block text-xs underline text-foreground/80 hover:text-primary"
          >
            📎 {msg.attachment_name || 'Attachment'}
          </a>
        )}
      </div>
    </div>
  );
}

