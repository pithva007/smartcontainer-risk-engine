import { createContext, useContext, useState, useEffect, type ReactNode } from 'react';
import { useQuery } from '@tanstack/react-query';
import { fetchNotifications } from '@/api/routes';
import { useAuth } from './AuthContext';

interface NotificationContextType {
    hasNotification: boolean;
    isPopupOpen: boolean;
    notifications: any[];
    unreadCount: number;
    clearNotification: () => void;
    closePopup: () => void;
    togglePopup: () => void;
    dismissNotification: (id: string) => void;
    clearAllNotifications: () => void;
}

const NotificationContext = createContext<NotificationContextType | undefined>(undefined);

export function NotificationProvider({ children }: { children: ReactNode }) {
    const { isAuthenticated } = useAuth();
    const [hasNotification, setHasNotification] = useState(false);
    const [isPopupOpen, setIsPopupOpen] = useState(false);
    const [lastSeenTimestamp, setLastSeenTimestamp] = useState<string | null>(null);

    // Poll for notifications every 5 seconds
    const { data: notifications = [] } = useQuery({
        queryKey: ['activity-notifications'],
        queryFn: () => fetchNotifications(20),
        enabled: isAuthenticated,
        refetchInterval: 5000,
        refetchIntervalInBackground: true,
    });

    useEffect(() => {
        if (notifications.length > 0) {
            const latestNotif = notifications[0];
            const latestTime = latestNotif.timestamp;

            if (!lastSeenTimestamp) {
                // Initialize on first load without triggering popup
                setLastSeenTimestamp(latestTime);
                return;
            }

            if (latestTime > lastSeenTimestamp) {
                // New notification detected!
                setHasNotification(true);
                setIsPopupOpen(true);
                setLastSeenTimestamp(latestTime);
            }
        }
    }, [notifications, lastSeenTimestamp]);

    const [dismissed, setDismissed] = useState<Set<string>>(new Set());

    const clearNotification = () => setHasNotification(false);
    const closePopup = () => setIsPopupOpen(false);
    const togglePopup = () => setIsPopupOpen((prev) => !prev);
    const dismissNotification = (id: string) => setDismissed(prev => new Set([...prev, id]));
    const clearAllNotifications = () => setDismissed(new Set(notifications.map((n: any) => n._id)));

    const visibleNotifications = notifications.filter((n: any) => !dismissed.has(n._id));
    const unreadCount = visibleNotifications.filter((n: any) => lastSeenTimestamp && n.timestamp > lastSeenTimestamp).length;

    return (
        <NotificationContext.Provider value={{
            hasNotification, isPopupOpen,
            notifications: visibleNotifications,
            unreadCount, clearNotification, closePopup, togglePopup,
            dismissNotification, clearAllNotifications,
        }}>
            {children}
        </NotificationContext.Provider>
    );
}

export function useNotification() {
    const context = useContext(NotificationContext);
    if (context === undefined) {
        throw new Error('useNotification must be used within a NotificationProvider');
    }
    return context;
}
