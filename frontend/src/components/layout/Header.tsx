import { useState, useEffect, useRef } from 'react';
import { Bell, Sun, Moon, Check } from 'lucide-react';
import { useNotification } from '@/context/NotificationContext';
import ProfileDropdown from './ProfileDropdown';

// Helper: human-readable relative time
function relTime(ts: string) {
    const diff = Date.now() - new Date(ts).getTime();
    const m = Math.floor(diff / 60000);
    if (m < 1) return 'just now';
    if (m < 60) return `${m}m ago`;
    const h = Math.floor(m / 60);
    if (h < 24) return `${h}h ago`;
    return `${Math.floor(h / 24)}d ago`;
}

// Action label + color
function ActionBadge({ action }: { action: string }) {
    const map: Record<string, { label: string; cls: string }> = {
        ADD_NOTE: { label: 'Note', cls: 'bg-blue-500/15 text-blue-400 border-blue-500/20' },
        UPDATE_STATUS: { label: 'Status', cls: 'bg-amber-500/15 text-amber-400 border-amber-500/20' },
        ASSIGN_CONTAINER: { label: 'Assign', cls: 'bg-primary/15 text-primary border-primary/20' },
    };
    const { label, cls } = map[action] ?? { label: action, cls: 'bg-foreground/10 text-foreground/50 border-border' };
    return (
        <span className={`px-1.5 py-0.5 rounded-full text-[9px] font-bold border ${cls}`}>{label}</span>
    );
}

export default function Header() {
    const [dark, setDark] = useState(true);
    const {
        hasNotification,
        isPopupOpen,
        notifications,
        unreadCount,
        clearNotification,
        togglePopup,
        closePopup,
        dismissNotification,
        clearAllNotifications,
    } = useNotification();
    const popupRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        const handleClickOutside = (e: MouseEvent) => {
            if (popupRef.current && !popupRef.current.contains(e.target as Node)) {
                closePopup();
            }
        };
        if (isPopupOpen) document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, [isPopupOpen, closePopup]);

    useEffect(() => {
        document.documentElement.classList.toggle('dark', dark);
        localStorage.setItem('theme', dark ? 'dark' : 'light');
    }, [dark]);

    useEffect(() => {
        const saved = localStorage.getItem('theme');
        setDark(saved !== 'light');
    }, []);

    return (
        <header className="h-16 bg-card border-b border-border flex items-center justify-between px-6 sticky top-0 z-40">
            <div className="flex-1" />
            <div className="flex items-center gap-4">
                {/* Theme toggle */}
                <button
                    onClick={() => setDark(!dark)}
                    className="p-2 rounded-full text-foreground/60 hover:bg-foreground/5 hover:text-foreground transition-colors"
                    aria-label="Toggle theme"
                >
                    {dark ? <Sun className="w-5 h-5" /> : <Moon className="w-5 h-5" />}
                </button>

                {/* Notification bell */}
                <div className="relative" ref={popupRef}>
                    <button
                        onClick={() => { if (hasNotification) clearNotification(); togglePopup(); }}
                        className="relative p-2 rounded-full text-foreground/60 hover:bg-foreground/5 hover:text-foreground transition-colors"
                        aria-label="Notifications"
                    >
                        <Bell className="w-5 h-5" />
                        {hasNotification && (
                            <span className="absolute top-1.5 right-1.5 h-2 w-2 rounded-full bg-red-500 ring-2 ring-card animate-pulse" />
                        )}
                    </button>

                    {isPopupOpen && (
                        <div className="absolute right-0 mt-2 w-[340px] bg-card border border-border rounded-xl shadow-xl z-50 overflow-hidden animate-in fade-in slide-in-from-top-2 flex flex-col max-h-[480px]">
                            {/* Header row */}
                            <div className="px-4 py-3 border-b border-border bg-foreground/[0.03] flex items-center justify-between shrink-0">
                                <div className="flex items-center gap-2">
                                    <Bell className="w-4 h-4 text-foreground/50" />
                                    <span className="font-semibold text-sm text-foreground">Activity Feed</span>
                                    {unreadCount > 0 && (
                                        <span className="px-1.5 py-0.5 rounded-full bg-red-500/15 text-red-400 text-[10px] font-bold border border-red-500/20">
                                            {unreadCount} new
                                        </span>
                                    )}
                                </div>
                                {notifications.length > 0 && (
                                    <button
                                        onClick={clearAllNotifications}
                                        className="text-[10px] font-medium text-foreground/40 hover:text-foreground/70 border border-border hover:border-foreground/20 rounded-md px-2 py-1 transition-all"
                                    >
                                        Clear all
                                    </button>
                                )}
                            </div>

                            {/* Feed list */}
                            <div className="overflow-y-auto flex-1">
                                {notifications.length > 0 ? (
                                    <div className="divide-y divide-border/40">
                                        {notifications.map((notif: any) => (
                                            <div
                                                key={notif._id}
                                                className="flex gap-3 px-4 py-3 hover:bg-foreground/[0.03] transition-colors group relative"
                                            >
                                                {/* Avatar */}
                                                <div className="mt-0.5 w-8 h-8 rounded-full bg-primary/10 border border-primary/20 flex items-center justify-center shrink-0 text-sm">
                                                    {notif.action === 'ADD_NOTE' ? '📝' : notif.action === 'UPDATE_STATUS' ? '🔄' : '👤'}
                                                </div>

                                                {/* Content */}
                                                <div className="flex-1 min-w-0">
                                                    <div className="flex items-center gap-1.5 mb-0.5 flex-wrap">
                                                        <span className="text-xs font-bold text-foreground font-mono">{notif.entity_id}</span>
                                                        <ActionBadge action={notif.action} />
                                                        <span className="ml-auto text-[10px] text-foreground/35 shrink-0">{relTime(notif.timestamp)}</span>
                                                    </div>
                                                    <p className="text-[11px] text-foreground/60 leading-relaxed">
                                                        <span className="font-semibold text-primary">{notif.username}</span>{' '}
                                                        {notif.action === 'ADD_NOTE'
                                                            ? `added a note: "${notif.metadata?.note || notif.metadata?.notes || '…'}"`
                                                            : notif.action === 'ASSIGN_CONTAINER'
                                                                ? `assigned to ${notif.metadata?.assigned_to || 'Current User'}`
                                                                : `updated status to ${notif.metadata?.inspection_status || 'unknown'}`
                                                        }
                                                    </p>
                                                </div>

                                                {/* Dismiss X — shows on hover */}
                                                <button
                                                    onClick={(e) => { e.stopPropagation(); dismissNotification(notif._id); }}
                                                    className="opacity-0 group-hover:opacity-100 transition-opacity absolute top-3 right-3 w-5 h-5 flex items-center justify-center rounded-full bg-foreground/8 hover:bg-foreground/15 text-foreground/40 hover:text-foreground/80"
                                                    title="Dismiss"
                                                >
                                                    <svg className="w-3 h-3" fill="none" stroke="currentColor" strokeWidth={2.5} viewBox="0 0 24 24">
                                                        <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                                                    </svg>
                                                </button>
                                            </div>
                                        ))}
                                    </div>
                                ) : (
                                    <div className="flex flex-col items-center justify-center py-10 gap-2 text-foreground/30">
                                        <Check className="w-8 h-8" />
                                        <p className="text-xs font-medium">All caught up!</p>
                                        <p className="text-[11px] text-foreground/25">Inspection updates appear here.</p>
                                    </div>
                                )}
                            </div>
                        </div>
                    )}
                </div>

                <div className="w-px h-6 bg-border mx-1" />
                <ProfileDropdown />
            </div>
        </header>
    );
}

