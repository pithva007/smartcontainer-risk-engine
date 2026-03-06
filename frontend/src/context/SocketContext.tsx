import React, { createContext, useContext, useEffect, useState } from 'react';
import type { Socket } from 'socket.io-client';
import { getSocket } from '@/lib/socket';

interface SocketContextType {
    socket: Socket;
    connected: boolean;
}

const SocketContext = createContext<SocketContextType | null>(null);

export function SocketProvider({ children }: { children: React.ReactNode }) {
    const socket = getSocket();
    const [connected, setConnected] = useState(socket.connected);

    useEffect(() => {
        // Connect on mount
        if (!socket.connected) socket.connect();

        const onConnect = () => setConnected(true);
        const onDisconnect = () => setConnected(false);
        const onConnectError = (err: Error) =>
            console.warn('[Socket] Connection error:', err.message);

        socket.on('connect', onConnect);
        socket.on('disconnect', onDisconnect);
        socket.on('connect_error', onConnectError);

        return () => {
            socket.off('connect', onConnect);
            socket.off('disconnect', onDisconnect);
            socket.off('connect_error', onConnectError);
            // Do NOT disconnect — socket is a singleton meant to live for the whole session
        };
    }, [socket]);

    return (
        <SocketContext.Provider value={{ socket, connected }}>
            {children}
        </SocketContext.Provider>
    );
}

export function useSocket() {
    const ctx = useContext(SocketContext);
    if (!ctx) throw new Error('useSocket must be called inside <SocketProvider>');
    return ctx;
}
