import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import apiClient from '@/api/apiClient';
import {
    Settings,
    CheckCircle2,
    Slash,
    Key,
    Users,
    Code,
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

    const [apiKey] = useState('');
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
            <div className="flex h-full items-center justify-center bg-background">
                <p className="text-foreground">Loading system access…</p>
            </div>
        );
    }
    if (isError || !data) {
        const msg = (error as Error)?.message || 'Unable to load access information.';
        return (
            <div className="flex h-full items-center justify-center bg-background">
                <p className="text-risk-critical">{msg}</p>
            </div>
        );
    }

    const enabledPermissions: string[] = data?.permissions || [];
    const restrictedPermissions: string[] = data?.restricted_permissions || [];
    const role = data?.role || '';
    const department = data?.department || '';

    return (
        <div className="p-6 md:p-8 max-w-6xl mx-auto animate-in fade-in slide-in-from-bottom-4 duration-500 pb-20">
            <div className="mb-8">
                <h1 className="text-2xl font-bold text-foreground">System Access</h1>
                <p className="text-sm text-foreground/50 mt-1 uppercase tracking-wider font-medium">Role & permission overview</p>
            </div>

            <div className="space-y-8">
                {/* role detail */}
                <section className="bg-card border border-border rounded-2xl p-8 shadow-sm">
                    <div className="flex items-center gap-3 mb-6">
                        <div className="p-2 bg-indigo-500/10 rounded-lg text-indigo-500">
                            <Users className="w-5 h-5" />
                        </div>
                        <h2 className="text-lg font-bold">Role & Access Level</h2>
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                        <div className="space-y-1.5">
                            <p className="text-[10px] text-foreground/40 font-bold uppercase tracking-widest">User Role</p>
                            <p className="text-md font-semibold text-foreground">{role}</p>
                        </div>
                        <div className="space-y-1.5">
                            <p className="text-[10px] text-foreground/40 font-bold uppercase tracking-widest">Department</p>
                            <p className="text-md font-semibold text-foreground">{department}</p>
                        </div>
                        <div className="space-y-1.5 md:col-span-2">
                            <p className="text-[10px] text-foreground/40 font-bold uppercase tracking-widest">Description</p>
                            <p className="text-md text-foreground/70">An analyst responsible for assessing container risk and monitoring system operations.</p>
                        </div>
                    </div>
                </section>

                {/* operational permissions */}
                <section className="bg-card border border-border rounded-2xl p-8 shadow-sm">
                    <div className="flex items-center gap-3 mb-6">
                        <div className="p-2 bg-emerald-500/10 rounded-lg text-emerald-500">
                            <CheckCircle2 className="w-5 h-5" />
                        </div>
                        <h2 className="text-lg font-bold">Operational Permissions</h2>
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
                        {enabledPermissions.map((p) => (
                            <div key={p} className="flex items-center gap-3 p-4 rounded-xl border bg-emerald-500/5 border-emerald-500/20 text-emerald-700">
                                <CheckCircle2 className="w-5 h-5 text-emerald-500" />
                                <span className="text-sm font-semibold">{p}</span>
                            </div>
                        ))}
                    </div>
                </section>

                {/* restricted permissions */}
                <section className="bg-card border border-border rounded-2xl p-8 shadow-sm">
                    <div className="flex items-center gap-3 mb-6">
                        <div className="p-2 bg-foreground/10 rounded-lg text-foreground/30">
                            <Slash className="w-5 h-5" />
                        </div>
                        <h2 className="text-lg font-bold">Restricted Permissions</h2>
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
                        {restrictedPermissions.map((p) => (
                            <div key={p} className="flex items-center gap-3 p-4 rounded-xl border bg-foreground/5 border-border text-foreground/40">
                                <Slash className="w-5 h-5 text-foreground/30" />
                                <span className="text-sm font-semibold">{p}</span>
                            </div>
                        ))}
                    </div>
                </section>

                {/* api access */}
                <section className="bg-card border border-border rounded-2xl p-8 shadow-sm">
                    <div className="flex items-center gap-3 mb-6">
                        <div className="p-2 bg-yellow-500/10 rounded-lg text-yellow-500">
                            <Code className="w-5 h-5" />
                        </div>
                        <h2 className="text-lg font-bold">API Access (Advanced)</h2>
                    </div>
                    <div className="space-y-4">
                        <div className="flex items-center gap-3">
                            <Key className="w-4 h-4" />
                            <span className="text-sm break-all">{apiKey}</span>
                        </div>
                        <div className="flex gap-3">
                            <button className="px-4 py-2 rounded-lg bg-primary/10 text-primary text-sm">Generate API Key</button>
                            <button className="px-4 py-2 rounded-lg border border-border bg-background text-sm">Revoke API Key</button>
                        </div>
                        <button className="px-4 py-2 rounded-lg border border-border bg-background text-sm">View API Usage</button>
                    </div>
                </section>

                {/* system information */}
                <section className="bg-card border border-border rounded-2xl p-8 shadow-sm">
                    <div className="flex items-center gap-3 mb-6">
                        <div className="p-2 bg-indigo-500/10 rounded-lg text-indigo-500">
                            <Settings className="w-5 h-5" />
                        </div>
                        <h2 className="text-lg font-bold">System Information</h2>
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
                        <div className="space-y-1.5">
                            <p className="text-[10px] text-foreground/40 font-bold uppercase tracking-widest">AI Model Version</p>
                            <p className="text-md font-semibold text-foreground">v2.3.1</p>
                        </div>
                        <div className="space-y-1.5">
                            <p className="text-[10px] text-foreground/40 font-bold uppercase tracking-widest">Last System Update</p>
                            <p className="text-md font-semibold text-foreground">2026‑03‑01</p>
                        </div>
                        <div className="space-y-1.5">
                            <p className="text-[10px] text-foreground/40 font-bold uppercase tracking-widest">Data Processing Limits</p>
                            <p className="text-md font-semibold text-foreground">5000 containers / hr</p>
                        </div>
                        <div className="space-y-1.5">
                            <p className="text-[10px] text-foreground/40 font-bold uppercase tracking-widest">Prediction Engine</p>
                            <p className="text-md font-semibold text-foreground">Active</p>
                        </div>
                    </div>
                </section>
            </div>
        </div>
    );
}
