/**
 * Map Routes
 */
const router = require('express').Router();
const {
    getContainerRouteHandler,
    getAllRoutes,
    backfillGeo,
    getContainerLocation,
    getHeatmapData,
    getContainerAIAnalysis,
    getContainerTimeline,
} = require('../controllers/mapController');

router.get('/container-route/:container_id', getContainerRouteHandler);
router.get('/container-location/:container_id', getContainerLocation);
router.get('/container-analysis/:container_id', getContainerAIAnalysis);
router.get('/container-timeline/:container_id', getContainerTimeline);
router.get('/map/all-routes', getAllRoutes);
router.get('/map/heatmap', getHeatmapData);
router.post('/map/backfill-geo', backfillGeo);

module.exports = router;
