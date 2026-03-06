import { NavLink } from 'react-router-dom';
import {
    LayoutDashboard,
    UploadCloud,
    Crosshair,
    Map,
    Route,
    BarChart2,
    FlaskConical,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import logo from '@/assets/logo.png';

const links = [
    { to: '/', label: 'Dashboard', icon: LayoutDashboard },
    { to: '/upload', label: 'Upload Dataset', icon: UploadCloud },
    { to: '/predict', label: 'Single Prediction', icon: Crosshair },
    { to: '/simulator', label: 'Risk Simulator', icon: FlaskConical },
    { to: '/map', label: 'Map Monitoring', icon: Map },
    { to: '/tracking', label: 'Tracking', icon: Route },
    { to: '/analytics', label: 'Insights', icon: BarChart2 },
];

export default function Sidebar() {
    return (
        <aside className="w-64 shrink-0 bg-sidebar border-r border-border flex flex-col h-screen sticky top-0 z-20">
            {/* Logo */}
            <div className="flex items-center h-16 px-5 border-b border-border">
                <img src={logo} alt="SmartContainer" className="h-15 w-full w-auto object-contain" />
            </div>

            {/* Navigation */}
            <nav className="flex-1 overflow-y-auto py-4 px-3 space-y-1">
                {links.map((link) => (
                    <NavLink
                        key={link.to}
                        to={link.to}
                        end={link.to === '/'}
                        className={({ isActive }) =>
                            cn(
                                'flex items-center gap-3 px-3 py-2.5 text-sm font-medium rounded-lg transition-all duration-200',
                                isActive
                                    ? 'bg-primary/10 text-primary'
                                    : 'text-foreground/60 hover:bg-foreground/5 hover:text-foreground'
                            )
                        }
                    >
                        <link.icon className="w-5 h-5 shrink-0" />
                        <span className="truncate">{link.label}</span>
                    </NavLink>
                ))}
            </nav>

            {/* Footer */}
            <div className="p-4 border-t border-border">
                <p className="text-xs text-muted text-center">Risk Engine v2.0</p>
            </div>
        </aside>
    );
}
