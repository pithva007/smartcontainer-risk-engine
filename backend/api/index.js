// Vercel default API entrypoint.
// Reuse the existing serverless bootstrap that initializes DB/Redis and mounts Express routes.
module.exports = require('../vercel-entry');
