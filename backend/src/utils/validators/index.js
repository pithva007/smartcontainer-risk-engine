/**
 * Zod Validators
 * Define input schemas for all endpoints.
 * Use validate(schema)(req, res, next) middleware pattern.
 */
const { z } = require('zod');

// ── Schema Definitions ─────────────────────────────────────────────────────────

const loginSchema = z.object({
  body: z.object({
    username: z.string().min(1, 'Username is required'),
    password: z.string().min(6, 'Password must be at least 6 characters'),
  }),
});

const createUserSchema = z.object({
  body: z.object({
    username: z.string().min(3).max(50),
    email: z.string().email(),
    password: z.string().min(8, 'Password must be at least 8 characters'),
    full_name: z.string().optional(),
    role: z.enum(['admin', 'officer', 'viewer']).optional().default('viewer'),
  }),
});

const predictSingleSchema = z.object({
  body: z.object({
    container_id: z.string().min(1, 'container_id is required'),
    origin_country: z.string().min(1),
    destination_country: z.string().min(1),
    destination_port: z.string().optional().default(''),
    trade_regime: z.enum(['Import', 'Export', 'Transit']).optional().default('Import'),
    importer_id: z.string().optional().default(''),
    exporter_id: z.string().optional().default(''),
    declared_value: z.number().nonnegative().optional().default(0),
    declared_weight: z.number().nonnegative().optional().default(0),
    measured_weight: z.number().nonnegative().optional().default(0),
    dwell_time_hours: z.number().nonnegative().optional().default(0),
    hs_code: z.string().optional().default(''),
    shipping_line: z.string().optional().default(''),
    clearance_status: z.string().optional().default(''),
  }),
});

const assignContainerSchema = z.object({
  body: z.object({
    assigned_to: z.string().min(1, 'assigned_to user ID is required'),
  }),
});

const updateStatusSchema = z.object({
  body: z.object({
    inspection_status: z.enum([
      'NEW',
      'ASSIGNED',
      'IN_REVIEW',
      'CLEARED',
      'HOLD',
      'DETENTION',
    ]),
    notes: z.string().optional(),
  }),
});

const addNoteSchema = z.object({
  body: z.object({
    note: z.string().min(1, 'Note text is required').max(1000),
  }),
});

const linkVesselSchema = z.object({
  body: z.object({
    container_id: z.string().min(1),
    vessel_imo: z.string().optional(),
    vessel_name: z.string().optional(),
  }).refine(
    (d) => d.vessel_imo || d.vessel_name,
    { message: 'Either vessel_imo or vessel_name is required' }
  ),
});

// ── Middleware Factory ─────────────────────────────────────────────────────────

/**
 * Returns an Express middleware that validates req against the given Zod schema.
 * The schema should have { body?, params?, query? } shape for scoped validation.
 *
 * @param {z.ZodSchema} schema
 */
const validate = (schema) => (req, res, next) => {
  const toValidate = {
    body: req.body,
    params: req.params,
    query: req.query,
  };

  const result = schema.safeParse(toValidate);

  if (!result.success) {
    return res.status(422).json({
      error: {
        code: 'VALIDATION_ERROR',
        message: 'Input validation failed.',
        details: result.error.errors.map((e) => ({
          field: e.path.join('.'),
          message: e.message,
        })),
        request_id: req.requestId,
      },
    });
  }

  // Merge validated/coerced values back into req
  if (result.data.body) req.body = result.data.body;
  if (result.data.params) req.params = { ...req.params, ...result.data.params };
  if (result.data.query) req.query = { ...req.query, ...result.data.query };

  next();
};

module.exports = {
  validate,
  schemas: {
    login: loginSchema,
    createUser: createUserSchema,
    predictSingle: predictSingleSchema,
    assignContainer: assignContainerSchema,
    updateStatus: updateStatusSchema,
    addNote: addNoteSchema,
    linkVessel: linkVesselSchema,
  },
};
