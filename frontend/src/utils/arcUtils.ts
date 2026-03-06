/**
 * Arc Utilities for 3D map visualizations
 */

/**
 * Generates a curved "aerial" path between two points.
 * Simulates a 3D arc in a 2D projection.
 * 
 * @param start - [lat, lng]
 * @param end - [lat, lng]
 * @param steps - number of points in the curve
 */
export function getArcPath(
    start: [number, number],
    end: [number, number],
    steps: number = 20
): [number, number][] {
    const path: [number, number][] = [];
    const [startLat, startLng] = start;
    const [endLat, endLng] = end;

    // Calculate distance to determine height factor
    const dLat = endLat - startLat;
    const dLng = endLng - startLng;
    const dist = Math.sqrt(dLat * dLat + dLng * dLng);

    // Height factor: further points get a higher arc
    // Using a parabolic curve for the visual height simulation
    const midLat = (startLat + endLat) / 2;
    const midLng = (startLng + endLng) / 2;

    // Offset perpendicular to the line to create the "bend"
    // Increased height factor for more "pop" and 3D feel
    const height = dist * 0.4; // 40% of distance as bend height (was 25%)

    // Perpendicular vector: (-dLng, dLat)
    const perpLat = -dLng / dist;
    const perpLng = dLat / dist;

    const controlLat = midLat + perpLat * height;
    const controlLng = midLng + perpLng * height;

    for (let i = 0; i <= steps; i++) {
        const t = i / steps;

        // Quadratic Bezier: (1-t)^2*P0 + 2(1-t)t*P1 + t^2*P2
        const lat = (1 - t) * (1 - t) * startLat + 2 * (1 - t) * t * controlLat + t * t * endLat;
        const lng = (1 - t) * (1 - t) * startLng + 2 * (1 - t) * t * controlLng + t * t * endLng;

        path.push([lat, lng]);
    }

    return path;
}
