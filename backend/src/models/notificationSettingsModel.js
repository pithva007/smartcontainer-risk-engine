const mongoose = require('mongoose');

const notificationSchema = new mongoose.Schema(
  {
    user_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      unique: true,
    },
    highRisk: {
      type: Boolean,
      default: true,
    },
    anomaly: {
      type: Boolean,
      default: false,
    },
    weeklySummary: {
      type: Boolean,
      default: true,
    },
  },
  { timestamps: true }
);

module.exports = mongoose.model('NotificationSettings', notificationSchema);
