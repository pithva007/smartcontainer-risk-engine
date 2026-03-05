import { useState, useEffect } from 'react';
import { Bell, User, Sun, Moon } from 'lucide-react';

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
            <div className="flex items-center gap-3">
                <button
                    onClick={() => setDark(!dark)}
                    className="p-2 rounded-full text-foreground/60 hover:bg-foreground/5 hover:text-foreground transition-colors"
                    aria-label="Toggle theme"
                >
                    {dark ? <Sun className="w-5 h-5" /> : <Moon className="w-5 h-5" />}
                </button>
                <button className="p-2 rounded-full text-foreground/60 hover:bg-foreground/5 hover:text-foreground transition-colors relative">
                    <Bell className="w-5 h-5" />
                    <span className="absolute top-1.5 right-1.5 h-2 w-2 rounded-full bg-risk-critical ring-2 ring-card" />
                </button>
                <div className="h-8 w-8 rounded-full bg-primary/20 flex items-center justify-center text-primary cursor-pointer">
                    <User className="w-4 h-4" />
                </div>
            </div>
        </header>
    );
}
