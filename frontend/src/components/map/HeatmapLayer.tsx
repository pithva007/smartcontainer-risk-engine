/**
 * HeatmapLayer — renders a leaflet.heat heatmap inside a MapContainer.
 * Uses the plugin's L.heatLayer() API directly with a useEffect.
 */
import { useEffect, useRef } from 'react';
import { useMap } from 'react-leaflet';
import L from 'leaflet';
// @ts-ignore — leaflet.heat has no bundled types on some versions
import 'leaflet.heat';

export interface HeatPoint {
    lat: number;
    lng: number;
    intensity: number; // 0–1
}

interface Props {
    points: HeatPoint[];
    /** Radius in pixels of each point (default 25) */
    radius?: number;
    /** Blur factor (default 15) */
    blur?: number;
    /** Max zoom at which full point is drawn (default 18) */
    maxZoom?: number;
}

export default function HeatmapLayer({ points, radius = 25, blur = 20, maxZoom = 18 }: Props) {
    const map = useMap();
    const heatRef = useRef<any>(null);

    useEffect(() => {
        if (!points || points.length === 0) return;

        // Build the data array: [lat, lng, intensity]
        const data: [number, number, number][] = points.map(p => [p.lat, p.lng, p.intensity]);

        if (heatRef.current) {
            // Update existing layer
            heatRef.current.setLatLngs(data);
            heatRef.current.redraw();
        } else {
            // Create new layer
            const heat = (L as any).heatLayer(data, {
                radius: 30, // larger radius
                blur: 15, // lower blur so points are sharper
                maxZoom,
                max: 0.8, // capping the max dynamically lower forces points to hit intense red faster
                // High contrast dark-mode neon gradient
                gradient: {
                    0.1: '#00fa9a', // bright spring green
                    0.3: '#ffd700', // vivid yellow
                    0.6: '#ff4500', // bright orange-red
                    0.8: '#ff0055', // neon red-pink (critical)
                },
            });
            heat.addTo(map);
            heatRef.current = heat;
        }

        return () => {
            if (heatRef.current) {
                map.removeLayer(heatRef.current);
                heatRef.current = null;
            }
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [points, radius, blur, maxZoom]);

    return null;
}
