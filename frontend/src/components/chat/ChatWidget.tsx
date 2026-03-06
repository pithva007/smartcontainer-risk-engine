import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { MessageSquare, X } from 'lucide-react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '@/context/AuthContext';
import { fetchChatConversations, fetchChatMessages, startChatConversation, updateChatStatus, uploadChatAttachment } from '@/api/routes';
import type { ChatContainerInfo, ConversationListItem, ConversationStatus, ChatMessage } from '@/types/chatTypes';
import { useChatSocket } from '@/hooks/useChatSocket';
import ConversationList from './ConversationList';
import ChatWindow from './ChatWindow';
import { OPEN_CHAT_EVENT } from './chatEvents';

const playNotification = () => {
  try {
    const w = window as unknown as { AudioContext?: typeof AudioContext; webkitAudioContext?: typeof AudioContext };
    const AudioCtx = w.AudioContext || w.webkitAudioContext;
    if (!AudioCtx) return;
    const ctx = new AudioCtx();
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.connect(g);
    g.connect(ctx.destination);
    o.type = 'sine';
    o.frequency.value = 880;
    g.gain.setValueAtTime(0.001, ctx.currentTime);
    g.gain.exponentialRampToValueAtTime(0.08, ctx.currentTime + 0.01);
    g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.18);
    o.start();
    o.stop(ctx.currentTime + 0.2);
  } catch {
    // ignore audio failures
  }
};

