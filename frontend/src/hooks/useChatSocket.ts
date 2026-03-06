import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { io, type Socket } from 'socket.io-client';
import type { ChatMessage } from '@/types/chatTypes';

type TypingState = { conversation_id: string; user_id: string; name: string; role: string; stopped?: boolean };

const getSocketBaseUrl = () => {
  // Vite dev proxy can forward `/socket.io` if configured.
  return import.meta.env.VITE_SOCKET_URL || window.location.origin;
};

export function useChatSocket() {
  const socketRef = useRef<Socket | null>(null);
  const [connected, setConnected] = useState(false);
  const [typing, setTyping] = useState<TypingState | null>(null);

  const connect = useCallback(() => {
    const token = localStorage.getItem('sce_token');
    if (!token) return null;

    if (socketRef.current) return socketRef.current;
    const s = io(getSocketBaseUrl(), {
      transports: ['websocket', 'polling'],
      auth: { token },
      reconnection: true,
      reconnectionAttempts: 8,
      reconnectionDelay: 500,
      reconnectionDelayMax: 4000,
      timeout: 10000,
    });

    s.on('connect', () => setConnected(true));
    s.on('disconnect', () => setConnected(false));
    s.on('user_typing', (payload: TypingState) => {
      if (payload?.stopped) {
        setTyping((prev) => (prev?.conversation_id === payload.conversation_id ? null : prev));
        return;
      }
      setTyping(payload);
    });

    socketRef.current = s;
    return s;
  }, []);

  const disconnect = useCallback(() => {
    if (!socketRef.current) return;
    socketRef.current.removeAllListeners();
    socketRef.current.disconnect();
    socketRef.current = null;
    setConnected(false);
    setTyping(null);
  }, []);

  useEffect(() => {
    const token = localStorage.getItem('sce_token');
    if (token) connect();
    return () => disconnect();
  }, [connect, disconnect]);

  const joinConversation = useCallback((conversation_id: string) => {
    const s = connect();
    s?.emit('join_conversation', { conversation_id });
  }, [connect]);

  const sendMessageRealtime = useCallback((payload: { conversation_id: string; message_text?: string; attachment_url?: string; attachment_name?: string; attachment_mime?: string }) => {
    const s = connect();
    s?.emit('send_message', payload);
  }, [connect]);

  const emitTyping = useCallback((conversation_id: string) => {
    const s = connect();
    s?.emit('typing', { conversation_id });
  }, [connect]);

  const emitStopTyping = useCallback((conversation_id: string) => {
    const s = connect();
    s?.emit('stop_typing', { conversation_id });
  }, [connect]);

  const markSeen = useCallback((conversation_id: string) => {
    const s = connect();
    s?.emit('message_seen', { conversation_id });
  }, [connect]);

  const onNewMessage = useCallback((handler: (conversation_id: string, message: ChatMessage) => void) => {
    const s = connect();
    const fn = (payload: { conversation_id: string; message: ChatMessage }) => handler(payload.conversation_id, payload.message);
    s?.on('new_message', fn);
    return () => s?.off('new_message', fn);
  }, [connect]);

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

