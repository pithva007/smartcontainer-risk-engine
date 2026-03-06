/**
 * Maritime Routing Service
 * Implements Dijkstra's algorithm to find shortest sea routes between waypoints.
 */
const nodes = require('../data/maritimeNodes.json');
const { haversineDistanceKm } = require('../utils/geojson');
const logger = require('../utils/logger');

/**
 * Catmull-Rom Spline interpolation for a set of points.
 * Returns a smooth curve passing through all points.
 */
function interpolateSpline(points, segments = 12) {
    if (points.length < 2) return points;
    if (points.length === 2) {
        // Linear interpolation for short port-to-port or short segments
        const result = [];
        const [p0, p1] = points;
        for (let i = 0; i <= segments; i++) {
            const t = i / segments;
            result.push([
                parseFloat((p0[0] + (p1[0] - p0[0]) * t).toFixed(5)),
                parseFloat((p0[1] + (p1[1] - p0[1]) * t).toFixed(5))
            ]);
        }
        return result;
    }

    const smoothed = [];
    const p = [
        [
            points[0][0] - (points[1][0] - points[0][0]),
            points[0][1] - (points[1][1] - points[0][1])
        ],
        ...points,
        [
            points[points.length - 1][0] + (points[points.length - 1][0] - points[points.length - 2][0]),
            points[points.length - 1][1] + (points[points.length - 1][1] - points[points.length - 2][1])
        ]
    ];

    for (let i = 0; i < p.length - 3; i++) {
        const p0 = p[i], p1 = p[i + 1], p2 = p[i + 2], p3 = p[i + 3];

        // Use higher tension (stiffer) for the very first and very last segments 
        // to keep them closer to a straight line (linear end-caps)
        const isEndSegment = (i === 0 || i === p.length - 4);
        const tension = isEndSegment ? 0.1 : 0.4;

        for (let j = 0; j < segments; j++) {
            const t = j / segments;
            const t2 = t * t;
            const t3 = t2 * t;

            const m1 = tension * (p2[0] - p0[0]);
            const m2 = tension * (p3[0] - p1[0]);
            const lat = (2 * t3 - 3 * t2 + 1) * p1[0] + (t3 - 2 * t2 + t) * m1 + (-2 * t3 + 3 * t2) * p2[0] + (t3 - t2) * m2;

            const n1 = tension * (p2[1] - p0[1]);
            const n2 = tension * (p3[1] - p1[1]);
            const lng = (2 * t3 - 3 * t2 + 1) * p1[1] + (t3 - 2 * t2 + t) * n1 + (-2 * t3 + 3 * t2) * p2[1] + (t3 - t2) * n2;

            smoothed.push([parseFloat(lat.toFixed(5)), parseFloat(lng.toFixed(5))]);
        }
    }
    smoothed.push(points[points.length - 1]);
    return smoothed;
}

/**
 * Dijkstra's shortest path algorithm
 */
function dijkstra(startNodeId, endNodeId) {
    const distances = {};
    const previous = {};
    const queue = new Set();

    nodes.forEach(node => {
        distances[node.id] = Infinity;
        previous[node.id] = null;
        queue.add(node.id);
    });

    distances[startNodeId] = 0;

    while (queue.size > 0) {
        let u = null;
        queue.forEach(nodeId => {
            if (u === null || distances[nodeId] < distances[u]) {
                u = nodeId;
            }
        });

        if (u === endNodeId || distances[u] === Infinity) {
            break;
        }

        queue.delete(u);

        const node = nodes.find(n => n.id === u);
        if (!node) continue;

        node.adj.forEach(neighborId => {
            if (!queue.has(neighborId)) return;

            const neighborNode = nodes.find(n => n.id === neighborId);
            if (!neighborNode) return;

            const alt = distances[u] + haversineDistanceKm(node.lat, node.lng, neighborNode.lat, neighborNode.lng);
            if (alt < distances[neighborId]) {
                distances[neighborId] = alt;
                previous[neighborId] = u;
            }
        });
    }

    const path = [];
    let curr = endNodeId;
    while (curr) {
        path.unshift(curr);
        curr = previous[curr];
    }

    return path[0] === startNodeId ? path : [];
}

