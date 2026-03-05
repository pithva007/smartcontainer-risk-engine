import { useState, useRef, useEffect } from 'react';
import { NavLink, useNavigate } from 'react-router-dom';
import { User, Settings, Shield, LogOut, ChevronDown } from 'lucide-react';
import { useAuth } from '@/context/AuthContext';
import { cn } from '@/lib/utils';

/**
 * ProfileDropdown Component
 * Handles user avatar click and toggles dropdown menu.
 * Provides quick access to profile-related actions.
 */
export default function ProfileDropdown() {
    const { user, logout } = useAuth();
    const [isOpen, setIsOpen] = useState(false);
    const dropdownRef = useRef<HTMLDivElement>(null);
    const navigate = useNavigate();

    // Close dropdown when clicking outside
    useEffect(() => {
        function handleClickOutside(event: MouseEvent) {
            if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
                setIsOpen(false);
            }
        }
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);

    if (!user) return null;

    const navItems = [
        { label: 'View Profile', href: '/profile', icon: User },
        { label: 'Account Settings', href: '/profile', icon: Settings },
        { label: 'System Access', href: '/profile', icon: Shield },
    ];

    const handleLogout = () => {
        logout();
        navigate('/login');
    };

    return (
        <div className="relative" ref={dropdownRef}>
            {/* Trigger Button */}
            <button
                onClick={() => setIsOpen(!isOpen)}
                className="flex items-center gap-3 p-1.5 pr-3 rounded-full hover:bg-foreground/5 transition-all outline-none group"
            >
                <div className="h-8 w-8 rounded-full bg-primary/20 flex items-center justify-center text-primary border border-primary/20 group-hover:border-primary/40">
                    <User className="w-4 h-4" />
                </div>
                <div className="hidden sm:flex flex-col items-start leading-tight">
                    <span className="text-sm font-semibold text-foreground">{user.username}</span>
                    <span className="text-[10px] text-foreground/40 font-medium uppercase tracking-tighter">
                        {user.role}
                    </span>
                </div>
                <ChevronDown className={cn("w-4 h-4 text-foreground/40 transition-transform duration-200", isOpen && "rotate-180")} />
            </button>

            {/* Dropdown Menu */}
            {isOpen && (
                <div className="absolute right-0 mt-2 w-56 bg-card border border-border rounded-xl shadow-xl shadow-black/10 z-50 py-2 animate-in fade-in zoom-in-95 duration-100 origin-top-right">
                    <div className="px-4 py-3 mb-2 border-b border-border">
                        <p className="text-sm font-bold text-foreground truncate">{user.username}</p>
                        <p className="text-xs text-foreground/40 truncate">{user.email || 'System Analyst'}</p>
                    </div>

                    <div className="space-y-0.5">
                        {navItems.map((item) => (
                            <NavLink
                                key={item.label}
                                to={item.href}
                                onClick={() => setIsOpen(false)}
                                className="flex items-center gap-3 px-4 py-2.5 text-sm text-foreground/60 hover:text-foreground hover:bg-foreground/5 transition-colors"
                            >
                                <item.icon className="w-4 h-4" />
                                {item.label}
                            </NavLink>
                        ))}
                    </div>

                    <div className="mt-2 pt-2 border-t border-border">
                        <button
                            onClick={handleLogout}
                            className="w-full flex items-center gap-3 px-4 py-2.5 text-sm text-risk-critical hover:bg-risk-critical/5 transition-colors"
                        >
                            <LogOut className="w-4 h-4" />
                            Logout
                        </button>
                    </div>
                </div>
            )}
        </div>
    );
}