export default function ChatWidget() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const socket = useChatSocket();

  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState<ConversationStatus | undefined>('Open');
  const [selected, setSelected] = useState<ConversationListItem | null>(null);
  const [containerInfo, setContainerInfo] = useState<ChatContainerInfo | null>(null);

  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [cursorBefore, setCursorBefore] = useState<string | null>(null);
  const [hasMore, setHasMore] = useState(false);
  const [loadingOlder, setLoadingOlder] = useState(false);

  const conversations = useQuery({
    queryKey: ['chat-conversations', search, filter],
    queryFn: () => fetchChatConversations({ q: search || undefined, status: filter, limit: 20, page: 1 }),
    enabled: !!user,
    refetchInterval: open ? 15000 : 30000,
  });

  const unreadTotal = useMemo(() => {
    const list = conversations.data?.data || [];
    return list.reduce((acc, c) => acc + (c.unread_count || 0), 0);
  }, [conversations.data]);

  const typingName = useMemo(() => {
    if (!socket.typing || !selected) return null;
    if (socket.typing.conversation_id !== selected.conversation_id) return null;
    return socket.typing.name;
  }, [socket.typing, selected]);

  const markSelectedSeen = useCallback(() => {
    if (!selected) return;
    socket.markSeen(selected.conversation_id);
    queryClient.invalidateQueries({ queryKey: ['chat-conversations'] });
  }, [selected, socket, queryClient]);

  const loadMessages = async (conversation_id: string) => {
    const res = await fetchChatMessages(conversation_id, { limit: 30 });
    setMessages(res.data || []);
    setCursorBefore(res.next_before);
    setHasMore(!!res.next_before);
    markSelectedSeen();
  };

  const onSelectConversation = async (c: ConversationListItem) => {
    setSelected(c);
    setOpen(true);
    socket.joinConversation(c.conversation_id);
    await loadMessages(c.conversation_id);
  };

  const openForContainer = async (container_id: string, exporter_id: string = '') => {
    setOpen(true);
    // exporter_id may be empty when we don't know it yet
    const started = await startChatConversation(container_id, exporter_id);
    const convoId = started.conversation.conversation_id;
    const info = started.conversation.container;
    setContainerInfo(info);
    // refresh list and select
    await queryClient.invalidateQueries({ queryKey: ['chat-conversations'] });
    const listRes = await fetchChatConversations({ q: container_id, limit: 20, page: 1 });
    const item = (listRes.data || []).find((x) => x.conversation_id === convoId) || (listRes.data || [])[0] || null;
    if (item) await onSelectConversation(item);
  };

  useEffect(() => {
    const handler = (e: Event) => {
      const detail = (e as CustomEvent<{ containerId?: string; exporterId?: string }>).detail;
      if (detail?.containerId) openForContainer(detail.containerId, detail.exporterId || '');
      else setOpen(true);
    };
    window.addEventListener(OPEN_CHAT_EVENT, handler as EventListener);
    return () => window.removeEventListener(OPEN_CHAT_EVENT, handler as EventListener);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Keep container info in sync when selecting from list (best-effort via container id)
  useEffect(() => {
    if (!selected) return;
    // we rely on start endpoint to provide rich info when opened from a container,
    // but if selected from list and we don't have it, we can leave it minimal.
    setContainerInfo((prev) => prev && prev.container_id === selected.container_id ? prev : { container_id: selected.container_id, risk_level: selected.risk_level });
  }, [selected]);

  // Real-time incoming messages
  const unsubRef = useRef<null | (() => void)>(null);
  useEffect(() => {
    unsubRef.current?.();
    unsubRef.current = socket.onNewMessage((conversation_id, message) => {
      if (selected?.conversation_id === conversation_id) {
        setMessages((prev) => [...prev, message]);
        markSelectedSeen();
      } else {
        queryClient.invalidateQueries({ queryKey: ['chat-conversations'] });
        playNotification();
      }
    });
    return () => unsubRef.current?.();
  }, [socket, selected, queryClient, markSelectedSeen]);

  const onSend = async (text: string) => {
    if (!selected) return;
    socket.sendMessageRealtime({ conversation_id: selected.conversation_id, message_text: text });
  };

  const onUpload = async (file: File) => {
    if (!selected) return;
    const up = await uploadChatAttachment(file);
    if (!up.success) return;
    socket.sendMessageRealtime({
      conversation_id: selected.conversation_id,
      attachment_url: up.file.url,
      attachment_name: up.file.name,
      attachment_mime: up.file.mime,
      message_text: '',
    });
  };

  const onLoadOlder = async () => {
    if (!selected || !cursorBefore) return;
    setLoadingOlder(true);
    try {
      const res = await fetchChatMessages(selected.conversation_id, { limit: 30, before: cursorBefore });
      setMessages((prev) => [...(res.data || []), ...prev]);
      setCursorBefore(res.next_before);
      setHasMore(!!res.next_before);
    } finally {
      setLoadingOlder(false);
    }
  };

  const canUpdateStatus = user?.role === 'admin' || user?.role === 'officer';
  const onUpdateStatus = async (s: ConversationStatus) => {
    if (!selected) return;
    await updateChatStatus(selected.conversation_id, s);
    await queryClient.invalidateQueries({ queryKey: ['chat-conversations'] });
    setSelected((prev) => (prev ? { ...prev, status: s } : prev));
  };

  const typingFns = useMemo(() => ({
    onTyping: () => selected && socket.emitTyping(selected.conversation_id),
    onStopTyping: () => selected && socket.emitStopTyping(selected.conversation_id),
  }), [selected, socket]);

  return (
    <>
      {/* Floating button */}
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="fixed bottom-6 right-6 z-[60] w-12 h-12 rounded-full bg-primary/20 border border-primary/30 hover:bg-primary/25 shadow-lg flex items-center justify-center"
        title="Chat"
      >
        <MessageSquare className="w-5 h-5 text-primary" />
        {open ? null : unreadTotal > 0 && (
          <span className="absolute -top-1 -right-1 min-w-[18px] h-[18px] px-1 rounded-full bg-primary text-primary-foreground text-[10px] font-bold flex items-center justify-center">
            {unreadTotal > 99 ? '99+' : unreadTotal}
          </span>
        )}
      </button>

      {/* Panel */}
      {open && (
        <div className="fixed bottom-20 right-6 z-[60] w-[980px] max-w-[calc(100vw-2rem)] h-[620px] max-h-[calc(100vh-6rem)] bg-card border border-border rounded-xl shadow-2xl overflow-hidden">
          <div className="h-11 border-b border-border px-3 flex items-center justify-between bg-card">
            <div className="text-sm font-semibold text-foreground">Container Chat</div>
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="p-2 rounded-lg hover:bg-foreground/5"
              title="Close"
            >
              <X className="w-4 h-4 text-foreground/70" />
            </button>
          </div>

          <div className="h-[calc(100%-44px)] flex">
            <ConversationList
              items={conversations.data?.data || []}
              activeConversationId={selected?.conversation_id || null}
              onSelect={onSelectConversation}
              onSearchChange={(q) => setSearch(q)}
              onFilterChange={(s) => setFilter(s)}
              filter={filter}
              search={search}
            />

            {selected ? (
              <ChatWindow
                containerInfo={containerInfo}
                messages={messages}
                currentUserRole={user?.role || 'viewer'}
                currentUserId={user?._id || null}
                typingName={typingName}
                status={selected.status}
                canUpdateStatus={canUpdateStatus}
                onUpdateStatus={onUpdateStatus}
                onSend={onSend}
                onUpload={onUpload}
                onTyping={typingFns.onTyping}
                onStopTyping={typingFns.onStopTyping}
                onLoadOlder={onLoadOlder}
                hasMore={hasMore}
                loadingOlder={loadingOlder}
              />
            ) : (
              <div className="flex-1 flex items-center justify-center text-sm text-foreground/50">
                Select a conversation to start chatting.
              </div>
            )}
          </div>
        </div>
      )}
    </>
  );
}

