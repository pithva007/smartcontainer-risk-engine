import { useEffect, useState, useCallback } from 'react';
import { fetchContainerLocation } from '@/api/routes';
import { MapContainer, TileLayer, useMap, CircleMarker, Popup, Polyline } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import type { RiskLevel, ContainerLocation } from '@/types/apiTypes';
import { cn, riskBgClass } from '@/lib/utils';
import { Search, Loader2, X, MapPin, AlertTriangle, Shield, Navigation, Info } from 'lucide-react';

// ─── Fix default marker icons ───────────────────────────────────────────────
L.Icon.Default.mergeOptions({
    iconUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
    iconRetinaUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png',
    shadowUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
});

// ─── Risk colors for tracked container markers ───────────────────────────────
const markerColor: Record<RiskLevel, string> = {
    Critical: '#ef4444',
    'Low Risk': '#f59e0b',
    Clear: '#10b981',
};

// ─── Major world ports for the initial map view ──────────────────────────────
const WORLD_PORTS: Array<{ name: string; country: string; lat: number; lng: number; type?: 'mega' | 'major' | 'regional' }> = [
    // East Asia
    { name: 'Shanghai', country: 'China', lat: 31.2304, lng: 121.4737, type: 'mega' },
    { name: 'Shenzhen (Yantian)', country: 'China', lat: 22.5665, lng: 114.2817, type: 'mega' },
    { name: 'Ningbo-Zhoushan', country: 'China', lat: 29.9590, lng: 121.8070, type: 'mega' },
    { name: 'Guangzhou Nansha', country: 'China', lat: 22.7874, lng: 113.5244, type: 'mega' },
    { name: 'Qingdao', country: 'China', lat: 36.0671, lng: 120.3826, type: 'major' },
    { name: 'Tianjin', country: 'China', lat: 39.3434, lng: 117.3616, type: 'major' },
    { name: 'Dalian', country: 'China', lat: 38.9140, lng: 121.6147, type: 'major' },
    { name: 'Xiamen', country: 'China', lat: 24.4798, lng: 118.0894, type: 'major' },
    { name: 'Hong Kong', country: 'Hong Kong', lat: 22.3193, lng: 114.1694, type: 'mega' },
    { name: 'Busan', country: 'South Korea', lat: 35.1796, lng: 129.0756, type: 'mega' },
    { name: 'Incheon', country: 'South Korea', lat: 37.4563, lng: 126.7052, type: 'major' },
    { name: 'Gwangyang', country: 'South Korea', lat: 34.9242, lng: 127.6933, type: 'major' },
    { name: 'Yokohama', country: 'Japan', lat: 35.4437, lng: 139.6380, type: 'major' },
    { name: 'Nagoya', country: 'Japan', lat: 35.1815, lng: 136.9066, type: 'major' },
    { name: 'Osaka/Kobe', country: 'Japan', lat: 34.6901, lng: 135.1956, type: 'major' },
    { name: 'Tokyo', country: 'Japan', lat: 35.6762, lng: 139.6503, type: 'major' },
    { name: 'Kaohsiung', country: 'Taiwan', lat: 22.6273, lng: 120.3014, type: 'major' },
    // Southeast Asia
    { name: 'Singapore', country: 'Singapore', lat: 1.2966, lng: 103.7764, type: 'mega' },
    { name: 'Tanjung Pelepas', country: 'Malaysia', lat: 1.3631, lng: 103.5494, type: 'major' },
    { name: 'Port Klang', country: 'Malaysia', lat: 3.0000, lng: 101.4000, type: 'major' },
    { name: 'Penang', country: 'Malaysia', lat: 5.4141, lng: 100.3288, type: 'regional' },
    { name: 'Tanjung Priok', country: 'Indonesia', lat: -6.1017, lng: 106.8805, type: 'major' },
    { name: 'Surabaya', country: 'Indonesia', lat: -7.2575, lng: 112.7521, type: 'regional' },
    { name: 'Laem Chabang', country: 'Thailand', lat: 13.0880, lng: 100.8803, type: 'major' },
    { name: 'Cat Lai (Ho Chi Minh)', country: 'Vietnam', lat: 10.7769, lng: 106.7535, type: 'major' },
    { name: 'Haiphong', country: 'Vietnam', lat: 20.8449, lng: 106.6881, type: 'regional' },
    { name: 'Manila', country: 'Philippines', lat: 14.5995, lng: 120.9842, type: 'major' },
    { name: 'Thilawa', country: 'Myanmar', lat: 16.7027, lng: 96.2761, type: 'regional' },
    { name: 'Sihanoukville', country: 'Cambodia', lat: 10.6094, lng: 103.5297, type: 'regional' },
    // South Asia
    { name: 'JNPT / Nhava Sheva', country: 'India', lat: 18.9488, lng: 72.9540, type: 'major' },
    { name: 'Mundra', country: 'India', lat: 22.7500, lng: 69.7000, type: 'major' },
    { name: 'Chennai', country: 'India', lat: 13.0827, lng: 80.2707, type: 'major' },
    { name: 'Kolkata / Haldia', country: 'India', lat: 22.0667, lng: 88.0833, type: 'major' },
    { name: 'Cochin', country: 'India', lat: 9.9312, lng: 76.2673, type: 'regional' },
    { name: 'Colombo', country: 'Sri Lanka', lat: 6.9271, lng: 79.8612, type: 'mega' },
    { name: 'Karachi', country: 'Pakistan', lat: 24.8607, lng: 67.0011, type: 'major' },
    { name: 'Port Qasim', country: 'Pakistan', lat: 24.7700, lng: 67.3200, type: 'major' },
    { name: 'Chittagong', country: 'Bangladesh', lat: 22.3569, lng: 91.7832, type: 'major' },
    // Middle East
    { name: 'Jebel Ali', country: 'UAE', lat: 25.0008, lng: 55.0880, type: 'mega' },
    { name: 'Abu Dhabi (Khalifa)', country: 'UAE', lat: 24.8051, lng: 54.6463, type: 'major' },
    { name: 'Sohar', country: 'Oman', lat: 24.3476, lng: 56.7440, type: 'regional' },
    { name: 'Salmabad', country: 'Bahrain', lat: 26.1530, lng: 50.5000, type: 'regional' },
    { name: 'Shuwaikh', country: 'Kuwait', lat: 29.3648, lng: 47.9261, type: 'regional' },
    { name: 'Jeddah', country: 'Saudi Arabia', lat: 21.4858, lng: 39.1925, type: 'major' },
    { name: 'Dammam', country: 'Saudi Arabia', lat: 26.4207, lng: 50.0888, type: 'major' },
    { name: 'Aqaba', country: 'Jordan', lat: 29.5266, lng: 35.0061, type: 'regional' },
    { name: 'Umm Qasr', country: 'Iraq', lat: 30.0298, lng: 47.9244, type: 'regional' },
    { name: 'Bandar Abbas', country: 'Iran', lat: 27.1865, lng: 56.2808, type: 'major' },
    { name: 'Mersin', country: 'Turkey', lat: 36.7892, lng: 34.6218, type: 'major' },
    { name: 'Istanbul', country: 'Turkey', lat: 41.0082, lng: 28.9784, type: 'major' },
    { name: 'Haifa', country: 'Israel', lat: 32.7940, lng: 34.9896, type: 'regional' },
    // Europe
    { name: 'Rotterdam', country: 'Netherlands', lat: 51.9244, lng: 4.4777, type: 'mega' },
    { name: 'Antwerp', country: 'Belgium', lat: 51.2194, lng: 4.4025, type: 'mega' },
    { name: 'Hamburg', country: 'Germany', lat: 53.5753, lng: 9.8689, type: 'mega' },
    { name: 'Bremerhaven', country: 'Germany', lat: 53.5396, lng: 8.5809, type: 'major' },
    { name: 'Felixstowe', country: 'UK', lat: 51.9625, lng: 1.3514, type: 'major' },
    { name: 'Southampton', country: 'UK', lat: 50.9097, lng: -1.4044, type: 'major' },
    { name: 'Le Havre', country: 'France', lat: 49.4938, lng: 0.1078, type: 'major' },
    { name: 'Marseille', country: 'France', lat: 43.2965, lng: 5.3698, type: 'major' },
    { name: 'Algeciras', country: 'Spain', lat: 36.1408, lng: -5.4548, type: 'mega' },
    { name: 'Barcelona', country: 'Spain', lat: 41.3851, lng: 2.1734, type: 'major' },
    { name: 'Valencia', country: 'Spain', lat: 39.4699, lng: -0.3763, type: 'major' },
    { name: 'Sines', country: 'Portugal', lat: 37.9576, lng: -8.8670, type: 'major' },
    { name: 'Genoa', country: 'Italy', lat: 44.4056, lng: 8.9463, type: 'major' },
    { name: 'Gioia Tauro', country: 'Italy', lat: 38.4267, lng: 15.9014, type: 'major' },
    { name: 'Piraeus', country: 'Greece', lat: 37.9476, lng: 23.6348, type: 'mega' },
    { name: 'Marsaxlokk', country: 'Malta', lat: 35.8490, lng: 14.5443, type: 'major' },
    { name: 'Gothenburg', country: 'Sweden', lat: 57.7089, lng: 11.9746, type: 'major' },
    { name: 'Gdansk', country: 'Poland', lat: 54.3520, lng: 18.6466, type: 'major' },
    { name: 'Novorossiysk', country: 'Russia', lat: 44.7230, lng: 37.7687, type: 'major' },
    { name: 'St. Petersburg', country: 'Russia', lat: 59.9311, lng: 30.3609, type: 'major' },
    { name: 'Vladivostok', country: 'Russia', lat: 43.1332, lng: 131.9113, type: 'major' },
    { name: 'Constanta', country: 'Romania', lat: 44.1598, lng: 28.6348, type: 'regional' },
    { name: 'Koper', country: 'Slovenia', lat: 45.5469, lng: 13.7300, type: 'regional' },
    { name: 'Odessa', country: 'Ukraine', lat: 46.4825, lng: 30.7233, type: 'regional' },
    // Americas
    { name: 'New York / New Jersey', country: 'USA', lat: 40.6640, lng: -74.2130, type: 'mega' },
    { name: 'Los Angeles / Long Beach', country: 'USA', lat: 33.7490, lng: -118.2000, type: 'mega' },
    { name: 'Savannah', country: 'USA', lat: 32.0835, lng: -81.0998, type: 'major' },
    { name: 'Houston', country: 'USA', lat: 29.7604, lng: -95.3698, type: 'major' },
    { name: 'Seattle / Tacoma', country: 'USA', lat: 47.4529, lng: -122.3443, type: 'major' },
    { name: 'Norfolk', country: 'USA', lat: 36.8508, lng: -76.2859, type: 'major' },
    { name: 'Baltimore', country: 'USA', lat: 39.2904, lng: -76.6122, type: 'major' },
    { name: 'Charleston', country: 'USA', lat: 32.7765, lng: -79.9311, type: 'major' },
    { name: 'Miami / Port Everglades', country: 'USA', lat: 26.0000, lng: -80.1500, type: 'major' },
    { name: 'New Orleans', country: 'USA', lat: 29.9511, lng: -90.0715, type: 'regional' },
    { name: 'Vancouver', country: 'Canada', lat: 49.2827, lng: -123.1207, type: 'major' },
    { name: 'Montreal', country: 'Canada', lat: 45.5017, lng: -73.5673, type: 'major' },
    { name: 'Prince Rupert', country: 'Canada', lat: 54.3150, lng: -130.3208, type: 'regional' },
    { name: 'Manzanillo', country: 'Mexico', lat: 19.0524, lng: -104.3187, type: 'major' },
    { name: 'Veracruz', country: 'Mexico', lat: 19.1738, lng: -96.1342, type: 'major' },
    { name: 'Santos', country: 'Brazil', lat: -23.9608, lng: -46.3334, type: 'mega' },
    { name: 'Paranagua', country: 'Brazil', lat: -25.5127, lng: -48.5089, type: 'major' },
    { name: 'Itajai', country: 'Brazil', lat: -26.9101, lng: -48.6614, type: 'major' },
    { name: 'Buenos Aires', country: 'Argentina', lat: -34.6037, lng: -58.3816, type: 'major' },
    { name: 'Valparaiso / San Antonio', country: 'Chile', lat: -33.3200, lng: -71.3650, type: 'major' },
    { name: 'Callao', country: 'Peru', lat: -12.0566, lng: -77.1182, type: 'major' },
    { name: 'Guayaquil', country: 'Ecuador', lat: -2.1894, lng: -79.8891, type: 'major' },
    { name: 'Cartagena', country: 'Colombia', lat: 10.3910, lng: -75.4794, type: 'mega' },
    { name: 'Buenaventura', country: 'Colombia', lat: 3.8833, lng: -77.0433, type: 'major' },
    { name: 'Colon / Manzanillo', country: 'Panama', lat: 9.3547, lng: -79.9003, type: 'mega' },
    { name: 'Kingston', country: 'Jamaica', lat: 17.9714, lng: -76.7920, type: 'regional' },
    { name: 'Puerto Cabello', country: 'Venezuela', lat: 10.4758, lng: -68.0137, type: 'regional' },
    // Africa
    { name: 'Port Said', country: 'Egypt', lat: 31.2565, lng: 32.2844, type: 'mega' },
    { name: 'Alexandria', country: 'Egypt', lat: 31.2001, lng: 29.9187, type: 'major' },
    { name: 'Tanger Med', country: 'Morocco', lat: 35.8811, lng: -5.5038, type: 'mega' },
    { name: 'Casablanca', country: 'Morocco', lat: 33.5731, lng: -7.5898, type: 'major' },
    { name: 'Djibouti', country: 'Djibouti', lat: 11.5883, lng: 43.1450, type: 'major' },
    { name: 'Durban', country: 'South Africa', lat: -29.8587, lng: 31.0218, type: 'major' },
    { name: 'Cape Town', country: 'South Africa', lat: -33.9249, lng: 18.4241, type: 'major' },
    { name: 'Mombasa', country: 'Kenya', lat: -4.0435, lng: 39.6682, type: 'major' },
    { name: 'Dar es Salaam', country: 'Tanzania', lat: -6.7924, lng: 39.2083, type: 'major' },
    { name: 'Apapa (Lagos)', country: 'Nigeria', lat: 6.4500, lng: 3.3500, type: 'major' },
    { name: 'Tema', country: 'Ghana', lat: 5.6345, lng: 0.0100, type: 'major' },
    { name: 'Abidjan', country: 'Ivory Coast', lat: 5.3600, lng: -4.0083, type: 'major' },
    { name: 'Dakar', country: 'Senegal', lat: 14.7167, lng: -17.4677, type: 'regional' },
    { name: 'Luanda', country: 'Angola', lat: -8.8368, lng: 13.2343, type: 'regional' },
    { name: 'Douala', country: 'Cameroon', lat: 4.0511, lng: 9.7679, type: 'regional' },
    { name: 'Berbera', country: 'Somalia', lat: 10.4397, lng: 45.0141, type: 'regional' },
    // Oceania
    { name: 'Sydney', country: 'Australia', lat: -33.8688, lng: 151.2093, type: 'major' },
    { name: 'Melbourne', country: 'Australia', lat: -37.8136, lng: 144.9631, type: 'major' },
    { name: 'Brisbane', country: 'Australia', lat: -27.4698, lng: 153.0251, type: 'major' },
    { name: 'Fremantle', country: 'Australia', lat: -32.0569, lng: 115.7440, type: 'major' },
    { name: 'Auckland', country: 'New Zealand', lat: -36.8485, lng: 174.7633, type: 'major' },
    { name: 'Tauranga', country: 'New Zealand', lat: -37.6870, lng: 176.1654, type: 'regional' },
    { name: 'Suva', country: 'Fiji', lat: -18.1416, lng: 178.4415, type: 'regional' },
];

