import { useEffect, useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { fetchAllRoutes, fetchRouteById } from '@/api/routes';
import { MapContainer, TileLayer, GeoJSON, useMap } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import type { RiskLevel, AllRoutesGeoJSON } from '@/types/apiTypes';
import { cn, riskBgClass, riskColor } from '@/lib/utils';
import { Loader2, X } from 'lucide-react';

// Fix default marker icons
L.Icon.Default.mergeOptions({
    iconUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
    iconRetinaUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png',
    shadowUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
});

function FitBounds({ geojson }: { geojson: AllRoutesGeoJSON }) {
    const map = useMap();
    useEffect(() => {
        if (geojson.features.length > 0) {
            const layer = L.geoJSON(geojson as GeoJSON.GeoJsonObject);
            const bounds = layer.getBounds();
            if (bounds.isValid()) map.fitBounds(bounds, { padding: [40, 40] });
        }
    }, [geojson, map]);
    return null;
}

interface DrawerProps {
    containerId: string;
    onClose: () => void;
}

function DetailDrawer({ containerId, onClose }: DrawerProps) {
    const { data, isLoading } = useQuery({
        queryKey: ['route', containerId],
        queryFn: () => fetchRouteById(containerId),
    });

    return (
        <div className="absolute top-4 right-4 w-80 bg-card border border-border rounded-xl shadow-lg z-[1000] overflow-hidden">
            <div className="flex items-center justify-between p-4 border-b border-border">
                <h3 className="font-semibold text-foreground">Container Detail</h3>
                <button onClick={onClose} className="p-1 hover:bg-foreground/5 rounded">
                    <X className="w-4 h-4" />
                </button>
            </div>
            {isLoading ? (
                <div className="p-6 flex justify-center"><Loader2 className="w-5 h-5 animate-spin text-primary" /></div>
            ) : data ? (
                <div className="p-4 space-y-3 text-sm">
                    <div>
                        <p className="text-xs text-foreground/50">Container ID</p>
                        <p className="font-mono font-medium">{data.container_id}</p>
                    </div>
                    <div>
                        <p className="text-xs text-foreground/50">Risk Level</p>
                        <span className={cn('px-2 py-0.5 rounded-full text-xs font-semibold', riskBgClass[data.risk_level])}>{data.risk_level}</span>
                    </div>
                    <div>
                        <p className="text-xs text-foreground/50">Anomaly Flag</p>
                        <p className={data.anomaly_flag ? 'text-risk-critical font-semibold' : 'text-foreground/70'}>{data.anomaly_flag ? 'Yes' : 'No'}</p>
                    </div>
                </div>
            ) : null}
        </div>
    );
}

export default function MapPage() {
    const { data, isLoading, error } = useQuery({
        queryKey: ['all-routes'],
        queryFn: fetchAllRoutes,
    });
    const [selected, setSelected] = useState<string | null>(null);
    const geoRef = useRef<L.GeoJSON>(null);

    const getStyle = (feature?: GeoJSON.Feature) => {
        const risk = (feature?.properties?.risk_level ?? 'Clear') as RiskLevel;
        return {
            color: riskColor[risk],
            weight: risk === 'Critical' ? 4 : 2,
            opacity: 0.8,
            dashArray: risk === 'Critical' ? undefined : '6 4',
        };
    };

    const onEachFeature = (feature: GeoJSON.Feature, layer: L.Layer) => {
        const p = feature.properties as { container_id: string; risk_level: RiskLevel; anomaly_flag: boolean };
        layer.bindTooltip(`<b>${p.container_id}</b><br/>${p.risk_level}`, { sticky: true });
        layer.on('click', () => setSelected(p.container_id));
    };

    return (
        <div className="flex flex-col h-full">
            <div className="flex items-center justify-between mb-6">
                <div>
                    <h1 className="text-2xl font-bold text-foreground">Map Monitoring</h1>
                    <p className="text-sm text-foreground/60 mt-1">Global shipment routes visualized by risk level.</p>
                </div>
                <div className="flex items-center gap-3 text-xs font-medium">
                    {(['Critical', 'Low Risk', 'Clear'] as RiskLevel[]).map((r) => (
                        <div key={r} className="flex items-center gap-1.5 px-3 py-1.5 bg-card border border-border rounded-md">
                            <div className="w-3 h-3 rounded-full" style={{ backgroundColor: riskColor[r] }} />
                            <span>{r}</span>
                        </div>
                    ))}
                </div>
            </div>

            {isLoading ? (
                <div className="flex-1 flex items-center justify-center"><Loader2 className="w-8 h-8 animate-spin text-primary" /></div>
            ) : error ? (
                <div className="flex-1 flex items-center justify-center text-risk-critical">Failed to load map data.</div>
            ) : (
                <div className="flex-1 min-h-[500px] relative rounded-xl overflow-hidden border border-border shadow-sm">
                    <MapContainer center={[20, 0]} zoom={2} style={{ height: '100%', width: '100%' }} minZoom={2}>
                        <TileLayer
                            attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OSM</a>'
                            url="https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png"
                        />
                        {data && (
                            <>
                                <GeoJSON
                                    ref={geoRef}
                                    data={data as unknown as GeoJSON.GeoJsonObject}
                                    style={getStyle}
                                    onEachFeature={onEachFeature}
                                />
                                <FitBounds geojson={data} />
                            </>
                        )}
                    </MapContainer>

                    {selected && <DetailDrawer containerId={selected} onClose={() => setSelected(null)} />}
                </div>
            )}
        </div>
    );
}
