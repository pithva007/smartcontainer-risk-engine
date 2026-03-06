import { useState, type FormEvent, useEffect } from 'react';
import { X, Loader2 } from 'lucide-react';
import { updateProfile } from '@/api/routes';
import { toast } from 'react-hot-toast';
import type { AuthUser } from '@/types/apiTypes';

interface EditProfileModalProps {
    isOpen: boolean;
    onClose: () => void;
    user: AuthUser;
    onProfileUpdated: (updatedUser: AuthUser) => void;
}

export default function EditProfileModal({ isOpen, onClose, user, onProfileUpdated }: EditProfileModalProps) {
    const [fullName, setFullName] = useState(user.full_name || '');
    const [email, setEmail] = useState(user.email || '');
    const [department, setDepartment] = useState(user.department || '');
    const [isSubmitting, setIsSubmitting] = useState(false);

    useEffect(() => {
        if (isOpen) {
            setFullName(user.full_name || '');
            setEmail(user.email || '');
            setDepartment(user.department || '');
        }
    }, [isOpen, user]);

    if (!isOpen) return null;

    const handleSubmit = async (e: FormEvent) => {
        e.preventDefault();
        setIsSubmitting(true);
        try {
            const updatedUser = await updateProfile({
                full_name: fullName,
                email,
                department,
            });
            onProfileUpdated(updatedUser);
            toast.success('Profile updated successfully');
            onClose();
        } catch (error: any) {
            const msg = error.response?.data?.error?.message || 'Failed to update profile';
            toast.error(msg);
        } finally {
            setIsSubmitting(false);
        }
    };

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-background/80 backdrop-blur-sm animate-in fade-in duration-200">
            <div className="bg-card w-full max-w-md rounded-2xl border border-border shadow-2xl overflow-hidden animate-in zoom-in-95 duration-200">
                <div className="flex items-center justify-between px-6 py-4 border-b border-border bg-foreground/[0.02]">
                    <h2 className="text-lg font-bold text-foreground">Edit Profile</h2>
                    <button
                        onClick={onClose}
                        className="p-2 text-foreground/40 hover:text-foreground hover:bg-foreground/5 rounded-full transition-colors"
                    >
                        <X className="w-5 h-5" />
                    </button>
                </div>

                <form onSubmit={handleSubmit} className="p-6 space-y-5">
                    <div className="space-y-1.5">
                        <label className="text-xs font-bold text-foreground/60 uppercase tracking-wider">Full Name</label>
                        <input
                            type="text"
                            value={fullName}
                            onChange={(e) => setFullName(e.target.value)}
                            className="w-full px-4 py-2.5 bg-background border border-border rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-primary/50 transition-shadow"
                            placeholder="John Doe"
                        />
                    </div>

                    <div className="space-y-1.5">
                        <label className="text-xs font-bold text-foreground/60 uppercase tracking-wider">Official Email</label>
                        <input
                            type="email"
                            value={email}
                            onChange={(e) => setEmail(e.target.value)}
                            className="w-full px-4 py-2.5 bg-background border border-border rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-primary/50 transition-shadow"
                            placeholder="officer@smartcontainer.local"
                        />
                    </div>

                    <div className="space-y-1.5">
                        <label className="text-xs font-bold text-foreground/60 uppercase tracking-wider">Department</label>
                        <input
                            type="text"
                            value={department}
                            onChange={(e) => setDepartment(e.target.value)}
                            className="w-full px-4 py-2.5 bg-background border border-border rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-primary/50 transition-shadow"
                            placeholder="Risk Intelligence Unit"
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
                            disabled={isSubmitting}
                            className="flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-bold bg-primary text-primary-foreground hover:bg-primary/90 transition-colors disabled:opacity-50"
                        >
                            {isSubmitting ? (
                                <>
                                    <Loader2 className="w-4 h-4 animate-spin" />
                                    Saving...
                                </>
                            ) : (
                                'Save Changes'
                            )}
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
}
