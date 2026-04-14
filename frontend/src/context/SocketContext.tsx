import React, { createContext, useContext, useEffect, useState } from 'react';

interface SocketContextType {
    connected: boolean;
}

const SocketContext = createContext<SocketContextType | null>(null);

export function SocketProvider({ children }: { children: React.ReactNode }) {
    const [connected, setConnected] = useState(true);

    useEffect(() => {
        const onOnline = () => setConnected(true);
        const onOffline = () => setConnected(false);

        window.addEventListener('online', onOnline);
        window.addEventListener('offline', onOffline);
        setConnected(navigator.onLine);

        return () => {
            window.removeEventListener('online', onOnline);
            window.removeEventListener('offline', onOffline);
        };
    }, []);

    return (
        <SocketContext.Provider value={{ connected }}>
            {children}
        </SocketContext.Provider>
    );
}

export function useSocket() {
    const ctx = useContext(SocketContext);
    if (!ctx) throw new Error('useSocket must be called inside <SocketProvider>');
    return ctx;
}
