import { useState, type FormEvent } from 'react';
import { X, Loader2, Eye, EyeOff } from 'lucide-react';
import { changePassword } from '@/api/routes';
import { toast } from 'react-hot-toast';

interface ChangePasswordModalProps {
    isOpen: boolean;
    onClose: () => void;
}

export default function ChangePasswordModal({ isOpen, onClose }: ChangePasswordModalProps) {
    const [currentPassword, setCurrentPassword] = useState('');
    const [newPassword, setNewPassword] = useState('');
    const [confirmPassword, setConfirmPassword] = useState('');
    const [showPassword, setShowPassword] = useState(false);
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [submitError, setSubmitError] = useState<string | null>(null);

    if (!isOpen) return null;

    const handleSubmit = async (e: FormEvent) => {
        e.preventDefault();
        setSubmitError(null);

        if (newPassword !== confirmPassword) {
            setSubmitError('New passwords do not match');
            return;
        }

        if (newPassword.length < 8) {
            setSubmitError('Password must be at least 8 characters');
            return;
        }

        setIsSubmitting(true);
        try {
            await changePassword({
                current_password: currentPassword,
                new_password: newPassword,
            });
            toast.success('Password changed successfully');

            // reset form on success since modal will close
            setCurrentPassword('');
            setNewPassword('');
            setConfirmPassword('');
            setSubmitError(null);
            onClose();
        } catch (error: any) {
            const msg = error.response?.data?.error?.message || 'Failed to change password';
            setSubmitError(msg);
        } finally {
            setIsSubmitting(false);
        }
    };

    const handleClose = () => {
        setSubmitError(null);
        onClose();
    };

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-background/80 backdrop-blur-sm animate-in fade-in duration-200">
            <div className="bg-card w-full max-w-md rounded-2xl border border-border shadow-2xl overflow-hidden animate-in zoom-in-95 duration-200">
                <div className="flex items-center justify-between px-6 py-4 border-b border-border bg-foreground/[0.02]">
                    <h2 className="text-lg font-bold text-foreground">Change Password</h2>
                    <button
                        onClick={handleClose}
                        className="p-2 text-foreground/40 hover:text-foreground hover:bg-foreground/5 rounded-full transition-colors"
                    >
                        <X className="w-5 h-5" />
                    </button>
                </div>

                <form onSubmit={handleSubmit} className="p-6 space-y-5">
                    {submitError && (
                        <div className="p-4 bg-risk-critical/10 border border-risk-critical/20 rounded-xl text-risk-critical text-xs font-bold animate-in slide-in-from-top-2 duration-300">
                            {submitError}
                        </div>
                    )}
                    <div className="space-y-1.5 relative">
                        <label className="text-xs font-bold text-foreground/60 uppercase tracking-wider">Current Password</label>
                        <input
                            type={showPassword ? 'text' : 'password'}
                            value={currentPassword}
                            onChange={(e) => setCurrentPassword(e.target.value)}
                            required
                            className="w-full px-4 py-2.5 pr-10 bg-background border border-border rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-primary/50 transition-shadow"
                            placeholder="••••••••"
                        />
                        <button
                            type="button"
                            onClick={() => setShowPassword(!showPassword)}
                            className="absolute right-3 top-[28px] text-foreground/40 hover:text-foreground transition-colors"
                        >
                            {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                        </button>
                    </div>

                    <div className="space-y-1.5">
                        <label className="text-xs font-bold text-foreground/60 uppercase tracking-wider">New Password</label>
                        <input
                            type={showPassword ? 'text' : 'password'}
                            value={newPassword}
                            onChange={(e) => setNewPassword(e.target.value)}
                            required
                            className="w-full px-4 py-2.5 bg-background border border-border rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-primary/50 transition-shadow"
                            placeholder="••••••••"
                        />
                    </div>

                    <div className="space-y-1.5">
                        <label className="text-xs font-bold text-foreground/60 uppercase tracking-wider">Confirm New Password</label>
                        <input
                            type={showPassword ? 'text' : 'password'}
                            value={confirmPassword}
                            onChange={(e) => setConfirmPassword(e.target.value)}
                            required
                            className="w-full px-4 py-2.5 bg-background border border-border rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-primary/50 transition-shadow"
                            placeholder="••••••••"
                        />
                    </div>

                    <div className="pt-4 flex justify-end gap-3">
                        <button
                            type="button"
                            onClick={onClose}
                            className="px-5 py-2.5 rounded-xl text-sm font-semibold text-foreground/60 hover:text-foreground hover:bg-foreground/5 transition-colors"
                        >
                            Cancel
                        </button>
                        <button
                            type="submit"
                            disabled={isSubmitting || !currentPassword || !newPassword || !confirmPassword}
                            className="flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-bold bg-primary text-primary-foreground hover:bg-primary/90 transition-colors disabled:opacity-50"
                        >
                            {isSubmitting ? (
                                <>
                                    <Loader2 className="w-4 h-4 animate-spin" />
                                    Updating...
                                </>
                            ) : (
                                'Update Password'
                            )}
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
}