/**
 * Find the N nearest maritime nodes to a coordinate
 * (Implements the "KNN" suggestion from user)
 */
function findNearestNodes(lat, lng, k = 1) {
    const sorted = [...nodes].sort((a, b) => {
        const distA = haversineDistanceKm(lat, lng, a.lat, a.lng);
        const distB = haversineDistanceKm(lat, lng, b.lat, b.lng);
        return distA - distB;
    });
    return sorted.slice(0, k);
}

/**
 * Main entry point: Find full maritime route from origin to destination
 */
async function findMaritimeRoute(origin, destination) {
    try {
        if (!origin || !destination) return null;

        // 1. Find nearest nodes to origin and destination
        // Search for multiple nearest nodes to find the best entry/exit points
        const nearOrigins = findNearestNodes(origin.lat, origin.lng, 3);
        const nearDests = findNearestNodes(destination.lat, destination.lng, 3);

        if (!nearOrigins.length || !nearDests.length) {
            return null;
        }

        // Try all combinations of start/end nodes to find the shortest graph path
        let bestNodePath = [];
        let minGraphDist = Infinity;

        for (const startNode of nearOrigins) {
            for (const endNode of nearDests) {
                const path = dijkstra(startNode.id, endNode.id);
                if (path.length > 0) {
                    // Calculate rough distance
                    let dist = 0;
                    for (let i = 0; i < path.length - 1; i++) {
                        const n1 = nodes.find(n => n.id === path[i]);
                        const n2 = nodes.find(n => n.id === path[i + 1]);
                        dist += haversineDistanceKm(n1.lat, n1.lng, n2.lat, n2.lng);
                    }
                    if (dist < minGraphDist) {
                        minGraphDist = dist;
                        bestNodePath = path;
                    }
                }
            }
        }

        // If no graph path found, but origin and destination are VERY close (e.g. < 300km)
        // we can risk a direct line, otherwise return null to avoid land-crossing
        const directDist = haversineDistanceKm(origin.lat, origin.lng, destination.lat, destination.lng);
        if (bestNodePath.length === 0) {
            if (directDist < 300) {
                return [[origin.lat, origin.lng], [destination.lat, destination.lng]];
            }
            return null;
        }

        // 3. Construct raw control points
        const nodePathIds = bestNodePath;
        const controlPoints = [];

        // Always start exactly at origin
        controlPoints.push([origin.lat, origin.lng]);

        // Add Dijkstra node path
        nodePathIds.forEach((id, index) => {
            const node = nodes.find(n => n.id === id);
            if (node) {
                // DON'T skip the first/last nodes if they are important guard points.
                // Only skip if they are IDENTICAL to origin/dest coordinates to avoid zero-length segments.
                const distToOrigin = haversineDistanceKm(origin.lat, origin.lng, node.lat, node.lng);
                const distToDest = haversineDistanceKm(destination.lat, destination.lng, node.lat, node.lng);

                if (distToOrigin < 5 && index === 0) return; // Almost identical to origin
                if (distToDest < 5 && index === nodePathIds.length - 1) return; // Almost identical to dest

                controlPoints.push([node.lat, node.lng]);
            }
        });

        // Always end exactly at destination
        controlPoints.push([destination.lat, destination.lng]);

        // 4. Smoothen the path using Catmull-Rom Spline
        // Use more segments for longer paths to keep them smooth
        const totalDist = haversineDistanceKm(origin.lat, origin.lng, destination.lat, destination.lng);
        const segmentsPerSegment = totalDist > 5000 ? 30 : 15;

        return interpolateSpline(controlPoints, segmentsPerSegment);
    } catch (error) {
        logger.error(`Maritime routing error: ${error.message}`);
        return null;
    }
}

module.exports = {
    findMaritimeRoute,
    findNearestNodes
};
