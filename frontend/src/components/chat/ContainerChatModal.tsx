import { useEffect, useMemo, useRef, useState } from 'react';
import { useAuth } from '@/context/AuthContext';
import type { RiskLevel } from '@/types/apiTypes';
import type { ChatMessage } from '@/types/chatTypes';
import { fetchChatMessages, startChatConversation, uploadChatAttachment } from '@/api/routes';
import { useChatSocket } from '@/hooks/useChatSocket';
import ChatHeader from './ChatHeader';
import ChatMessages from './ChatMessages';
import MessageInput from './MessageInput';
import TypingIndicator from './TypingIndicator';

export default function ContainerChatModal({
  open,
  containerId,
  exporterId,
  riskLevel,
  onClose,
}: {
  open: boolean;
  containerId: string;
  exporterId: string;
  riskLevel: RiskLevel;
  onClose: () => void;
}) {
  const { user } = useAuth();
  const socket = useChatSocket();

  const [conversationId, setConversationId] = useState<string | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [cursorBefore, setCursorBefore] = useState<string | null>(null);
  const [hasMore, setHasMore] = useState(false);
  const [loadingOlder, setLoadingOlder] = useState(false);
  const [typingName, setTypingName] = useState<string | null>(null);

  const unsubRef = useRef<null | (() => void)>(null);

  const canRender = open && !!containerId && !!exporterId;

  const joinAndSubscribe = async (convId: string) => {
    socket.joinConversation(convId);
    unsubRef.current?.();
    unsubRef.current = socket.onNewMessage((cid, message) => {
      if (cid !== convId) return;
      setMessages((prev) => [...prev, message]);
    });
  };

  useEffect(() => {
    if (!canRender) return;

    const run = async () => {
      // Start/ensure conversation: uniquely keyed by container_id + exporter_id
      const started = await startChatConversation(containerId, exporterId);
      const convId = started.conversation.conversation_id;
      setConversationId(convId);
      await joinAndSubscribe(convId);

      const res = await fetchChatMessages(convId, { limit: 30 });
      setMessages(res.data || []);
      setCursorBefore(res.next_before);
      setHasMore(!!res.next_before);
    };

    run().catch((err) => console.error('Chat init failed', err));

    return () => {
      unsubRef.current?.();
      unsubRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [canRender, containerId, exporterId]);

  useEffect(() => {
    if (!socket.typing || !conversationId) return;
    if (socket.typing.conversation_id !== conversationId) return;
    setTypingName(socket.typing.name);
  }, [socket.typing, conversationId]);

  const onSend = (text: string) => {
    if (!conversationId) return;
    socket.sendMessageRealtime({ conversation_id: conversationId, message_text: text });
  };

  const onUpload = async (file: File) => {
    if (!conversationId) return;
    const up = await uploadChatAttachment(file);
    if (!up.success) return;
    socket.sendMessageRealtime({
      conversation_id: conversationId,
      attachment_url: up.file.url,
      attachment_name: up.file.name,
      attachment_mime: up.file.mime,
      message_text: '',
    });
  };

  const onLoadOlder = async () => {
    if (!conversationId || !cursorBefore) return;
    setLoadingOlder(true);
    try {
      const res = await fetchChatMessages(conversationId, { limit: 30, before: cursorBefore });
      setMessages((prev) => [...(res.data || []), ...prev]);
      setCursorBefore(res.next_before);
      setHasMore(!!res.next_before);
    } finally {
      setLoadingOlder(false);
    }
  };

  const typingFns = useMemo(() => ({
    onTyping: () => conversationId && socket.emitTyping(conversationId),
    onStopTyping: () => conversationId && socket.emitStopTyping(conversationId),
  }), [conversationId, socket]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[70]">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-background/70 backdrop-blur-sm" onClick={onClose} />

      {/* Right-side sliding panel */}
      <div className="absolute right-0 top-0 h-full w-[520px] max-w-[calc(100vw-2rem)] bg-card border-l border-border shadow-2xl flex flex-col">
        <ChatHeader exporterId={exporterId} containerId={containerId} riskLevel={riskLevel} onClose={onClose} />

        <ChatMessages
          messages={messages}
          hasMore={hasMore}
          loadingOlder={loadingOlder}
          onLoadOlder={onLoadOlder}
        />

        {typingName && <TypingIndicator name={typingName} />}

        <MessageInput
          disabled={!user}
          onSend={onSend}
          onUpload={onUpload}
          onTyping={typingFns.onTyping}
          onStopTyping={typingFns.onStopTyping}
        />
      </div>
    </div>
  );
}

