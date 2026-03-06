import { useEffect, useRef } from 'react';
import type { ChatMessage } from '@/types/chatTypes';
import MessageBubble from './MessageBubble';

export default function ChatMessages({
  messages,
  onLoadOlder,
  hasMore,
  loadingOlder,
}: {
  messages: ChatMessage[];
  onLoadOlder: () => void;
  hasMore: boolean;
  loadingOlder: boolean;
}) {
  const scrollerRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const el = scrollerRef.current;
    if (!el) return;
    el.scrollTop = el.scrollHeight;
  }, [messages.length]);

  return (
    <div className="flex-1 overflow-y-auto" ref={scrollerRef}>
      <div className="p-3">
        {hasMore && (
          <div className="flex justify-center mb-2">
            <button
              type="button"
              className="text-[11px] px-3 py-1 rounded-full border border-border hover:bg-foreground/5 disabled:opacity-50"
              disabled={loadingOlder}
              onClick={onLoadOlder}
            >
              {loadingOlder ? 'Loading…' : 'Load older messages'}
            </button>
          </div>
        )}
        {messages.map((m) => (
          <MessageBubble key={m.message_id} msg={m} />
        ))}
      </div>
    </div>
  );
}

