import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/context/AuthContext';
import { Loader2, Lock, User, Eye, EyeOff } from 'lucide-react';
import toast from 'react-hot-toast';

export default function Login() {
    const [username, setUsername] = useState('');
    const [password, setPassword] = useState('');
    const [showPassword, setShowPassword] = useState(false);
    const [loading, setLoading] = useState(false);
    const { login } = useAuth();
    const navigate = useNavigate();

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setLoading(true);
        try {
            await login(username, password);
            navigate('/');
        } catch (err: any) {
            console.error('[Login Error]', err);
            const message = err?.response?.data?.message || err.message || 'Connection failed';
            if (err?.response?.status === 401) {
                toast.error('Invalid credentials. Please try again.');
            } else {
                toast.error(`System Error: ${message}`);
            }
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="min-h-screen flex items-center justify-center bg-background dark">
            <div className="w-full max-w-sm px-4">
                <div className="text-center mb-8">
                    <h1 className="text-2xl font-bold">
                        <span className="text-primary">Smart</span>
                        <span className="text-foreground">Container</span>
                    </h1>
                    <p className="text-sm text-foreground/60 mt-1">Risk Intelligence Platform</p>
                </div>

                <div className="bg-card border border-border rounded-xl p-8 shadow-sm">
                    <h2 className="text-lg font-semibold text-foreground mb-6">Sign in to your account</h2>
                    <form onSubmit={handleSubmit} className="space-y-4">
                        <div>
                            <label className="block text-xs font-medium text-foreground/70 uppercase tracking-wider mb-1.5">
                                Username
                            </label>
                            <div className="relative">
                                <User className="absolute left-3 top-2.5 w-4 h-4 text-foreground/30" />
                                <input
                                    type="text"
                                    required
                                    value={username}
                                    onChange={e => setUsername(e.target.value)}
                                    className="w-full pl-9 pr-4 py-2 bg-background border border-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary/40"
                                    placeholder="admin"
                                />
                            </div>
                        </div>
                        <div>
                            <label className="block text-xs font-medium text-foreground/70 uppercase tracking-wider mb-1.5">
                                Password
                            </label>
                            <div className="relative">
                                <Lock className="absolute left-3 top-2.5 w-4 h-4 text-foreground/30" />
                                <input
                                    type={showPassword ? 'text' : 'password'}
                                    required
                                    value={password}
                                    onChange={e => setPassword(e.target.value)}
                                    className="w-full pl-9 pr-10 py-2 bg-background border border-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary/40"
                                    placeholder="••••••••"
                                />
                                <button
                                    type="button"
                                    onClick={() => setShowPassword(v => !v)}
                                    className="absolute right-3 top-2.5 text-foreground/40 hover:text-foreground/70"
                                    tabIndex={-1}
                                >
                                    {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                                </button>
                            </div>
                        </div>
                        <button
                            type="submit"
                            disabled={loading}
                            className="w-full py-2.5 bg-primary text-white rounded-lg font-medium text-sm hover:bg-primary/90 disabled:opacity-50 flex items-center justify-center gap-2 mt-2"
                        >
                            {loading
                                ? <><Loader2 className="w-4 h-4 animate-spin" /> Signing in...</>
                                : 'Sign In'
                            }
                        </button>
                    </form>
                </div>

                <p className="text-center text-xs text-foreground/40 mt-6">
                    SmartContainer Risk Engine v2.0
                </p>
            </div>
        </div>
    );
}
