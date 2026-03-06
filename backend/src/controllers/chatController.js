const { v4: uuidv4 } = require('uuid');
const Conversation = require('../models/conversationModel');
const Message = require('../models/messageModel');
const Container = require('../models/containerModel');
const User = require('../models/userModel');

const toSafeRoleLabel = (role) => {
  if (role === 'viewer') return 'Exporter';
  if (role === 'system') return 'System';
  return 'Admin';
};

const ensureParticipant = async (conversation, user) => {
  if (!conversation) return false;
  // Admin/officer can access operationally
  if (user.role === 'admin' || user.role === 'officer') return true;
  // Exporter can only access their own conversations (by external exporter_id == username)
  if (user.role === 'viewer') return String(conversation.exporter_id) === String(user.username);
  return false;
};

const startConversation = async (req, res) => {
  const { container_id, exporter_id } = req.body;

  // Only admin/officer can start chats
  if (!(req.user.role === 'admin' || req.user.role === 'officer')) {
    return res.status(403).json({ success: false, message: 'Only Admin officers can start chat.', request_id: req.requestId });
  }

  const container = await Container.findOne({ container_id }).lean();
  if (!container) {
    return res.status(404).json({ success: false, message: 'Container not found.', request_id: req.requestId });
  }

  // Validate exporter ownership against container dataset
  if (String(container.exporter_id || '') !== String(exporter_id)) {
    return res.status(403).json({ success: false, message: 'Exporter does not match container ownership.', request_id: req.requestId });
  }

  const user = req.user;

  // Find existing conversation by unique key: container_id + exporter_id
  const existing = await Conversation.findOne({ container_id, exporter_id });

  let convo = existing;
  if (!convo) {
    convo = await Conversation.create({
      conversation_id: uuidv4(),
      container_id,
      exporter_id,
      admin_id: user._id,
    });
  } else {
    // Ensure admin is recorded (first admin to open gets stored)
    if (!convo.admin_id) {
      convo.admin_id = user._id;
      await convo.save();
    }
  }

  // Smart system message when conversation is created (admin initiated)
  const hasSystem = await Message.findOne({
    conversation_id: convo._id,
    sender_role: 'system',
  }).lean();
  if (!hasSystem) {
    const riskLevel = container.risk_level || 'Unknown';
    await Message.create({
      message_id: uuidv4(),
      conversation_id: convo._id,
      sender_id: user._id,
      sender_role: 'system',
      message_text: `⚠ This container has been flagged as ${riskLevel}. Admin has initiated communication regarding this shipment.`,
      read_by: [user._id],
      timestamp: new Date(),
    });
  }

  return res.status(200).json({
    success: true,
    conversation: {
      id: convo._id,
      conversation_id: convo.conversation_id,
      container_id: convo.container_id,
      exporter_id: convo.exporter_id,
      admin_id: convo.admin_id,
      created_at: convo.created_at,
      updated_at: convo.updated_at,
      container: {
        container_id: container.container_id,
        risk_level: container.risk_level,
        risk_score: container.risk_score,
        origin_country: container.origin_country,
        destination_port: container.destination_port,
        destination_country: container.destination_country,
      },
    },
  });
};

const getConversations = async (req, res) => {
  const { q, status, limit, page } = req.query;
  const user = req.user;

  const query = {};
  if (q) query.container_id = { $regex: String(q).trim(), $options: 'i' };
  if (status) query.status = status; // legacy / optional

  // Restrict for exporters (viewer) to their conversations; admin/officer can see all.
  if (user.role === 'viewer') query.exporter_id = user.username;

  const skip = (Number(page) - 1) * Number(limit);

  const [items, total] = await Promise.all([
    Conversation.find(query).sort({ updated_at: -1 }).skip(skip).limit(Number(limit)).lean(),
    Conversation.countDocuments(query),
  ]);

  // Pull last message + unread count (per conversation)
  const convoIds = items.map((c) => c._id);
  const lastMessages = await Message.aggregate([
    { $match: { conversation_id: { $in: convoIds } } },
    { $sort: { timestamp: -1 } },
    {
      $group: {
        _id: '$conversation_id',
        message_text: { $first: '$message_text' },
        attachment_name: { $first: '$attachment_name' },
        timestamp: { $first: '$timestamp' },
        sender_role: { $first: '$sender_role' },
      },
    },
  ]);
  const lastById = new Map(lastMessages.map((m) => [String(m._id), m]));

  const unreadAgg = await Message.aggregate([
    { $match: { conversation_id: { $in: convoIds }, sender_role: { $ne: 'system' } } },
    { $project: { conversation_id: 1, read_by: 1 } },
    {
      $group: {
        _id: '$conversation_id',
        unread: {
          $sum: {
            $cond: [{ $in: [user._id, '$read_by'] }, 0, 1],
          },
        },
      },
    },
  ]);
  const unreadById = new Map(unreadAgg.map((u) => [String(u._id), u.unread]));

  // Container risk levels for badges in list
  const containerIds = Array.from(new Set(items.map((c) => c.container_id)));
  const containers = await Container.find({ container_id: { $in: containerIds } })
    .select('container_id risk_level risk_score origin_country destination_port destination_country')
    .lean();
  const containerById = new Map(containers.map((c) => [c.container_id, c]));

  // Resolve participant display names (best-effort)
  const userIds = [];
  items.forEach((c) => {
    if (c.admin_id) userIds.push(String(c.admin_id));
  });
  const users = await User.find({ _id: { $in: Array.from(new Set(userIds)) } })
    .select('username full_name role')
    .lean();
  const userById = new Map(users.map((u) => [String(u._id), u]));

  const conversations = items.map((c) => {
    const last = lastById.get(String(c._id));
    const container = containerById.get(c.container_id);
    return {
      id: c._id,
      conversation_id: c.conversation_id,
      container_id: c.container_id,
      updated_at: c.updated_at,
      risk_level: container?.risk_level || null,
      last_message: last
        ? {
          preview: (last.message_text && last.message_text.trim().length > 0)
            ? last.message_text.slice(0, 120)
            : (last.attachment_name ? `📎 ${last.attachment_name}` : ''),
          timestamp: last.timestamp,
          sender: toSafeRoleLabel(last.sender_role),
        }
        : null,
      unread_count: unreadById.get(String(c._id)) || 0,
      participants: {
        exporter: c.exporter_id || 'Exporter',
        admin: c.admin_id ? (userById.get(String(c.admin_id))?.full_name || userById.get(String(c.admin_id))?.username || 'Admin') : 'Admin',
      },
    };
  });

  return res.status(200).json({ success: true, data: conversations, total, page: Number(page), limit: Number(limit) });
};

