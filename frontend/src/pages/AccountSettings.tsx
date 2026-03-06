import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import apiClient from '@/api/apiClient';
import toast from 'react-hot-toast';
import {
    User,
    Mail,
    Key,
    Shield,
    Bell,
    Lock,
    Activity,
} from 'lucide-react';

import { useAuth } from '@/context/AuthContext';

/**
 * Account settings page. Uses the same dark-card layout as `Profile.tsx`.
 * Sections: profile info, security, notifications, privacy/sessions, activity log.
 */
export default function AccountSettings() {
    const queryClient = useQueryClient();

    // type definitions for API responses
    interface ProfileResp {
        profile: {
            full_name: string;
            official_email: string;
            department: string;
            phone_number?: string;
            profile_photo?: string;
            account_created_date?: string;
            last_login_time?: string;
            active_sessions: number;
        };
    }
    interface SessionsResp {
        sessions: Array<{ login_time: string; device?: string; ip?: string }>;
    }
    interface ActivityResp {
        logs: Array<{ action: string; timestamp: string }>;
    }

    const [notifications, setNotifications] = useState({
        highRisk: true,
        anomaly: false,
        weeklySummary: true,
    });

    const toggle = (key: keyof typeof notifications) => {
        setNotifications(prev => ({ ...prev, [key]: !prev[key] }));
    };

    const navigate = useNavigate();
    const { logout } = useAuth();

    const { data: profileData, isLoading: profileLoading, isError: profileError, error } = useQuery<ProfileResp>({
        queryKey: ['profile'],
        queryFn: async () => {
            const res = await apiClient.get<ProfileResp>('/user/profile');
            return res.data;
        },
        staleTime: 1000 * 60 * 5,
    });

    // logout when we get unauthorized
    if (profileError) {
        const msg = (error as Error)?.message || '';
        if (msg.toLowerCase().includes('401')) {
            logout();
            navigate('/login');
        }
    }

    const { data: sessionsData } = useQuery<SessionsResp>({
        queryKey: ['sessions'],
        queryFn: () => fetch('/api/user/active-sessions').then((r) => r.json()),
        enabled: !!profileData,
    });

    const { data: activityData } = useQuery<ActivityResp>({
        queryKey: ['activities'],
        queryFn: () => fetch('/api/user/activity-logs').then((r) => r.json()),
        enabled: !!profileData,
    });

    const updateMutation = useMutation<any, unknown, Partial<ProfileResp['profile']>>({
        mutationFn: (vals) =>
            fetch('/api/user/update-profile', {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(vals),
            }).then((r) => r.json()),
        onSuccess: () => {
            toast.success('Profile updated');
            queryClient.invalidateQueries({ queryKey: ['profile'] });
        },
    });

    const logoutAllMutation = useMutation<any>({
        mutationFn: () => fetch('/api/user/logout-all', { method: 'POST' }).then((r) => r.json()),
        onSuccess: () => {
            toast.success('Logged out from all devices');
            queryClient.invalidateQueries({ queryKey: ['sessions'] });
        },
    });

    const [sessions, setSessions] = useState<SessionsResp['sessions']>([]);
    const [activities, setActivities] = useState<Array<{ time: string; action: string }>>([]);

    // populate when queries return, using effects to avoid infinite rerenders
    useEffect(() => {
        if (sessionsData?.sessions) {
            setSessions(sessionsData.sessions);
        }
    }, [sessionsData]);

    useEffect(() => {
        if (activityData?.logs) {
            setActivities(
                activityData.logs.map((l) => ({ time: new Date(l.timestamp).toLocaleTimeString(), action: l.action }))
            );
        }
    }, [activityData]);

    // show feedback while loading or error
    if (profileLoading) {
        return (
            <div className="flex h-full items-center justify-center bg-background">
                <p className="text-foreground">Loading account settings…</p>
            </div>
        );
    }
    if (profileError || !profileData?.profile) {
        // if server returned unauthorized we may want to log out as well
        const msg = (error as Error)?.message || 'Failed to load profile data.';
        return (
            <div className="flex h-full items-center justify-center bg-background">
                <p className="text-risk-critical">{msg}</p>
            </div>
        );
    }

    return (
        <div className="p-6 md:p-8 max-w-6xl mx-auto animate-in fade-in slide-in-from-bottom-4 duration-500 pb-20">
            <div className="mb-8">
                <h1 className="text-2xl font-bold text-foreground">Account Settings</h1>
                <p className="text-sm text-foreground/50 mt-1 uppercase tracking-wider font-medium">Personal & security configuration</p>
            </div>

            <div className="space-y-8">
                {/* profile info */}
                <section className="bg-card border border-border rounded-2xl p-8 shadow-sm">
                    <div className="flex items-center gap-3 mb-6">
                        <div className="p-2 bg-blue-500/10 rounded-lg text-blue-500">
                            <User className="w-5 h-5" />
                        </div>
                        <h2 className="text-lg font-bold">Profile Information</h2>
                    </div>
                    <form
                        onSubmit={(e) => {
                            e.preventDefault();
                            updateMutation.mutate({
                                full_name: profileData?.profile.full_name,
                                department: profileData?.profile.department,
                                phone_number: profileData?.profile.phone_number,
                                profile_photo: profileData?.profile.profile_photo,
                            });
                        }}
                        className="grid grid-cols-1 md:grid-cols-2 gap-6"
                    >
                        <div className="space-y-1.5">
                            <label className="text-[10px] text-foreground/40 font-bold uppercase tracking-widest">Full Name</label>
                            <input
                                value={profileData?.profile.full_name || ''}
                                onChange={(e) =>
                                    updateMutation.mutate({
                                        full_name: e.target.value,
                                    })
                                }
                                className="w-full bg-background border border-border rounded-lg px-3 py-2 text-sm text-foreground"
                            />
                        </div>
                        <div className="space-y-1.5">
                            <label className="text-[10px] text-foreground/40 font-bold uppercase tracking-widest">Profile Photo</label>
                            <button type="button" className="px-3 py-2 bg-primary/10 text-primary rounded-lg text-sm">
                                Change
                            </button>
                        </div>
                        <div className="space-y-1.5">
                            <label className="text-[10px] text-foreground/40 font-bold uppercase tracking-widest">Official Email</label>
                            <input
                                value={profileData?.profile.official_email || ''}
                                disabled
                                className="w-full bg-background border border-border rounded-lg px-3 py-2 text-sm text-foreground"
                            />
                        </div>
                        <div className="space-y-1.5">
                            <label className="text-[10px] text-foreground/40 font-bold uppercase tracking-widest">Department</label>
                            <input
                                value={profileData?.profile.department || ''}
                                onChange={(e) => updateMutation.mutate({ department: e.target.value })}
                                className="w-full bg-background border border-border rounded-lg px-3 py-2 text-sm text-foreground"
                            />
                        </div>
                        <div className="space-y-1.5 md:col-span-2">
                            <label className="text-[10px] text-foreground/40 font-bold uppercase tracking-widest">Contact Number</label>
                            <input
                                value={profileData?.profile.phone_number || ''}
                                onChange={(e) => updateMutation.mutate({ phone_number: e.target.value })}
                                className="w-full bg-background border border-border rounded-lg px-3 py-2 text-sm text-foreground"
                            />
                        </div>
                    </form>
                </section>

                {/* security settings */}
                <section className="bg-card border border-border rounded-2xl p-8 shadow-sm">
                    <div className="flex items-center gap-3 mb-6">
                        <div className="p-2 bg-amber-500/10 rounded-lg text-amber-500">
                            <Shield className="w-5 h-5" />
                        </div>
                        <h2 className="text-lg font-bold">Security Settings</h2>
                    </div>
                    <div className="space-y-4">
                        <button className="w-full flex items-center justify-between px-4 py-2.5 rounded-xl border border-border bg-background hover:bg-foreground/5 transition-all">
                            <span>Change Password</span>
                            <Key className="w-4 h-4" />
                        </button>
                        <button className="w-full flex items-center justify-between px-4 py-2.5 rounded-xl border border-border bg-background hover:bg-foreground/5 transition-all">
                            <span>Two-Factor Authentication</span>
                            <Switch enabled={false} />
                        </button>
                        <button className="w-full flex items-center justify-between px-4 py-2.5 rounded-xl border border-border bg-background hover:bg-foreground/5 transition-all">
                            <span>Reset via Email</span>
                            <Mail className="w-4 h-4" />
                        </button>
                        <button className="w-full flex items-center justify-between px-4 py-2.5 rounded-xl border border-border bg-background hover:bg-foreground/5 transition-all">
                            <span>Setup Security Questions</span>
                            <Lock className="w-4 h-4" />
                        </button>
                    </div>
                </section>

                {/* notification preferences */}
                <section className="bg-card border border-border rounded-2xl p-8 shadow-sm">
                    <div className="flex items-center gap-3 mb-6">
                        <div className="p-2 bg-purple-500/10 rounded-lg text-purple-500">
                            <Bell className="w-5 h-5" />
                        </div>
                        <h2 className="text-lg font-bold">Notification Preferences</h2>
                    </div>
                    <div className="space-y-4">
                        {Object.entries(notifications).map(([k, v]) => (
                            <div key={k} className="flex items-center justify-between">
                                <span className="text-sm text-foreground">{k === 'highRisk' ? 'Email high-risk containers' : k === 'anomaly' ? 'Alerts for anomaly detection' : 'Weekly system activity summary'}</span>
                                <Switch enabled={v} onChange={() => toggle(k as any)} />
                            </div>
                        ))}
                    </div>
                </section>

                {/* privacy & sessions */}
                <section className="bg-card border border-border rounded-2xl p-8 shadow-sm">
                    <div className="flex items-center gap-3 mb-6">
                        <div className="p-2 bg-cyan-500/10 rounded-lg text-cyan-500">
                            <Lock className="w-5 h-5" />
                        </div>
                        <h2 className="text-lg font-bold">Privacy & Session Management</h2>
                    </div>
                    <div className="space-y-4">
                        <div className="flex flex-col gap-2">
                            <span className="text-sm text-foreground/70">Active Sessions</span>
                            <ul className="space-y-1">
                                {sessions.map((s, i) => (
                                    <li key={i} className="flex justify-between text-sm">
                                        <span>{s.device || 'unknown'}</span>
                                        <span>{new Date(s.login_time).toLocaleString()}</span>
                                    </li>
                                ))}
                                {sessions.length === 0 && (
                                    <li className="text-xs text-foreground/50">No active sessions</li>
                                )}
                            </ul>
                        </div>
                        <button
                            onClick={() => logoutAllMutation.mutate()}
                            className="px-4 py-2 rounded-lg bg-risk-critical/10 text-risk-critical text-sm"
                        >
                            Logout from all devices
                        </button>
                    </div>
                </section>

                {/* activity logs */}
                <section className="bg-card border border-border rounded-2xl p-8 shadow-sm">
                    <div className="flex items-center gap-3 mb-6">
                        <div className="p-2 bg-green-500/10 rounded-lg text-green-500">
                            <Activity className="w-5 h-5" />
                        </div>
                        <h2 className="text-lg font-bold">Account Activity Logs</h2>
                    </div>
                    <table className="w-full text-sm text-left">
                        <thead>
                            <tr>
                                <th className="pb-2">Time</th>
                                <th className="pb-2">Action</th>
                            </tr>
                        </thead>
                        <tbody>
                            {activities.map((a, i) => (
                                <tr key={i} className="border-t border-border">
                                    <td className="py-2">{a.time}</td>
                                    <td className="py-2">{a.action}</td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </section>
            </div>
        </div>
    );
}

// small switch component
function Switch({ enabled, onChange }: { enabled: boolean; onChange?: () => void }) {
    return (
        <button
            onClick={onChange}
            className={`w-10 h-5 rounded-full transition-colors ${
                enabled ? 'bg-primary' : 'bg-foreground/20'
            }`}
        >
            <span
                className={`block w-4 h-4 rounded-full bg-background transition-transform ${
                    enabled ? 'translate-x-5' : 'translate-x-0'
                }`}
            />
        </button>
    );
}
