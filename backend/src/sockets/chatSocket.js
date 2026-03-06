const jwt = require('jsonwebtoken');
const User = require('../models/userModel');
const Conversation = require('../models/conversationModel');
const Message = require('../models/messageModel');
const { v4: uuidv4 } = require('uuid');
const Container = require('../models/containerModel');

const canAccessConversation = async (conversationDoc, user) => {
  if (!conversationDoc) return false;
  if (user.role === 'admin' || user.role === 'officer') return true;
  if (user.role === 'viewer') return String(conversationDoc.exporter_id) === String(user.username);
  return false;
};

/**
 * Attach chat socket handlers to Socket.IO server instance.
 */
const registerChatSocket = (io, { logger }) => {
  io.use(async (socket, next) => {
    try {
      const token =
        socket.handshake.auth?.token ||
        (socket.handshake.headers.authorization && socket.handshake.headers.authorization.startsWith('Bearer ')
          ? socket.handshake.headers.authorization.slice(7)
          : null);

      if (!token) return next(new Error('UNAUTHORIZED'));
      const decoded = jwt.verify(token, process.env.JWT_SECRET || 'change-me-in-production');
      const user = await User.findById(decoded.id).select('+is_active +role');
      if (!user || !user.is_active) return next(new Error('UNAUTHORIZED'));

      socket.user = user;
      return next();
    } catch (err) {
      return next(new Error('UNAUTHORIZED'));
    }
  });

  io.on('connection', (socket) => {
    const user = socket.user;
    if (logger) logger.info(`Socket connected: ${socket.id} user=${user.username || user._id}`);

    socket.on('join_conversation', async ({ conversation_id }) => {
      if (!conversation_id) return;
      const convo = await Conversation.findOne({ conversation_id });
      if (!(await canAccessConversation(convo, user))) return;
      socket.join(`conversation:${conversation_id}`);
    });

    socket.on('typing', async ({ conversation_id }) => {
      if (!conversation_id) return;
      const convo = await Conversation.findOne({ conversation_id }).lean();
      if (!(await canAccessConversation(convo, user))) return;
      socket.to(`conversation:${conversation_id}`).emit('user_typing', {
        conversation_id,
        user_id: String(user._id),
        role: user.role,
        name: user.full_name || user.username || 'User',
      });
    });

    socket.on('stop_typing', async ({ conversation_id }) => {
      if (!conversation_id) return;
      const convo = await Conversation.findOne({ conversation_id }).lean();
      if (!(await canAccessConversation(convo, user))) return;
      socket.to(`conversation:${conversation_id}`).emit('user_typing', {
        conversation_id,
        user_id: String(user._id),
        role: user.role,
        name: user.full_name || user.username || 'User',
        stopped: true,
      });
    });

    socket.on('send_message', async (payload, ack) => {
      try {
        const { conversation_id, message_text, attachment_url, attachment_name, attachment_mime } = payload || {};
        if (!conversation_id) return;
        const convo = await Conversation.findOne({ conversation_id });
        if (!convo) return;
        if (!(await canAccessConversation(convo, user))) return;

        // Extra safety: exporters can only chat for containers they own
        if (user.role === 'viewer') {
          const container = await Container.findOne({ container_id: convo.container_id }).select('exporter_id').lean();
          if (!container || String(container.exporter_id) !== String(user.username)) return;
        }

        if (!convo.admin_id && (user.role === 'admin' || user.role === 'officer')) {
          convo.admin_id = user._id;
          await convo.save();
        }

        const msg = await Message.create({
          message_id: uuidv4(),
          conversation_id: convo._id,
          sender_id: user._id,
          sender_role: user.role,
          message_text: message_text || '',
          attachment_url: attachment_url || '',
          attachment_name: attachment_name || '',
          attachment_mime: attachment_mime || '',
          timestamp: new Date(),
        });

        io.to(`conversation:${conversation_id}`).emit('new_message', {
          conversation_id,
          message: {
            message_id: msg.message_id,
            sender_id: String(msg.sender_id),
            sender_role: msg.sender_role,
            sender_name: user.full_name || user.username || 'User',
            message_text: msg.message_text,
            attachment_url: msg.attachment_url,
            attachment_name: msg.attachment_name,
            attachment_mime: msg.attachment_mime,
            timestamp: msg.timestamp,
          },
        });

        if (typeof ack === 'function') ack({ ok: true, message_id: msg.message_id });
      } catch (err) {
        if (typeof ack === 'function') ack({ ok: false, error: err.message });
      }
    });

    socket.on('disconnect', (reason) => {
      if (logger) logger.info(`Socket disconnected: ${socket.id} reason=${reason}`);
    });
  });
};

module.exports = { registerChatSocket };

