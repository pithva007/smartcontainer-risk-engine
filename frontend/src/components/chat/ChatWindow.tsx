import { useEffect, useMemo, useRef } from 'react';
import type { ChatContainerInfo, ChatMessage, ConversationStatus } from '@/types/chatTypes';
import MessageBubble from './MessageBubble';
import MessageInput from './MessageInput';
import TypingIndicator from './TypingIndicator';
import ContainerInfoCard from './ContainerInfoCard';

export default function ChatWindow({
  containerInfo,
  messages,
  currentUserRole,
  currentUserId: _currentUserId,
  typingName,
  status,
  canUpdateStatus,
  onUpdateStatus,
  onSend,
  onUpload,
  onTyping,
  onStopTyping,
  onLoadOlder,
  hasMore,
  loadingOlder,
}: {
  containerInfo: ChatContainerInfo | null;
  messages: ChatMessage[];
  currentUserRole: string;
  currentUserId: string | null;
  typingName: string | null;
  status: ConversationStatus | null;
  canUpdateStatus: boolean;
  onUpdateStatus: (s: ConversationStatus) => void;
  onSend: (text: string) => void;
  onUpload: (file: File) => void;
  onTyping: () => void;
  onStopTyping: () => void;
  onLoadOlder: () => void;
  hasMore: boolean;
  loadingOlder: boolean;
}) {
  const scrollerRef = useRef<HTMLDivElement | null>(null);

  const roleLabel = useMemo(() => (currentUserRole === 'viewer' ? 'Exporter' : 'Admin'), [currentUserRole]);

  useEffect(() => {
    // Auto-scroll to bottom on new messages
    const el = scrollerRef.current;
    if (!el) return;
    el.scrollTop = el.scrollHeight;
  }, [messages.length]);

  // alignment of messages is handled inside MessageBubble based on sender_role

  return (
    <div className="flex-1 flex flex-col bg-card">
      <div className="border-b border-border bg-card">
        <div className="px-3 py-2 flex items-center justify-between">
          <div className="text-xs text-foreground/60">Chat • You: <span className="font-semibold text-foreground/80">{roleLabel}</span></div>
          <div className="flex items-center gap-2">
            {status && (
              <select
                disabled={!canUpdateStatus}
                value={status}
                onChange={(e) => onUpdateStatus(e.target.value as ConversationStatus)}
                className="text-[11px] bg-foreground/5 border border-border rounded-lg px-2 py-1 text-foreground/80 disabled:opacity-50"
              >
                <option value="Open">Open</option>
                <option value="Pending Documents">Pending Documents</option>
                <option value="Resolved">Resolved</option>
              </select>
            )}
          </div>
        </div>
      </div>

      <ContainerInfoCard info={containerInfo} />

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

      {typingName && <TypingIndicator name={typingName} />}

      <MessageInput
        onSend={onSend}
        onUpload={onUpload}
        onTyping={onTyping}
        onStopTyping={onStopTyping}
      />
    </div>
  );
}

