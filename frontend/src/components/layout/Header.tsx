import { useState, useEffect } from 'react';
import { Bell, Sun, Moon } from 'lucide-react';
import ProfileDropdown from './ProfileDropdown';

export default function Header() {
    const [dark, setDark] = useState(true);

    useEffect(() => {
        document.documentElement.classList.toggle('dark', dark);
        localStorage.setItem('theme', dark ? 'dark' : 'light');
    }, [dark]);

    // On mount, check localStorage
    useEffect(() => {
        const saved = localStorage.getItem('theme');
        if (saved === 'light') setDark(false);
        else setDark(true); // default dark
    }, []);

    return (
        <header className="h-16 bg-card border-b border-border flex items-center justify-between px-6 sticky top-0 z-10">
            <div className="flex-1" />
            <div className="flex items-center gap-4">
                <button
                    onClick={() => setDark(!dark)}
                    className="p-2 rounded-full text-foreground/60 hover:bg-foreground/5 hover:text-foreground transition-colors"
                    aria-label="Toggle theme"
                >
                    {dark ? <Sun className="w-5 h-5" /> : <Moon className="w-5 h-5" />}
                </button>
                <div className="relative">
                    <button className="p-2 rounded-full text-foreground/60 hover:bg-foreground/5 hover:text-foreground transition-colors">
                        <Bell className="w-5 h-5" />
                        <span className="absolute top-1.5 right-1.5 h-2 w-2 rounded-full bg-risk-critical ring-2 ring-card" />
                    </button>
                </div>
                <div className="w-px h-6 bg-border mx-1" />
                <ProfileDropdown />
            </div>
        </header>
    );
}
