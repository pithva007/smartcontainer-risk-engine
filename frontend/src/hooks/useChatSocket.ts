import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { fetchChatMessages, sendChatMessage } from '@/api/routes';
import type { ChatMessage } from '@/types/chatTypes';

type TypingState = { conversation_id: string; user_id: string; name: string; role: string; stopped?: boolean };
const ACTIVE_POLL_MS = 5000;
const HIDDEN_POLL_MS = 20000;
const MAX_SEEN_PER_CONVERSATION = 300;

export function useChatSocket() {
  const conversationIdsRef = useRef<Set<string>>(new Set());
  const handlersRef = useRef<Set<(conversation_id: string, message: ChatMessage) => void>>(new Set());
  const seenByConversationRef = useRef<Map<string, string[]>>(new Map());
  const timerRef = useRef<number | null>(null);
  const errorStreakRef = useRef(0);

  const [connected, setConnected] = useState(true);
  const [typing] = useState<TypingState | null>(null);

  const emitToListeners = useCallback((conversationId: string, message: ChatMessage) => {
    handlersRef.current.forEach((handler) => handler(conversationId, message));
  }, []);

  const rememberSeen = useCallback((conversationId: string, messageId: string) => {
    const existing = seenByConversationRef.current.get(conversationId) || [];
    if (existing.includes(messageId)) return;
    const next = [...existing, messageId];
    if (next.length > MAX_SEEN_PER_CONVERSATION) next.splice(0, next.length - MAX_SEEN_PER_CONVERSATION);
    seenByConversationRef.current.set(conversationId, next);
  }, []);

  const pollMessages = useCallback(async () => {
    const conversationIds = Array.from(conversationIdsRef.current);
    if (!conversationIds.length) {
      setConnected(true);
      return;
    }

    await Promise.all(conversationIds.map(async (conversationId) => {
      try {
        const res = await fetchChatMessages(conversationId, { limit: 30 });
        const messages = res.data || [];
        const seen = new Set(seenByConversationRef.current.get(conversationId) || []);

        // First sync primes local cache without replaying historical messages.
        if (seen.size === 0) {
          messages.forEach((m) => rememberSeen(conversationId, m.message_id));
          return;
        }

        const newMessages = messages.filter((m) => !seen.has(m.message_id));
        newMessages.forEach((m) => {
          rememberSeen(conversationId, m.message_id);
          emitToListeners(conversationId, m);
        });
      } catch {
        // Ignore per-conversation failures and keep polling others.
        errorStreakRef.current += 1;
      }
    }));

    setConnected(true);
    errorStreakRef.current = 0;
  }, [emitToListeners, rememberSeen]);

  useEffect(() => {
    let cancelled = false;

    const run = async () => {
      if (cancelled) return;
      try {
        await pollMessages();
      } catch {
        if (!cancelled) setConnected(false);
      } finally {
        if (cancelled) return;
        const base = document.hidden ? HIDDEN_POLL_MS : ACTIVE_POLL_MS;
        const factor = Math.min(2 ** errorStreakRef.current, 8);
        const delay = base * factor;
        timerRef.current = window.setTimeout(run, delay);
      }
    };

    run();
    return () => {
      cancelled = true;
      if (timerRef.current !== null) {
        window.clearTimeout(timerRef.current);
        timerRef.current = null;
      }
    };
  }, [pollMessages]);

  const joinConversation = useCallback((conversation_id: string) => {
    conversationIdsRef.current.add(conversation_id);
  }, []);

  const sendMessageRealtime = useCallback((payload: { conversation_id: string; message_text?: string; attachment_url?: string; attachment_name?: string; attachment_mime?: string }) => {
    sendChatMessage(payload)
      .then((res: { success?: boolean; message?: ChatMessage }) => {
        if (!res?.success || !res.message) return;
        rememberSeen(payload.conversation_id, res.message.message_id);
        emitToListeners(payload.conversation_id, res.message);
      })
      .catch(() => {
        // Caller UI already handles server errors via fetch status/toasts.
      });
  }, [emitToListeners, rememberSeen]);

  const emitTyping = useCallback((_conversation_id: string) => {}, []);

  const emitStopTyping = useCallback((_conversation_id: string) => {}, []);

  const markSeen = useCallback((_conversation_id: string) => {}, []);

  const onNewMessage = useCallback((handler: (conversation_id: string, message: ChatMessage) => void) => {
    handlersRef.current.add(handler);
    return () => {
      handlersRef.current.delete(handler);
    };
  }, []);

  const api = useMemo(() => ({
    connected,
    typing,
    joinConversation,
    sendMessageRealtime,
    emitTyping,
    emitStopTyping,
    markSeen,
    onNewMessage,
  }), [connected, typing, joinConversation, sendMessageRealtime, emitTyping, emitStopTyping, markSeen, onNewMessage]);

  return api;
}

