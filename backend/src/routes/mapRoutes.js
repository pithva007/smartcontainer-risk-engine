/**
 * Map Routes
 * GET  /api/container-route/:container_id - Route for a specific container
 * GET  /api/map/all-routes               - All container routes (paginated GeoJSON)
 * POST /api/map/backfill-geo             - Admin: geocode all containers
 */
const router = require('express').Router();
const { getContainerRouteHandler, getAllRoutes, backfillGeo, getContainerLocation } = require('../controllers/mapController');

router.get('/container-route/:container_id', getContainerRouteHandler);
router.get('/container-location/:container_id', getContainerLocation);
router.get('/map/all-routes', getAllRoutes);
router.post('/map/backfill-geo', backfillGeo);

module.exports = router;
