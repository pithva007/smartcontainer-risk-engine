/**
 * Socket.IO singleton
 *
 * In development Vite proxies `/api` but not `/socket.io`, so we connect
 * directly to the backend URL.  In production both frontend and backend
 * are served from the same origin, so we use `window.location.origin`.
 */
import { io, type Socket } from 'socket.io-client';

// VITE_BACKEND_URL should be set to the backend base URL (no /api suffix).
// Example: http://localhost:3000
const BACKEND_URL: string =
    (import.meta.env.VITE_BACKEND_URL as string | undefined) ||
    (import.meta.env.DEV ? 'http://localhost:3000' : window.location.origin);

let _socket: Socket | null = null;

export function getSocket(): Socket {
    if (!_socket) {
        _socket = io(BACKEND_URL, {
            path: '/socket.io',
            transports: ['websocket', 'polling'],
            autoConnect: false,
            reconnection: true,
            reconnectionAttempts: 15,
            reconnectionDelay: 2000,
            reconnectionDelayMax: 10000,
        });
    }
    return _socket;
}
