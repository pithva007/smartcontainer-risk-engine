import { useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import apiClient from '@/api/apiClient';
import {
    CheckCircle2,
    Slash,
    Users,
} from 'lucide-react';

import { useAuth } from '@/context/AuthContext';


/**
 * System access page showing roles, permissions and API access.
 */
export default function SystemAccess() {
    // types
    interface AccessResp {
        role: string;
        department: string;
        permissions: string[];
        restricted_permissions: string[];
    }

    const navigate = useNavigate();
    const { logout } = useAuth();

    const { data, isLoading, isError, error } = useQuery<AccessResp>({
        queryKey: ['systemAccess'],
        queryFn: async () => {
            const res = await apiClient.get<AccessResp>('/user/system-access');
            return res.data;
        },
    });

    if (isError) {
        const msg = (error as Error)?.message || '';
        if (msg.toLowerCase().includes('401')) {
            logout();
            navigate('/login');
        }
    }

    if (isLoading) {
        return (
            <div className="flex h-full items-center justify-center p-20 bg-background text-foreground/40 font-medium">
                Verifying system credentials...
            </div>
        );
    }
    if (isError || !data) {
        const msg = (error as Error)?.message || 'Unable to load access information.';
        return (
            <div className="flex h-full items-center justify-center p-20 bg-background text-risk-critical font-medium uppercase tracking-widest text-xs">
                {msg}
            </div>
        );
    }

    const enabledPermissions: string[] = data?.permissions || [];
    const restrictedPermissions: string[] = data?.restricted_permissions || [];
    const role = data?.role || '';
    const department = data?.department || '';

    const formatPermission = (p: string) =>
        p.split('_').map(word => word.charAt(0).toUpperCase() + word.slice(1)).join(' ');

    return (
        <div className="p-6 md:p-8 max-w-6xl mx-auto animate-in fade-in slide-in-from-bottom-4 duration-500 pb-20">
            <div className="mb-8">
                <h1 className="text-2xl font-bold text-foreground">System Access</h1>
                <p className="text-sm text-foreground/50 mt-1 uppercase tracking-wider font-medium">Role & Permission Hierarchy</p>
            </div>

            <div className="space-y-8">
                {/* role detail */}
                <section className="bg-card border border-border rounded-2xl p-8 shadow-sm">
                    <div className="flex items-center gap-3 mb-8">
                        <div className="p-2 bg-indigo-500/10 rounded-lg text-indigo-500">
                            <Users className="w-5 h-5" />
                        </div>
                        <h2 className="text-lg font-bold">Role & Access Level</h2>
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                        <div className="space-y-2">
                            <p className="text-[10px] text-foreground/40 font-bold uppercase tracking-widest">Authorized Role</p>
                            <p className="text-md font-bold text-foreground capitalize">{role}</p>
                        </div>
                        <div className="space-y-2">
                            <p className="text-[10px] text-foreground/40 font-bold uppercase tracking-widest">Departmental Sync</p>
                            <p className="text-md font-bold text-foreground">{department || 'Not Assigned'}</p>
                        </div>
                    </div>
                </section>

                {/* operational permissions */}
                <section className="bg-card border border-border rounded-2xl p-8 shadow-sm">
                    <div className="flex items-center gap-3 mb-8">
                        <div className="p-2 bg-emerald-500/10 rounded-lg text-emerald-500">
                            <CheckCircle2 className="w-5 h-5" />
                        </div>
                        <h2 className="text-lg font-bold">Active Operational Rights</h2>
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
                        {enabledPermissions.map((p) => (
                            <div key={p} className="flex items-center gap-3 p-4 rounded-xl border bg-emerald-500/5 border-emerald-500/20 text-emerald-700 dark:text-emerald-400">
                                <CheckCircle2 className="w-5 h-5 text-emerald-500 shrink-0" />
                                <span className="text-sm font-bold">{formatPermission(p)}</span>
                            </div>
                        ))}
                    </div>
                </section>

                {/* restricted permissions */}
                <section className="bg-card border border-border rounded-2xl p-8 shadow-sm">
                    <div className="flex items-center gap-3 mb-8">
                        <div className="p-2 bg-foreground/10 rounded-lg text-foreground/30">
                            <Slash className="w-5 h-5" />
                        </div>
                        <h2 className="text-lg font-bold">Restricted System Access</h2>
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
                        {restrictedPermissions.map((p) => (
                            <div key={p} className="flex items-center gap-3 p-4 rounded-xl border bg-foreground/5 border-border text-foreground/40">
                                <Slash className="w-5 h-5 text-foreground/30 shrink-0" />
                                <span className="text-sm font-bold">{formatPermission(p)}</span>
                            </div>
                        ))}
                    </div>
                </section>
            </div>
        </div>
    );
}

