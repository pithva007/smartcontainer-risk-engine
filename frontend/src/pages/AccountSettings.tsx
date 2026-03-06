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

    // toggle function will be defined later once notificationMutation exists

    const navigate = useNavigate();
    const { logout, setUser } = useAuth();

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
        queryFn: () => apiClient.get('/user/active-sessions').then((r) => r.data),
        enabled: !!profileData,
    });

    const { data: activityData } = useQuery<ActivityResp>({
        queryKey: ['activities'],
        queryFn: () => apiClient.get('/user/activity-logs').then((r) => r.data),
        enabled: !!profileData,
    });

    // mutations will be declared after state hooks below

    const [sessions, setSessions] = useState<SessionsResp['sessions']>([]);
    const [activities, setActivities] = useState<Array<{ time: string; action: string }>>([]);

    // form state for profile editing
    const [profileForm, setProfileForm] = useState<Partial<ProfileResp['profile']>>({
        full_name: '',
        official_email: '',
        department: '',
        phone_number: '',
        profile_photo: '',
    });
    const [showPasswordModal, setShowPasswordModal] = useState(false);
    const [passwordForm, setPasswordForm] = useState({
        current: '',
        new: '',
        confirm: '',
    });

    // notification query & mutation
    interface NotificationResp {
        settings: { highRisk: boolean; anomaly: boolean; weeklySummary: boolean };
    }
    const { data: notifData } = useQuery<NotificationResp>({
        queryKey: ['notifications'],
        queryFn: () => apiClient.get('/user/notification-settings').then((r) => r.data),
        enabled: !!profileData,
    });

    const notificationMutation = useMutation<any, unknown, Partial<NotificationResp['settings']>>({
        mutationFn: (vals) => apiClient.put('/user/notification-settings', vals).then((r) => r.data),
        onSuccess: (data) => {
            queryClient.setQueryData(['notifications'], data);
            toast.success('Notification preferences updated');
            queryClient.invalidateQueries({ queryKey: ['activities'] });
        },
        onError: (err: any) => {
            toast.error(err?.response?.data?.error?.message || 'Failed to update notifications');
        },
    });

    // now that notificationMutation exists, define toggle helper
    const toggle = (key: keyof typeof notifications) => {
        const newVal = !notifications[key];
        setNotifications(prev => ({ ...prev, [key]: newVal }));
        notificationMutation.mutate({ [key]: newVal });
    };

    // other mutations that depend on state hooks
    const updateMutation = useMutation<any, unknown, Partial<ProfileResp['profile']>>({
        mutationFn: (vals) =>
            apiClient.put('/user/update-profile', vals).then((r) => r.data),
        onSuccess: (data) => {
            toast.success('Profile updated');
            queryClient.invalidateQueries({ queryKey: ['profile'] });
            queryClient.invalidateQueries({ queryKey: ['activities'] });
            if (data?.user) setUser(data.user);
        },
        onError: (err: any) => {
            console.error('Profile update error', err);
            const msg = err?.response?.data?.error?.message || err?.message || 'Failed to update profile';
            toast.error(msg);
        },
    });

    const logoutAllMutation = useMutation<any>({
        mutationFn: () => apiClient.post('/user/logout-all').then((r) => r.data),
        onSuccess: () => {
            toast.success('Logged out from all devices');
            queryClient.invalidateQueries({ queryKey: ['sessions'] });
            queryClient.invalidateQueries({ queryKey: ['activities'] });
        },
    });

    const changePasswordMutation = useMutation<any, unknown, { current_password: string; new_password: string }>({
        mutationFn: (vals) => apiClient.post('/user/change-password', vals).then((r) => r.data),
        onSuccess: () => {
            toast.success('Password changed');
            setShowPasswordModal(false);
            setPasswordForm({ current: '', new: '', confirm: '' });
            queryClient.invalidateQueries({ queryKey: ['activities'] });
        },
        onError: (err: any) => {
            toast.error(err?.response?.data?.error?.message || 'Failed to change password');
        },
    });

    // populate when queries return, using effects to avoid infinite rerenders
    useEffect(() => {
        if (sessionsData?.sessions) {
            setSessions(sessionsData.sessions);
        }
    }, [sessionsData]);

    useEffect(() => {
        if (activityData?.logs) {
            setActivities(
                activityData.logs.map((l) => ({ time: new Date(l.timestamp).toLocaleString(), action: l.action }))
            );
        }
    }, [activityData]);

    useEffect(() => {
        if (profileData?.profile) {
            setProfileForm({
                full_name: profileData.profile.full_name,
                official_email: profileData.profile.official_email,
                department: profileData.profile.department,
                phone_number: profileData.profile.phone_number || '',
                profile_photo: profileData.profile.profile_photo || '',
            });
        }
    }, [profileData]);

    useEffect(() => {
        if (notifData?.settings) {
            setNotifications(notifData.settings);
        }
    }, [notifData]);

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
                            // strip out empty values so schema optional works
                            const payload: Partial<ProfileResp['profile']> = { ...profileForm };
                            if (payload.profile_photo === '') delete payload.profile_photo;
                            if (payload.official_email === '') delete payload.official_email;
                            if (payload.department === '') delete payload.department;
                            if (payload.full_name === '') delete payload.full_name;
                            if (payload.phone_number === '') delete payload.phone_number;
                            updateMutation.mutate(payload);
                        }}
                        className="grid grid-cols-1 md:grid-cols-2 gap-6"
                    >
                        <div className="space-y-1.5">
                            <label className="text-[10px] text-foreground/40 font-bold uppercase tracking-widest">Full Name</label>
                            <input
                                value={profileForm.full_name || ''}
                                onChange={(e) => setProfileForm((p) => ({ ...p, full_name: e.target.value }))}
                                className="w-full bg-background border border-border rounded-lg px-3 py-2 text-sm text-foreground"
                            />
                        </div>
                        <div className="space-y-1.5">
                            <label className="text-[10px] text-foreground/40 font-bold uppercase tracking-widest">Profile Photo</label>
                            <input
                                type="text"
                                placeholder="Image URL"
                                value={profileForm.profile_photo || ''}
                                onChange={(e) => setProfileForm((p) => ({ ...p, profile_photo: e.target.value }))}
                                className="w-full bg-background border border-border rounded-lg px-3 py-2 text-sm text-foreground"
                            />
                        </div>
                        <div className="space-y-1.5">
                            <label className="text-[10px] text-foreground/40 font-bold uppercase tracking-widest">Official Email</label>
                            <input
                                type="email"
                                value={profileForm.official_email || ''}
                                onChange={(e) => setProfileForm((p) => ({ ...p, official_email: e.target.value }))}
                                required
                                className="w-full bg-background border border-border rounded-lg px-3 py-2 text-sm text-foreground"
                            />
                        </div>
                        <div className="space-y-1.5">
                            <label className="text-[10px] text-foreground/40 font-bold uppercase tracking-widest">Department</label>
                            <input
                                value={profileForm.department || ''}
                                onChange={(e) => setProfileForm((p) => ({ ...p, department: e.target.value }))}
                                className="w-full bg-background border border-border rounded-lg px-3 py-2 text-sm text-foreground"
                            />
                        </div>
                        <div className="space-y-1.5 md:col-span-2">
                            <label className="text-[10px] text-foreground/40 font-bold uppercase tracking-widest">Contact Number</label>
                            <input
                                type="tel"
                                pattern="[0-9]*"
                                value={profileForm.phone_number || ''}
                                onChange={(e) => setProfileForm((p) => ({ ...p, phone_number: e.target.value.replace(/\D/g,'') }))}
                                className="w-full bg-background border border-border rounded-lg px-3 py-2 text-sm text-foreground"
                            />
                        </div>
                        <div className="md:col-span-2 flex justify-end">
                            <button
                                type="submit"
                                disabled={updateMutation.isPending}
                                className="px-4 py-2 bg-primary rounded-lg text-sm text-background disabled:opacity-50"
                            >
                                {updateMutation.isPending ? 'Saving…' : 'Save Changes'}
                            </button>
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
                        <button
                            onClick={() => setShowPasswordModal(true)}
                            className="w-full flex items-center justify-between px-4 py-2.5 rounded-xl border border-border bg-background hover:bg-foreground/5 transition-all"
                        >
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

                {/* change password modal */}
                {showPasswordModal && (
                    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-background/80 backdrop-blur-sm">
                        <div className="bg-card border border-border w-full max-w-md rounded-2xl shadow-2xl p-6 animate-in fade-in zoom-in duration-200">
                            <h3 className="text-lg font-bold mb-4">Change Password</h3>
                            <form
                                onSubmit={(e) => {
                                    e.preventDefault();
                                    if (passwordForm.new !== passwordForm.confirm) {
                                        toast.error('New password and confirmation do not match');
                                        return;
                                    }
                                    changePasswordMutation.mutate({
                                        current_password: passwordForm.current,
                                        new_password: passwordForm.new,
                                    });
                                }}
                                className="space-y-4"
                            >
                                <div>
                                    <label className="block text-sm text-foreground/70">Current Password</label>
                                    <input
                                        type="password"
                                        value={passwordForm.current}
                                        onChange={(e) => setPasswordForm((p) => ({ ...p, current: e.target.value }))}
                                        className="w-full bg-background border border-border rounded-lg px-3 py-2 text-sm text-foreground"
                                        required
                                    />
                                </div>
                                <div>
                                    <label className="block text-sm text-foreground/70">New Password</label>
                                    <input
                                        type="password"
                                        value={passwordForm.new}
                                        onChange={(e) => setPasswordForm((p) => ({ ...p, new: e.target.value }))}
                                        className="w-full bg-background border border-border rounded-lg px-3 py-2 text-sm text-foreground"
                                        required
                                    />
                                </div>
                                <div>
                                    <label className="block text-sm text-foreground/70">Confirm Password</label>
                                    <input
                                        type="password"
                                        value={passwordForm.confirm}
                                        onChange={(e) => setPasswordForm((p) => ({ ...p, confirm: e.target.value }))}
                                        className="w-full bg-background border border-border rounded-lg px-3 py-2 text-sm text-foreground"
                                        required
                                    />
                                </div>
                                <div className="flex justify-end gap-4">
                                    <button
                                        type="button"
                                        onClick={() => setShowPasswordModal(false)}
                                        className="px-4 py-2 rounded-lg text-sm border border-border"
                                    >
                                        Cancel
                                    </button>
                                    <button
                                        type="submit"
                                        disabled={changePasswordMutation.isPending}
                                        className="px-4 py-2 bg-primary rounded-lg text-sm text-background disabled:opacity-50"
                                    >
                                        {changePasswordMutation.isPending ? 'Updating…' : 'Update Password'}
                                    </button>
                                </div>
                            </form>
                        </div>
                    </div>
                )}
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
                                        {s.ip && <span className="ml-4 text-foreground/70">IP: {s.ip}</span>}
                                    </li>
                                ))}
                                {sessions.length === 0 && (
                                    <li className="text-xs text-foreground/50">No active sessions</li>
                                )}
                            </ul>
                        </div>
                        <button
                            onClick={() => logoutAllMutation.mutate()}
                            disabled={logoutAllMutation.isPending}
                            className="px-4 py-2 rounded-lg bg-risk-critical/10 text-risk-critical text-sm disabled:opacity-50"
                        >
                            {logoutAllMutation.isPending ? 'Logging out…' : 'Logout from all devices'}
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
