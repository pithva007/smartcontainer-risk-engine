const mongoose = require('mongoose');

/**
 * Message: individual chat message in a conversation.
 */
const messageSchema = new mongoose.Schema(
  {
    message_id: { type: String, index: true, unique: true },
    conversation_id: { type: mongoose.Schema.Types.ObjectId, ref: 'Conversation', required: true, index: true },

    sender_id: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    sender_role: { type: String, enum: ['admin', 'officer', 'viewer', 'system'], required: true, index: true },

    message_text: { type: String, default: '' },

    attachment_url: { type: String, default: '' },
    attachment_name: { type: String, default: '' },
    attachment_mime: { type: String, default: '' },

    read_by: { type: [mongoose.Schema.Types.ObjectId], ref: 'User', default: [], index: false },
    timestamp: { type: Date, default: Date.now, index: true },
  },
  { collection: 'messages' }
);

messageSchema.index({ conversation_id: 1, timestamp: -1 });

module.exports = mongoose.model('Message', messageSchema);

