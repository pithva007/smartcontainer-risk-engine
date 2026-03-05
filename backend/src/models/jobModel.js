/**
 * Job Model
 * Tracks background processing tasks (upload, batch-predict, retrain)
 */
const mongoose = require('mongoose');

const jobLogSchema = new mongoose.Schema(
  {
    timestamp: { type: Date, default: Date.now },
    level: { type: String, enum: ['info', 'warn', 'error'], default: 'info' },
    message: { type: String, required: true },
  },
  { _id: false }
);

const jobSchema = new mongoose.Schema(
  {
    job_id: {
      type: String,
      required: true,
      unique: true,
      index: true,
    },
    type: {
      type: String,
      enum: ['UPLOAD_DATASET', 'BATCH_PREDICT', 'RETRAIN_MODEL'],
      required: true,
      index: true,
    },
    status: {
      type: String,
      enum: ['waiting', 'active', 'completed', 'failed'],
      default: 'waiting',
      index: true,
    },
    progress: {
      type: Number,
      default: 0,
      min: 0,
      max: 100,
    },
    created_by: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
    },
    // Job-specific metadata
    metadata: {
      filename: String,
      original_filename: String,
      total_records: Number,
      processed_records: Number,
      failed_records: Number,
      batch_id: String,
      result_file: String,
      file_path: String,
    },
    logs: [jobLogSchema],
    error: String,
    started_at: Date,
    completed_at: Date,
  },
  { timestamps: true }
);

// TTL index: auto-delete completed jobs after 7 days
jobSchema.index({ completed_at: 1 }, { expireAfterSeconds: 604800, partialFilterExpression: { status: { $in: ['completed', 'failed'] } } });
jobSchema.index({ createdAt: -1, status: 1 });

module.exports = mongoose.model('Job', jobSchema);
