import { useAuth } from '@/context/AuthContext';
import {
    User,
    Mail,
    Shield,
    Clock,
    CheckCircle2,
    Building2,
    Calendar,
    Activity
} from 'lucide-react';
import { cn } from '@/lib/utils';

/**
 * Enhanced Profile Page
 * Displays comprehensive user details, system permissions, and activity metadata.
 * Suitable for professional logistics/government monitoring dashboard.
 */
export default function Profile() {
    const { user } = useAuth();

    if (!user) return null;

    // User Permissions - Mocked based on 'admin' role
    const permissions = [
        { label: 'Upload Shipment Dataset', granted: true },
        { label: 'Run Risk Predictions', granted: true },
        { label: 'View Risk Dashboard', granted: true },
        { label: 'Access Container Tracking', granted: true },
        { label: 'Manage System Users', granted: user.role === 'admin' },
        { label: 'Audit Log Access', granted: user.role === 'admin' },
    ];

    return (
        <div className="p-6 md:p-8 max-w-6xl mx-auto animate-in fade-in slide-in-from-bottom-4 duration-500 pb-20">
            {/* Header / Intro */}
            <div className="mb-8">
                <h1 className="text-2xl font-bold text-foreground">User Profile</h1>
                <p className="text-sm text-foreground/50 mt-1 uppercase tracking-wider font-medium">Account & Security Management</p>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">

                {/* LEFT COLUMN: Identity & Actions */}
                <div className="lg:col-span-4 space-y-6">
                    {/* Identity Card */}
                    <div className="bg-card border border-border rounded-2xl p-6 shadow-sm overflow-hidden relative">
                        <div className="absolute top-0 left-0 w-full h-1 bg-primary" />
                        <div className="flex flex-col items-center text-center">
                            <div className="w-24 h-24 rounded-2xl bg-primary/10 flex items-center justify-center text-primary border border-primary/20 mb-4 shadow-inner">
                                <User className="w-10 h-10" />
                            </div>
                            <h2 className="text-xl font-bold text-foreground">{user.username}</h2>
                            <div className="mt-2 text-center">
                                <span className="px-2.5 py-0.5 bg-primary/10 text-primary rounded-md text-[11px] font-bold uppercase tracking-wider border border-primary/20 block mb-1">
                                    {user.role}
                                </span>
                                <span className="text-[10px] text-foreground/40 font-semibold uppercase tracking-widest">
                                    Container Security Division
                                </span>
                            </div>
                        </div>

                        <div className="mt-8 space-y-4 pt-6 border-t border-border">
                            <div className="flex items-center gap-3 text-sm">
                                <Mail className="w-4 h-4 text-foreground/30" />
                                <span className="text-foreground/70">{user.email || 'admin@smartcontainer.local'}</span>
                            </div>
                            <div className="flex items-center gap-3 text-sm">
                                <Building2 className="w-4 h-4 text-foreground/30" />
                                <span className="text-foreground/70">Risk Intelligence Unit</span>
                            </div>
                        </div>
                    </div>

                </div>

                {/* RIGHT COLUMN: Permissions & Activity */}
                <div className="lg:col-span-8 space-y-8">

                    {/* section: User Information */}
                    <section className="bg-card border border-border rounded-2xl p-8 shadow-sm">
                        {/* comment: Displays basic user identity information retrieved from the authentication service */}
                        {/* comment: This section helps identify the currently logged-in user */}
                        <div className="flex items-center gap-3 mb-8">
                            <div className="p-2 bg-blue-500/10 rounded-lg text-blue-500">
                                <Activity className="w-5 h-5" />
                            </div>
                            <h2 className="text-lg font-bold">Identity & Assignment</h2>
                        </div>

                        <div className="grid grid-cols-1 md:grid-cols-2 gap-y-8 gap-x-12">
                            <div className="space-y-1.5">
                                <p className="text-[10px] text-foreground/40 font-bold uppercase tracking-widest">Full Name</p>
                                <p className="text-md font-semibold text-foreground">Umang Rabadiya</p>
                            </div>
                            <div className="space-y-1.5">
                                <p className="text-[10px] text-foreground/40 font-bold uppercase tracking-widest">Official Email</p>
                                <p className="text-md font-semibold text-foreground">{user.email || 'umang@example.com'}</p>
                            </div>
                            <div className="space-y-1.5">
                                <p className="text-[10px] text-foreground/40 font-bold uppercase tracking-widest">System Role</p>
                                <p className="text-md font-semibold text-foreground">Risk Analyst</p>
                            </div>
                            <div className="space-y-1.5">
                                <p className="text-[10px] text-foreground/40 font-bold uppercase tracking-widest">Assigned Department</p>
                                <p className="text-md font-semibold text-foreground">Container Intelligence Unit</p>
                            </div>
                        </div>
                    </section>

                    {/* section: System Role & Permissions */}
                    <section className="bg-card border border-border rounded-2xl p-8 shadow-sm">
                        {/* comment: Shows which modules the user is authorized to access */}
                        {/* comment: Permissions should be controlled by backend role-based access control */}
                        <div className="flex items-center gap-3 mb-8">
                            <div className="p-2 bg-emerald-500/10 rounded-lg text-emerald-500">
                                <Shield className="w-5 h-5" />
                            </div>
                            <h2 className="text-lg font-bold">System Role & Permissions</h2>
                        </div>

                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            {permissions.map((p) => (
                                <div
                                    key={p.label}
                                    className={cn(
                                        "flex items-center gap-3 p-4 rounded-xl border transition-all",
                                        p.granted
                                            ? "bg-emerald-500/5 border-emerald-500/20 text-emerald-700 dark:text-emerald-400"
                                            : "bg-foreground/5 border-border text-foreground/30"
                                    )}
                                >
                                    <CheckCircle2 className={cn("w-5 h-5 shrink-0", p.granted ? "text-emerald-500" : "text-foreground/10")} />
                                    <span className="text-sm font-semibold">{p.label}</span>
                                </div>
                            ))}
                        </div>
                    </section>

                    {/* section: Activity Information */}
                    <section className="bg-card border border-border rounded-2xl p-8 shadow-sm">
                        {/* comment: Displays user activity metadata to help with security auditing */}
                        <div className="flex items-center gap-3 mb-8">
                            <div className="p-2 bg-amber-500/10 rounded-lg text-amber-500">
                                <Clock className="w-5 h-5" />
                            </div>
                            <h2 className="text-lg font-bold">Activity Information</h2>
                        </div>

                        <div className="grid grid-cols-1 sm:grid-cols-3 gap-8">
                            <div className="flex flex-col gap-1">
                                <div className="flex items-center gap-2 text-foreground/40 mb-1">
                                    <Calendar className="w-3.5 h-3.5" />
                                    <span className="text-[10px] font-bold uppercase tracking-widest">Account Created</span>
                                </div>
                                <p className="text-sm font-semibold">2025-08-11</p>
                            </div>
                            <div className="flex flex-col gap-1">
                                <div className="flex items-center gap-2 text-foreground/40 mb-1">
                                    <Activity className="w-3.5 h-3.5" />
                                    <span className="text-[10px] font-bold uppercase tracking-widest">Last Login</span>
                                </div>
                                <p className="text-sm font-semibold">2026-03-05 14:20</p>
                            </div>
                            <div className="flex flex-col gap-1">
                                <div className="flex items-center gap-2 text-foreground/40 mb-1">
                                    <Shield className="w-3.5 h-3.5" />
                                    <span className="text-[10px] font-bold uppercase tracking-widest">Active Sessions</span>
                                </div>
                                <p className="text-sm font-semibold">1 Current</p>
                            </div>
                        </div>
                    </section>

                </div>
            </div>
        </div>
    );
}
