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
    phone_number: z.string().optional(),
    department: z.string().optional(),
    profile_photo: z.string().url().optional(),
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
    notes: z.string().optional(),
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

const updateProfileSchema = z.object({
  body: z.object({
    full_name: z.string().optional(),
    official_email: z.string().email().optional(),
    phone_number: z.string().optional(),
    department: z.string().optional(),
    profile_photo: z.string().url().optional(),
    settings: z.object({
      notifications: z.object({
        highRisk: z.boolean().optional(),
        anomaly: z.boolean().optional(),
        weeklySummary: z.boolean().optional(),
      }).optional(),
    }).optional(),
  }),
});

const changePasswordSchema = z.object({
  body: z.object({
    current_password: z.string().min(6),
    new_password: z.string().min(8),
  }),
});

const notificationSettingsSchema = z.object({
  body: z.object({
    highRisk: z.boolean().optional(),
    anomaly: z.boolean().optional(),
    weeklySummary: z.boolean().optional(),
  }),
});

// ── Chat ───────────────────────────────────────────────────────────────────────

const chatStartSchema = z.object({
  body: z.object({
    container_id: z.string().min(1, 'container_id is required'),
    exporter_id: z.string().min(1, 'exporter_id is required'),
  }),
});

const chatSendMessageSchema = z.object({
  body: z.object({
    conversation_id: z.string().min(1, 'conversation_id is required'),
    message_text: z.string().optional().default(''),
    attachment_url: z.string().optional().default(''),
    attachment_name: z.string().optional().default(''),
    attachment_mime: z.string().optional().default(''),
  }).refine(
    (d) => (d.message_text && d.message_text.trim().length > 0) || (d.attachment_url && d.attachment_url.trim().length > 0),
    { message: 'message_text or attachment_url is required' }
  ),
});

const chatListConversationsSchema = z.object({
  query: z.object({
    q: z.string().optional(),
    status: z.enum(['Open', 'Pending Documents', 'Resolved']).optional(),
    limit: z.coerce.number().int().min(1).max(50).optional().default(20),
    page: z.coerce.number().int().min(1).max(2000).optional().default(1),
  }),
});

const chatGetMessagesSchema = z.object({
  params: z.object({
    conversation_id: z.string().min(1),
  }),
  query: z.object({
    limit: z.coerce.number().int().min(1).max(100).optional().default(30),
    before: z.string().optional(), // ISO timestamp cursor
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
    updateProfile: updateProfileSchema,
    changePassword: changePasswordSchema,
    notificationSettings: notificationSettingsSchema,
    chatStart: chatStartSchema,
    chatSendMessage: chatSendMessageSchema,
    chatListConversations: chatListConversationsSchema,
    chatGetMessages: chatGetMessagesSchema,
  },
};
