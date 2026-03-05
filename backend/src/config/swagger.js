/**
 * Swagger / OpenAPI configuration for SmartContainer Risk Engine v2.
 * swagger-jsdoc reads JSDoc annotations from all route files to generate the spec.
 */
const swaggerJsdoc = require('swagger-jsdoc');
const path = require('path');

const options = {
  definition: {
    openapi: '3.0.0',
    info: {
      title: 'SmartContainer Risk Engine API',
      version: '2.0.0',
      description:
        'Production-grade customs risk intelligence platform with ML-powered risk scoring, ' +
        'ship tracking, workflow management, audit logging, and Prometheus metrics.',
      contact: { name: 'SmartContainer Team' },
    },
    servers: [
      { url: 'http://localhost:3000', description: 'Local development' },
      { url: 'http://backend:3000', description: 'Docker environment' },
    ],
    components: {
      securitySchemes: {
        bearerAuth: {
          type: 'http',
          scheme: 'bearer',
          bearerFormat: 'JWT',
          description: 'JWT token obtained from POST /api/auth/login',
        },
      },
      schemas: {
        Error: {
          type: 'object',
          properties: {
            success: { type: 'boolean', example: false },
            message: { type: 'string' },
            request_id: { type: 'string' },
          },
        },
        ValidationError: {
          type: 'object',
          properties: {
            error: {
              type: 'object',
              properties: {
                code: { type: 'string', example: 'VALIDATION_ERROR' },
                message: { type: 'string' },
                details: {
                  type: 'array',
                  items: {
                    type: 'object',
                    properties: {
                      field: { type: 'string' },
                      message: { type: 'string' },
                    },
                  },
                },
              },
            },
          },
        },
        Container: {
          type: 'object',
          properties: {
            container_id: { type: 'string' },
            origin_country: { type: 'string' },
            destination_country: { type: 'string' },
            risk_score: { type: 'number', minimum: 0, maximum: 1 },
            risk_level: { type: 'string', enum: ['CRITICAL', 'HIGH', 'MEDIUM', 'LOW'] },
            anomaly_flag: { type: 'boolean' },
            inspection_status: {
              type: 'string',
              enum: ['NEW', 'ASSIGNED', 'IN_REVIEW', 'CLEARED', 'HOLD', 'DETENTION'],
            },
            assigned_to: { type: 'string' },
          },
        },
        User: {
          type: 'object',
          properties: {
            _id: { type: 'string' },
            username: { type: 'string' },
            email: { type: 'string' },
            role: { type: 'string', enum: ['admin', 'officer', 'viewer'] },
            full_name: { type: 'string' },
            is_active: { type: 'boolean' },
          },
        },
        Job: {
          type: 'object',
          properties: {
            job_id: { type: 'string' },
            type: { type: 'string', enum: ['UPLOAD_DATASET', 'BATCH_PREDICT', 'RETRAIN_MODEL'] },
            status: { type: 'string', enum: ['waiting', 'active', 'completed', 'failed'] },
            progress: { type: 'number', minimum: 0, maximum: 100 },
          },
        },
        ShipmentTrack: {
          type: 'object',
          properties: {
            container_id: { type: 'string' },
            vessel_name: { type: 'string' },
            status: { type: 'string', enum: ['AT_SEA', 'IN_PORT', 'DELAYED', 'ARRIVED', 'UNKNOWN'] },
            last_position: {
              type: 'object',
              properties: {
                lat: { type: 'number' },
                lng: { type: 'number' },
                timestamp: { type: 'string', format: 'date-time' },
                speed_knots: { type: 'number' },
                heading: { type: 'number' },
              },
            },
            route_geojson: { type: 'object', description: 'GeoJSON FeatureCollection' },
          },
        },
      },
    },
    security: [{ bearerAuth: [] }],
  },
  apis: [
    path.join(__dirname, '../routes/*.js'),
  ],
};

const swaggerSpec = swaggerJsdoc(options);

module.exports = swaggerSpec;