// ─── Fly-to helper — fires onComplete after animation ends ────────────────
function FlyToLocation({ lat, lng, onComplete }: { lat: number; lng: number; onComplete: () => void }) {
    const map = useMap();
    useEffect(() => {
        map.flyTo([lat, lng], 6, { animate: true, duration: 1.8, easeLinearity: 0.15 });
        // Hide the marker until the zoom animation finishes
        const handleEnd = () => onComplete();
        map.once('moveend', handleEnd);
        return () => { map.off('moveend', handleEnd); };
    }, [lat, lng, map, onComplete]);
    return null;
}

// ─── Score bar ───────────────────────────────────────────────────────────────
function ScoreBar({ score }: { score: number }) {
    const pct = Math.round((score ?? 0) * 100);
    const color = pct >= 70 ? '#ef4444' : pct >= 40 ? '#f59e0b' : '#10b981';
    return (
        <div className="flex items-center gap-2">
            <div className="flex-1 h-1.5 bg-foreground/10 rounded-full overflow-hidden">
                <div className="h-full rounded-full" style={{ width: `${pct}%`, backgroundColor: color }} />
            </div>
            <span className="text-xs font-mono font-semibold text-foreground/70 w-8 text-right">{pct}</span>
        </div>
    );
}

// ─── Tracked Container Info Panel ────────────────────────────────────────────
function TrackedPanel({ loc, onClose, showRoute, onRouteToggle }: {
    loc: ContainerLocation;
    onClose: () => void;
    showRoute: boolean;
    onRouteToggle: () => void;
}) {
    const risk = loc.risk_level;
    const [minimized, setMinimized] = useState(false);

    const statusColor: Record<string, string> = {
        cleared: 'text-emerald-400 bg-emerald-500/10 border-emerald-500/20',
        transit: 'text-blue-400 bg-blue-500/10 border-blue-500/20',
        pending: 'text-amber-400 bg-amber-500/10 border-amber-500/20',
    };
    const cs = (loc.clearance_status || 'pending').toLowerCase();
    const dotColor = cs === 'cleared' ? '#10b981' : cs === 'transit' ? '#3b82f6' : '#f59e0b';

    return (
        <div className="absolute top-4 right-4 w-80 bg-card border border-border rounded-xl shadow-xl z-[1000] overflow-hidden animate-in slide-in-from-right duration-300 transition-all">
            {/* Header — always visible */}
            <div
                className="flex items-center justify-between px-4 py-3 bg-foreground/5 cursor-pointer select-none"
                onClick={() => setMinimized(m => !m)}
            >
                <div className="flex items-center gap-2">
                    <span className="w-2 h-2 rounded-full animate-pulse shrink-0" style={{ backgroundColor: markerColor[risk] }} />
                    <Shield className="w-4 h-4 text-primary" />
                    <span className="font-mono font-bold text-foreground text-sm">{loc.container_id}</span>
                    {minimized && (
                        <span className={cn('px-2 py-0.5 rounded-full text-[10px] font-semibold border ml-1', statusColor[cs] ?? 'text-foreground/40 bg-foreground/5 border-border')}>
                            {loc.clearance_status || 'Pending'}
                        </span>
                    )}
                </div>
                <div className="flex items-center gap-1">
                    <button
                        onClick={(e) => { e.stopPropagation(); setMinimized(m => !m); }}
                        className="p-1 hover:bg-foreground/10 rounded text-foreground/40 hover:text-foreground transition-colors"
                        title={minimized ? 'Expand' : 'Minimise'}
                    >
                        <svg className={cn('w-4 h-4 transition-transform duration-300', minimized ? 'rotate-180' : '')} fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" d="M5 15l7-7 7 7" />
                        </svg>
                    </button>
                    <button onClick={(e) => { e.stopPropagation(); onClose(); }} className="p-1 hover:bg-foreground/10 rounded text-foreground/40 hover:text-foreground transition-colors" title="Close">
                        <X className="w-4 h-4" />
                    </button>
                </div>
            </div>

            {/* Collapsible body */}
            <div className={cn('transition-all duration-300 overflow-hidden', minimized ? 'max-h-0' : 'max-h-[600px]')}>
                <div className="p-4 space-y-4 text-sm border-t border-border">
                    <div className="flex items-start gap-3 p-3 rounded-lg bg-primary/5 border border-primary/20">
                        <Navigation className="w-4 h-4 text-primary mt-0.5" />
                        <div>
                            <p className="text-[10px] uppercase tracking-wider text-foreground/40 font-medium">Current Location</p>
                            <p className="font-semibold text-foreground">{loc.current_port}</p>
                            <p className="text-xs text-foreground/50">{loc.country}</p>
                        </div>
                    </div>
                    <div className={cn("inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold border", statusColor[cs] ?? 'text-foreground/60 bg-foreground/5 border-border')}>
                        <span className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: dotColor }} />
                        {loc.clearance_status || 'Pending'}
                    </div>
                    <div>
                        <p className="text-[10px] uppercase tracking-wider text-foreground/40 font-medium mb-1.5">Risk Score</p>
                        <ScoreBar score={loc.risk_score} />
                    </div>
                    <div className="flex items-center gap-2">
                        <span className={cn('px-2 py-0.5 rounded-full text-xs font-semibold border', riskBgClass[risk])}>{risk}</span>
                        {loc.anomaly_flag && (
                            <span className="px-2 py-0.5 rounded-full text-xs font-semibold border border-red-500/30 bg-red-500/10 text-red-400 flex items-center gap-1">
                                <AlertTriangle className="w-2.5 h-2.5" /> Anomaly
                            </span>
                        )}
                    </div>
                    <div>
                        <div className="flex items-center justify-between mb-2">
                            <p className="text-[10px] uppercase tracking-wider text-foreground/40 font-medium">Shipment Route</p>
                            <button
                                onClick={onRouteToggle}
                                className={cn(
                                    'flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold border transition-all shadow-sm',
                                    showRoute
                                        ? 'bg-primary border-primary text-white shadow-primary/30'
                                        : 'bg-foreground/8 border-border text-foreground/60 hover:border-primary/50 hover:text-primary hover:bg-primary/5'
                                )}
                            >
                                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" d="M9 20l-5.447-2.724A1 1 0 013 16.382V5.618a1 1 0 011.447-.894L9 7m0 13l6-3m-6 3V7m6 10l4.553 2.276A1 1 0 0021 18.382V7.618a1 1 0 00-.553-.894L15 4m0 13V4m0 0L9 7" />
                                </svg>
                                {showRoute ? 'Hide Route' : 'Show Route'}
                            </button>
                        </div>
                        <div className="flex items-center gap-2 text-xs">
                            <div className="flex items-center gap-1 text-foreground/70">
                                <MapPin className="w-3 h-3 text-primary" />{loc.origin_country}
                            </div>
                            <div className="flex-1 flex items-center gap-0.5">
                                {[1, 2, 3].map(i => <span key={i} className="w-1 h-1 rounded-full bg-foreground/20" />)}
                            </div>
                            <div className="flex items-center gap-1 text-foreground/70">
                                <MapPin className="w-3 h-3 text-emerald-500" />{loc.destination_port || loc.destination_country}
                            </div>
                        </div>
                    </div>
                    {loc.explanation && (
                        <div className="p-3 bg-amber-500/5 border border-amber-500/20 rounded-lg">
                            <p className="text-[10px] uppercase tracking-wider text-amber-500/70 font-medium mb-1 flex items-center gap-1">
                                <Info className="w-3 h-3" /> Risk Note
                            </p>
                            <p className="text-xs text-foreground/60">{loc.explanation}</p>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}

// ─── Main Map Page ────────────────────────────────────────────────────────────
export default function MapPage() {
    const [searchInput, setSearchInput] = useState('');
    const [trackedLoc, setTrackedLoc] = useState<ContainerLocation | null>(null);
    const [searchError, setSearchError] = useState<string | null>(null);
    const [isTracking, setIsTracking] = useState(false);
    const [showMegaOnly, setShowMegaOnly] = useState(false);
    // Hide markers until fly-to animation completes (prevents giant dot during zoom)
    const [markerReady, setMarkerReady] = useState(false);
    // Route polyline toggle — off by default, user can enable
    const [showRoute, setShowRoute] = useState(false);

    const handleTrack = useCallback(async () => {
        const id = searchInput.trim().toUpperCase();
        if (!id) return;
        setSearchError(null);
        setIsTracking(true);
        setMarkerReady(false);   // reset so marker hides during new fly-to
        setShowRoute(false);     // reset route on each new track
        try {
            const result = await fetchContainerLocation(id);
            setTrackedLoc(result ?? null);
            if (!result) setSearchError(`Shipment '${id}' not found.`);
        } catch {
            setSearchError(`Shipment '${id}' not found or location unavailable.`);
            setTrackedLoc(null);
        }
        setIsTracking(false);
    }, [searchInput]);

    const clearTrack = () => {
        setTrackedLoc(null); setSearchInput('');
        setSearchError(null); setMarkerReady(false); setShowRoute(false);
    };

    const handleKeyDown = (e: React.KeyboardEvent) => { if (e.key === 'Enter') handleTrack(); };

    const routePositions: [number, number][] = trackedLoc?.route?.map(([lat, lng]) => [lat, lng]) ?? [];
    const routeColor = trackedLoc ? markerColor[trackedLoc.risk_level] : '#6366f1';

    const visiblePorts = showMegaOnly ? WORLD_PORTS.filter(p => p.type === 'mega') : WORLD_PORTS;


    return (
        <div className="flex flex-col h-full gap-4">
            {/* Header */}
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
                <div>
                    <h1 className="text-2xl font-bold text-foreground">Map Monitoring</h1>
                    <p className="text-sm text-foreground/60 mt-1">
                        {WORLD_PORTS.length} major world ports shown. Search to track any shipment's live location and route.
                    </p>
                </div>
                {/* Port filter toggle */}
                <div className="flex items-center gap-2 text-xs font-medium">
                    <button
                        onClick={() => setShowMegaOnly(false)}
                        className={cn('px-3 py-1.5 rounded-full border transition-all', !showMegaOnly ? 'border-primary bg-primary text-white' : 'bg-card border-border text-foreground/60 hover:border-foreground/30')}
                    >
                        All Ports ({WORLD_PORTS.length})
                    </button>
                    <button
                        onClick={() => setShowMegaOnly(true)}
                        className={cn('px-3 py-1.5 rounded-full border transition-all', showMegaOnly ? 'border-primary bg-primary text-white' : 'bg-card border-border text-foreground/60 hover:border-foreground/30')}
                    >
                        Mega Ports Only ({WORLD_PORTS.filter(p => p.type === 'mega').length})
                    </button>
                </div>
            </div>

            {/* Search Bar */}
            <div className="flex items-center gap-3">
                <div className="relative flex-1 max-w-md">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-foreground/30" />
                    <input
                        type="text"
                        value={searchInput}
                        onChange={(e) => { setSearchInput(e.target.value); setSearchError(null); }}
                        onKeyDown={handleKeyDown}
                        placeholder="Enter Container ID to track shipment..."
                        className="w-full pl-9 pr-4 py-2.5 bg-card border border-border rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-primary/50 text-foreground placeholder:text-foreground/30 transition-all"
                    />
                </div>
                <button
                    onClick={handleTrack}
                    disabled={isTracking || !searchInput.trim()}
                    className="flex items-center gap-2 px-5 py-2.5 bg-primary text-white text-sm font-semibold rounded-xl hover:bg-primary/90 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                    {isTracking ? <Loader2 className="w-4 h-4 animate-spin" /> : <Navigation className="w-4 h-4" />}
                    Track Shipment
                </button>
                {trackedLoc && (
                    <button onClick={clearTrack} className="flex items-center gap-2 px-4 py-2.5 bg-foreground/10 text-foreground/60 text-sm font-medium rounded-xl hover:bg-foreground/20 transition-colors">
                        <X className="w-4 h-4" /> Clear
                    </button>
                )}
            </div>

            {searchError && (
                <div className="flex items-center gap-2 px-4 py-2.5 bg-red-500/10 border border-red-500/20 rounded-lg text-red-400 text-sm animate-in fade-in">
                    <AlertTriangle className="w-4 h-4 shrink-0" />{searchError}
                </div>
            )}

            {/* Map */}
            <div className="flex-1 min-h-[500px] relative rounded-xl overflow-hidden border border-border shadow-sm">
                <MapContainer
                    center={[20, 0]} zoom={2}
                    style={{ height: '100%', width: '100%' }}
                    minZoom={2}
                    zoomAnimation={true}
                    zoomAnimationThreshold={4}
                    inertia={true}
                    inertiaDeceleration={2000}
                    inertiaMaxSpeed={1500}
                    easeLinearity={0.2}
                    wheelDebounceTime={40}
                    wheelPxPerZoomLevel={80}
                >
                    {/* Esri Dark Gray basemap */}
                    <TileLayer
                        attribution='Tiles &copy; <a href="https://www.esri.com">Esri</a>'
                        url="https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Dark_Gray_Base/MapServer/tile/{z}/{y}/{x}"
                        maxZoom={16}
                    />
                    {/* Esri label reference overlay */}
                    <TileLayer
                        attribution=""
                        url="https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Dark_Gray_Reference/MapServer/tile/{z}/{y}/{x}"
                        maxZoom={16}
                        pane="shadowPane"
                    />

                    {/* ── World Port Markers ─────────────────────────────────────── */}
                    {visiblePorts.map((port) => (
                        <CircleMarker
                            key={port.name}
                            center={[port.lat, port.lng]}
                            radius={port.type === 'mega' ? 6 : port.type === 'major' ? 4 : 3}
                            pathOptions={{
                                color: port.type === 'mega' ? '#6366f1' : '#94a3b8',
                                fillColor: port.type === 'mega' ? '#818cf8' : '#64748b',
                                fillOpacity: port.type === 'mega' ? 0.9 : 0.7,
                                weight: port.type === 'mega' ? 2 : 1,
                            }}
                        >
                            <Popup>
                                <div className="text-xs font-sans min-w-[120px]">
                                    <p className="font-bold text-sm">{port.name}</p>
                                    <p className="text-gray-500">{port.country}</p>
                                    {port.type === 'mega' && <span className="text-indigo-500 font-semibold">Mega Port</span>}
                                </div>
                            </Popup>
                        </CircleMarker>
                    ))}

                    {/* ── Tracked container layers (only shown after search) ─────── */}
                    {trackedLoc && (
                        <>
                            {/* FlyTo — marker won't render until moveend fires */}
                            <FlyToLocation lat={trackedLoc.lat} lng={trackedLoc.lng} onComplete={() => setMarkerReady(true)} />

                            {/* Route polyline — only when user toggles it on */}
                            {showRoute && routePositions.length > 1 && (
                                <Polyline
                                    positions={routePositions}
                                    pathOptions={{
                                        color: routeColor, weight: 3, opacity: 0.9,
                                        dashArray: trackedLoc.risk_level !== 'Critical' ? '8 5' : undefined,
                                    }}
                                />
                            )}

                            {/* Origin dot — only after animation */}
                            {markerReady && trackedLoc.origin_coords && (
                                <CircleMarker
                                    center={[trackedLoc.origin_coords.lat, trackedLoc.origin_coords.lng]}
                                    radius={7}
                                    pathOptions={{ color: '#6b7280', fillColor: '#374151', fillOpacity: 0.9, weight: 2 }}
                                >
                                    <Popup><div className="text-xs font-sans"><b>Origin</b><br />{trackedLoc.origin_country}</div></Popup>
                                </CircleMarker>
                            )}

                            {/* Destination dot — only after animation */}
                            {markerReady && trackedLoc.dest_coords && (
                                <CircleMarker
                                    center={[trackedLoc.dest_coords.lat, trackedLoc.dest_coords.lng]}
                                    radius={7}
                                    pathOptions={{ color: '#6b7280', fillColor: '#374151', fillOpacity: 0.9, weight: 2 }}
                                >
                                    <Popup><div className="text-xs font-sans"><b>Destination</b><br />{trackedLoc.destination_port || trackedLoc.destination_country}</div></Popup>
                                </CircleMarker>
                            )}

                            {/* Current position (risk-colored) — only after animation */}
                            {markerReady && (
                                <CircleMarker
                                    center={[trackedLoc.lat, trackedLoc.lng]}
                                    radius={9}
                                    pathOptions={{
                                        color: markerColor[trackedLoc.risk_level],
                                        fillColor: markerColor[trackedLoc.risk_level],
                                        fillOpacity: 0.85, weight: 3,
                                    }}
                                >
                                    <Popup>
                                        <div className="text-xs font-sans space-y-1 min-w-[160px]">
                                            <p className="font-bold text-sm">{trackedLoc.container_id}</p>
                                            <p><span className="text-gray-500">Port:</span> {trackedLoc.current_port}</p>
                                            <p><span className="text-gray-500">Risk:</span> {trackedLoc.risk_level} ({Math.round(trackedLoc.risk_score * 100)})</p>
                                            <p><span className="text-gray-500">Status:</span> {trackedLoc.clearance_status}</p>
                                            <p><span className="text-gray-500">Origin:</span> {trackedLoc.origin_country}</p>
                                            <p><span className="text-gray-500">Destination:</span> {trackedLoc.destination_port || trackedLoc.destination_country}</p>
                                            {trackedLoc.explanation && <p className="text-gray-400 italic">{trackedLoc.explanation}</p>}
                                        </div>
                                    </Popup>
                                </CircleMarker>
                            )}
                        </>
                    )}

                </MapContainer>

                {/* Legend */}
                <div className="absolute bottom-4 left-4 z-[1000] bg-card/90 backdrop-blur-sm border border-border rounded-lg p-3 text-xs space-y-1.5">
                    <p className="font-semibold text-foreground/60 uppercase tracking-wider text-[10px]">Legend</p>
                    <div className="flex items-center gap-2"><span className="w-3 h-3 rounded-full bg-indigo-500 shrink-0" /><span className="text-foreground/70">Mega Port</span></div>
                    <div className="flex items-center gap-2"><span className="w-2.5 h-2.5 rounded-full bg-slate-500 shrink-0" /><span className="text-foreground/70">Major / Regional Port</span></div>
                    {trackedLoc && <>
                        <div className="border-t border-border/50 pt-1.5 mt-1">
                            <div className="flex items-center gap-2"><span className="w-3 h-3 rounded-full bg-red-500 shrink-0" /><span className="text-foreground/70">Critical container</span></div>
                            <div className="flex items-center gap-2"><span className="w-3 h-3 rounded-full bg-amber-500 shrink-0" /><span className="text-foreground/70">Low Risk container</span></div>
                            <div className="flex items-center gap-2"><span className="w-3 h-3 rounded-full bg-emerald-500 shrink-0" /><span className="text-foreground/70">Clear container</span></div>
                        </div>
                    </>}
                </div>

                {/* Tracked panel */}
                {trackedLoc && <TrackedPanel loc={trackedLoc} onClose={clearTrack} showRoute={showRoute} onRouteToggle={() => setShowRoute(r => !r)} />}
            </div>
        </div >
    );
}