const getMessages = async (req, res) => {
  const { conversation_id } = req.params;
  const { limit, before } = req.query;

  const convo = await Conversation.findOne({ conversation_id }).lean();
  if (!convo) return res.status(404).json({ success: false, message: 'Conversation not found.', request_id: req.requestId });
  if (!(await ensureParticipant(convo, req.user))) return res.status(403).json({ success: false, message: 'Forbidden.', request_id: req.requestId });

  const cursor = before ? new Date(before) : null;
  const msgQuery = { conversation_id: convo._id };
  if (cursor && !Number.isNaN(cursor.getTime())) msgQuery.timestamp = { $lt: cursor };

  const msgs = await Message.find(msgQuery)
    .sort({ timestamp: -1 })
    .limit(Number(limit))
    .populate('sender_id', 'username full_name role')
    .lean();

  return res.status(200).json({
    success: true,
    conversation: {
      conversation_id: convo.conversation_id,
      container_id: convo.container_id,
    },
    data: msgs.reverse().map((m) => ({
      message_id: m.message_id,
      sender_id: (m.sender_id && m.sender_id._id) ? String(m.sender_id._id) : String(m.sender_id),
      sender_role: m.sender_role,
      sender_name: m.sender_id && typeof m.sender_id === 'object'
        ? (m.sender_id.full_name || m.sender_id.username || toSafeRoleLabel(m.sender_role))
        : toSafeRoleLabel(m.sender_role),
      message_text: m.message_text,
      attachment_url: m.attachment_url,
      attachment_name: m.attachment_name,
      attachment_mime: m.attachment_mime,
      timestamp: m.timestamp,
    })),
    next_before: msgs.length > 0 ? msgs[msgs.length - 1].timestamp : null,
  });
};

const sendMessage = async (req, res) => {
  const { conversation_id, message_text, attachment_url, attachment_name, attachment_mime } = req.body;
  const convo = await Conversation.findOne({ conversation_id });
  if (!convo) return res.status(404).json({ success: false, message: 'Conversation not found.', request_id: req.requestId });
  if (!(await ensureParticipant(convo, req.user))) return res.status(403).json({ success: false, message: 'Forbidden.', request_id: req.requestId });

  if (!convo.admin_id && (req.user.role === 'admin' || req.user.role === 'officer')) {
    convo.admin_id = req.user._id;
    await convo.save();
  }

  const msg = await Message.create({
    message_id: uuidv4(),
    conversation_id: convo._id,
    sender_id: req.user._id,
    sender_role: req.user.role,
    message_text: message_text || '',
    attachment_url: attachment_url || '',
    attachment_name: attachment_name || '',
    attachment_mime: attachment_mime || '',
    timestamp: new Date(),
  });

  return res.status(201).json({
    success: true,
    message: {
      message_id: msg.message_id,
      conversation_id: convo.conversation_id,
      sender_id: msg.sender_id,
      sender_role: msg.sender_role,
      sender_name: req.user.full_name || req.user.username || toSafeRoleLabel(req.user.role),
      message_text: msg.message_text,
      attachment_url: msg.attachment_url,
      attachment_name: msg.attachment_name,
      attachment_mime: msg.attachment_mime,
      timestamp: msg.timestamp,
    },
  });
};

module.exports = {
  startConversation,
  getConversations,
  getMessages,
  sendMessage,
};

