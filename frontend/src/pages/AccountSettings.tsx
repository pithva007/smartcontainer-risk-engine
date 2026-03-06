import { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import {
    User,
    Mail,
    Shield,
    Bell,
    Lock,
    Smartphone,
    History,
    ChevronRight,
} from 'lucide-react';

import { useAuth } from '@/context/AuthContext';
import {
    getExtendedProfile,
    updateExtendedProfile,
    getActiveSessions,
    logoutAllSessions,
    getActivityLogs
} from '@/api/routes';
import ChangePasswordModal from '@/components/profile/ChangePasswordModal';

export default function AccountSettings() {
    const queryClient = useQueryClient();
    const { updateUser } = useAuth();

    const [isPasswordModalOpen, setIsPasswordModalOpen] = useState(false);

    // Profile Data
    const {
        data: profileData,
        isLoading: profileLoading,
        isError: profileError
    } = useQuery({
        queryKey: ['extended-profile'],
        queryFn: getExtendedProfile,
    });

    // Active Sessions
    const { data: sessionsData } = useQuery({
        queryKey: ['active-sessions'],
        queryFn: getActiveSessions,
    });

    // Activity Logs
    const { data: activityData } = useQuery({
        queryKey: ['activity-logs'],
        queryFn: getActivityLogs,
    });

    // Mutations
    const updateMutation = useMutation({
        mutationFn: updateExtendedProfile,
        onSuccess: (updatedUser) => {
            toast.success('Settings updated successfully');
            queryClient.invalidateQueries({ queryKey: ['extended-profile'] });
            if (updatedUser?.user) {
                updateUser(updatedUser.user);
            }
        },
        onError: () => toast.error('Failed to update settings'),
    });

    const logoutAllMutation = useMutation({
        mutationFn: logoutAllSessions,
        onSuccess: () => {
            toast.success('Logged out from all other devices');
            queryClient.invalidateQueries({ queryKey: ['active-sessions'] });
        },
        onError: () => toast.error('Failed to logout from other devices'),
    });

    // Local state for immediate UI feedback on toggles
    const [notifState, setNotifState] = useState({
        highRisk: true,
        anomaly: false,
        weeklySummary: true,
    });

    useEffect(() => {
        if (profileData?.profile?.settings?.notifications) {
            setNotifState(profileData.profile.settings.notifications);
        }
    }, [profileData]);

    const handleToggleNotification = (key: keyof typeof notifState) => {
        const nextState = { ...notifState, [key]: !notifState[key] };
        setNotifState(nextState);
        updateMutation.mutate({
            settings: {
                notifications: nextState
            }
        });
    };

    if (profileLoading) {
        return (
            <div className="flex h-full items-center justify-center p-20 bg-background text-foreground/40 font-medium">
                Loading account configuration...
            </div>
        );
    }

    if (profileError || !profileData?.profile) {
        return (
            <div className="flex h-full items-center justify-center p-20 bg-background text-risk-critical font-medium uppercase tracking-widest text-xs">
                Error retrieving account security status.
            </div>
        );
    }

    const { profile } = profileData;

    return (
        <div className="p-6 md:p-8 max-w-6xl mx-auto animate-in fade-in slide-in-from-bottom-4 duration-500 pb-20">
            <div className="mb-8">
                <h1 className="text-2xl font-bold text-foreground">Account Settings</h1>
                <p className="text-sm text-foreground/50 mt-1 uppercase tracking-wider font-medium">Personal & Security Configuration</p>
            </div>

            <div className="space-y-8">
                {/* section: Profile Info */}
                <section className="bg-card border border-border rounded-2xl p-8 shadow-sm">
                    <div className="flex items-center gap-3 mb-8">
                        <div className="p-2 bg-blue-500/10 rounded-lg text-blue-500">
                            <User className="w-5 h-5" />
                        </div>
                        <h2 className="text-lg font-bold">Identity Management</h2>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                        <div className="space-y-2">
                            <label className="text-[10px] text-foreground/40 font-bold uppercase tracking-widest">Full Name</label>
                            <input
                                defaultValue={profile.full_name}
                                onBlur={(e) => {
                                    if (e.target.value !== profile.full_name) {
                                        updateMutation.mutate({ full_name: e.target.value });
                                    }
                                }}
                                className="w-full bg-background border border-border rounded-xl px-4 py-2.5 text-sm focus:ring-2 focus:ring-primary/40 focus:outline-none transition-all"
                            />
                        </div>

                        <div className="space-y-2">
                            <label className="text-[10px] text-foreground/40 font-bold uppercase tracking-widest">Department</label>
                            <input
                                defaultValue={profile.department}
                                onBlur={(e) => {
                                    if (e.target.value !== profile.department) {
                                        updateMutation.mutate({ department: e.target.value });
                                    }
                                }}
                                className="w-full bg-background border border-border rounded-xl px-4 py-2.5 text-sm focus:ring-2 focus:ring-primary/40 focus:outline-none transition-all"
                            />
                        </div>

                        <div className="space-y-2">
                            <label className="text-[10px] text-foreground/40 font-bold uppercase tracking-widest">Phone Number</label>
                            <input
                                defaultValue={profile.phone_number}
                                placeholder="+1 (555) 000-0000"
                                onBlur={(e) => {
                                    if (e.target.value !== profile.phone_number) {
                                        updateMutation.mutate({ phone_number: e.target.value });
                                    }
                                }}
                                className="w-full bg-background border border-border rounded-xl px-4 py-2.5 text-sm focus:ring-2 focus:ring-primary/40 focus:outline-none transition-all"
                            />
                        </div>

                        <div className="space-y-2">
                            <label className="text-[10px] text-foreground/40 font-bold uppercase tracking-widest">System Email</label>
                            <div className="w-full bg-foreground/5 border border-border rounded-xl px-4 py-2.5 text-sm text-foreground/40 flex items-center gap-2">
                                <Mail className="w-4 h-4 shrink-0" />
                                <span>{profile.official_email}</span>
                            </div>
                        </div>
                    </div>
                </section>

                {/* section: Security & Creds */}
                <section className="bg-card border border-border rounded-2xl p-8 shadow-sm">
                    <div className="flex items-center gap-3 mb-8">
                        <div className="p-2 bg-amber-500/10 rounded-lg text-amber-500">
                            <Shield className="w-5 h-5" />
                        </div>
                        <h2 className="text-lg font-bold">Access Security</h2>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <button
                            onClick={() => setIsPasswordModalOpen(true)}
                            className="flex items-center justify-between p-4 rounded-xl border border-border bg-background hover:bg-foreground/5 hover:border-primary/40 transition-all group"
                        >
                            <div className="flex items-center gap-3">
                                <Lock className="w-5 h-5 text-foreground/40 group-hover:text-primary transition-colors" />
                                <div className="text-left">
                                    <p className="text-sm font-bold">Change System Password</p>
                                    <p className="text-[10px] text-foreground/40 font-semibold uppercase tracking-wider">Secure Protocol Active</p>
                                </div>
                            </div>
                            <ChevronRight className="w-4 h-4 text-foreground/20" />
                        </button>

                        <button className="flex items-center justify-between p-4 rounded-xl border border-border bg-background hover:bg-foreground/5 hover:border-primary/40 transition-all group opacity-50 cursor-not-allowed">
                            <div className="flex items-center gap-3">
                                <Smartphone className="w-5 h-5 text-foreground/40" />
                                <div className="text-left">
                                    <p className="text-sm font-bold text-foreground/60">Two-Factor Authentication</p>
                                    <p className="text-[10px] text-risk-low font-bold uppercase tracking-wider">Recommended</p>
                                </div>
                            </div>
                            <ChevronRight className="w-4 h-4 text-foreground/20" />
                        </button>
                    </div>
                </section>

                {/* section: Notifications */}
                <section className="bg-card border border-border rounded-2xl p-8 shadow-sm">
                    <div className="flex items-center gap-3 mb-8">
                        <div className="p-2 bg-purple-500/10 rounded-lg text-purple-500">
                            <Bell className="w-5 h-5" />
                        </div>
                        <h2 className="text-lg font-bold">Notification Preferences</h2>
                    </div>

                    <div className="space-y-6">
                        <div className="flex items-center justify-between">
                            <div>
                                <p className="text-sm font-bold">High Risk Alerts</p>
                                <p className="text-xs text-foreground/40">Immediate email notifications for critical containers</p>
                            </div>
                            <Switch enabled={notifState.highRisk} onChange={() => handleToggleNotification('highRisk')} />
                        </div>
                        <div className="flex items-center justify-between">
                            <div>
                                <p className="text-sm font-bold">Anomaly Detection</p>
                                <p className="text-xs text-foreground/40">Push alerts when pattern anomalies are detected</p>
                            </div>
                            <Switch enabled={notifState.anomaly} onChange={() => handleToggleNotification('anomaly')} />
                        </div>
                        <div className="flex items-center justify-between">
                            <div>
                                <p className="text-sm font-bold">Weekly Performance Summary</p>
                                <p className="text-xs text-foreground/40">Consolidated audit of operations and risk trends</p>
                            </div>
                            <Switch enabled={notifState.weeklySummary} onChange={() => handleToggleNotification('weeklySummary')} />
                        </div>
                    </div>
                </section>

                {/* section: Sessions */}
                <section className="bg-card border border-border rounded-2xl p-8 shadow-sm overflow-hidden relative">
                    <div className="flex items-center gap-3 mb-8">
                        <div className="p-2 bg-cyan-500/10 rounded-lg text-cyan-500">
                            <Lock className="w-5 h-5" />
                        </div>
                        <div className="flex items-center justify-between w-full">
                            <h2 className="text-lg font-bold">Active Sessions</h2>
                            <button
                                onClick={() => logoutAllMutation.mutate()}
                                className="text-[10px] font-bold text-risk-critical uppercase tracking-widest hover:underline"
                            >
                                Invalidate all sessions
                            </button>
                        </div>
                    </div>

                    <div className="space-y-3">
                        {sessionsData?.sessions?.map((s, i) => (
                            <div key={i} className="flex items-center justify-between p-4 rounded-xl border border-border bg-background/50">
                                <div className="flex items-center gap-4">
                                    <div className="w-10 h-10 rounded-lg bg-foreground/5 flex items-center justify-center text-foreground/30">
                                        <Smartphone className="w-5 h-5" />
                                    </div>
                                    <div>
                                        <p className="text-sm font-bold capitalize">{s.device || 'System Browser Session'}</p>
                                        <p className="text-[10px] text-foreground/40 font-medium">IP: {s.ip || '127.0.0.1'}</p>
                                    </div>
                                </div>
                                <div className="text-right">
                                    <p className="text-[10px] text-foreground/40 uppercase font-bold tracking-widest">Login Time</p>
                                    <p className="text-xs font-medium">{new Date(s.login_time).toLocaleString()}</p>
                                </div>
                            </div>
                        ))}
                        {(!sessionsData?.sessions || sessionsData.sessions.length === 0) && (
                            <p className="text-xs text-foreground/30 italic text-center py-4">No active sessions detected.</p>
                        )}
                    </div>
                </section>

                {/* section: Activity */}
                <section className="bg-card border border-border rounded-2xl p-8 shadow-sm">
                    <div className="flex items-center gap-3 mb-8">
                        <div className="p-2 bg-emerald-500/10 rounded-lg text-emerald-500">
                            <History className="w-5 h-5" />
                        </div>
                        <h2 className="text-lg font-bold">Activity Log</h2>
                    </div>

                    <div className="overflow-x-auto">
                        <table className="w-full text-left text-sm">
                            <thead>
                                <tr className="border-b border-border">
                                    <th className="pb-4 font-bold text-foreground/40 uppercase tracking-widest text-[10px]">Action</th>
                                    <th className="pb-4 font-bold text-foreground/40 uppercase tracking-widest text-[10px]">Timestamp</th>
                                    <th className="pb-4 font-bold text-foreground/40 uppercase tracking-widest text-[10px] text-right">Reference</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-border">
                                {activityData?.logs?.map((l) => (
                                    <tr key={l._id}>
                                        <td className="py-4 font-semibold text-foreground/80">{l.action.replace(/_/g, ' ')}</td>
                                        <td className="py-4 text-foreground/50">{new Date(l.timestamp).toLocaleString()}</td>
                                        <td className="py-4 text-right">
                                            <span className="px-2 py-0.5 bg-foreground/5 rounded-md border border-border text-[9px] font-bold text-foreground/30">
                                                {l._id.slice(-8).toUpperCase()}
                                            </span>
                                        </td>
                                    </tr>
                                ))}
                                {(!activityData?.logs || activityData.logs.length === 0) && (
                                    <tr>
                                        <td colSpan={3} className="py-12 text-center text-foreground/20 italic">No recent activity detected.</td>
                                    </tr>
                                )}
                            </tbody>
                        </table>
                    </div>
                </section>
            </div>

            <ChangePasswordModal
                isOpen={isPasswordModalOpen}
                onClose={() => setIsPasswordModalOpen(false)}
            />
        </div>
    );
}

function Switch({ enabled, onChange }: { enabled: boolean; onChange?: () => void }) {
    return (
        <button
            onClick={onChange}
            className={`w-11 h-6 rounded-full transition-all relative ${enabled ? 'bg-primary shadow-[0_0_12px_rgba(59,130,246,0.3)]' : 'bg-foreground/10'
                }`}
        >
            <span
                className={`absolute top-1 left-1 w-4 h-4 rounded-full bg-white transition-all shadow-sm ${enabled ? 'translate-x-5' : 'translate-x-0'
                    }`}
            />
        </button>
    );
}
