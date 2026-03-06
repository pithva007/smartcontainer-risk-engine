import { useState, useEffect, useRef } from 'react';
import { Bell, Sun, Moon, Ship } from 'lucide-react';
import { useNotification } from '@/context/NotificationContext';
import ProfileDropdown from './ProfileDropdown';

export default function Header() {
    const [dark, setDark] = useState(true);
    const {
        hasNotification,
        isPopupOpen,
        notifications,
        unreadCount,
        clearNotification,
        togglePopup,
        closePopup
    } = useNotification();
    const popupRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        const handleClickOutside = (e: MouseEvent) => {
            if (popupRef.current && !popupRef.current.contains(e.target as Node)) {
                closePopup();
            }
        };
        if (isPopupOpen) {
            document.addEventListener('mousedown', handleClickOutside);
        }
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, [isPopupOpen, closePopup]);

    useEffect(() => {
        document.documentElement.classList.toggle('dark', dark);
        localStorage.setItem('theme', dark ? 'dark' : 'light');
    }, [dark]);

    // On mount, check localStorage
    useEffect(() => {
        const saved = localStorage.getItem('theme');
        if (saved === 'light') setDark(false);
        else setDark(true); // default dark
    }, []);

    return (
        <header className="h-16 bg-card border-b border-border flex items-center justify-between px-6 sticky top-0 z-10">
            <div className="flex-1" />
            <div className="flex items-center gap-4">
                <button
                    onClick={() => setDark(!dark)}
                    className="p-2 rounded-full text-foreground/60 hover:bg-foreground/5 hover:text-foreground transition-colors"
                    aria-label="Toggle theme"
                >
                    {dark ? <Sun className="w-5 h-5" /> : <Moon className="w-5 h-5" />}
                </button>
                <div className="relative" ref={popupRef}>
                    <button
                        onClick={() => {
                            if (hasNotification) clearNotification();
                            togglePopup();
                        }}
                        className="relative p-2 rounded-full text-foreground/60 hover:bg-foreground/5 hover:text-foreground transition-colors"
                        aria-label="Notifications"
                    >
                        <Bell className="w-5 h-5" />
                        {hasNotification && (
                            <span className="absolute top-1.5 right-1.5 h-2 w-2 rounded-full bg-risk-critical ring-2 ring-card animate-pulse" />
                        )}
                    </button>

                    {isPopupOpen && (
                        <div className="absolute right-0 mt-2 w-80 bg-card border border-border rounded-xl shadow-lg z-50 overflow-hidden animate-in fade-in slide-in-from-top-2">
                            <div className="p-3 border-b border-border bg-foreground/5 flex justify-between items-center">
                                <h3 className="font-semibold text-sm text-foreground flex items-center gap-1.5">
                                    <Bell className="w-4 h-4 text-foreground/70" />
                                    Activity Feed
                                </h3>
                                {unreadCount > 0 && (
                                    <span className="text-xs font-medium text-risk-critical bg-risk-critical/10 px-2 py-0.5 rounded-full">
                                        {unreadCount} New
                                    </span>
                                )}
                            </div>
                            <div className="max-h-80 overflow-y-auto bg-card">
                                {notifications && notifications.length > 0 ? (
                                    <div className="divide-y divide-border/50">
                                        {notifications.map((notif: any) => (
                                            <div key={notif._id} className="p-3 hover:bg-foreground/[0.02] transition-colors flex gap-3 border-l-2 border-transparent hover:border-primary/50">
                                                <div className="mt-0.5 w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
                                                    {notif.action === 'ADD_NOTE' ? (
                                                        <span className="text-xs font-bold text-primary">📝</span>
                                                    ) : (
                                                        <Ship className="w-4 h-4 text-primary" />
                                                    )}
                                                </div>
                                                <div className="flex-1 min-w-0">
                                                    <p className="font-medium text-sm text-foreground border-b border-border/30 pb-1 mb-1 flex items-center justify-between">
                                                        <span>{notif.entity_id}</span>
                                                        <span className="text-[10px] text-foreground/40">{new Date(notif.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                                                    </p>
                                                    <p className="text-xs text-foreground/80 leading-relaxed">
                                                        <span className="font-semibold text-primary">{notif.username}</span>
                                                        {notif.action === 'ADD_NOTE'
                                                            ? ` added a note: "${notif.metadata?.note || notif.metadata?.notes}"`
                                                            : notif.action === 'ASSIGN_CONTAINER'
                                                                ? ` assigned shipment to ${notif.metadata?.assigned_to || notif.username}`
                                                                : ` updated status to ${notif.metadata?.inspection_status}`
                                                        }
                                                    </p>
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                ) : (
                                    <div className="p-6 text-center">
                                        <div className="w-10 h-10 rounded-full bg-foreground/5 flex items-center justify-center mx-auto mb-2 text-foreground/40">
                                            <Bell className="w-5 h-5" />
                                        </div>
                                        <p className="text-sm font-medium text-foreground">No recent activity</p>
                                        <p className="text-xs text-foreground/50 mt-1">Inspection updates will appear here.</p>
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
