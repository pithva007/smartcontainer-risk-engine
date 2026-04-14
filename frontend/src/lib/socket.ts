/**
 * Realtime polling config helper
 *
 * Socket transport was removed for Vercel compatibility. Keep this helper
 * to centralize polling interval defaults used by real-time-like hooks.
 */

export const realtimePollingConfig = {
    activeMs: 2500,
    idleMs: 8000,
    hiddenMs: 15000,
};
