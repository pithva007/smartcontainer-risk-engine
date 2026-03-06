const mongoose = require('mongoose');

/**
 * Conversation: container-linked thread between exporter and admin/officer.
 */
const conversationSchema = new mongoose.Schema(
  {
    conversation_id: { type: String, index: true, unique: true },
    container_id: { type: String, required: true, index: true, trim: true },

    // External exporter identifier from container dataset (Container.exporter_id)
    exporter_id: { type: String, required: true, index: true, trim: true },
    admin_id: { type: mongoose.Schema.Types.ObjectId, ref: 'User', index: true },
  },
  { timestamps: { createdAt: 'created_at', updatedAt: 'updated_at' }, collection: 'conversations' }
);

// Uniquely identify a conversation by container + exporter (admin joins the same thread)
conversationSchema.index({ container_id: 1, exporter_id: 1 }, { unique: true });

module.exports = mongoose.model('Conversation', conversationSchema);

