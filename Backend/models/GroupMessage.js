const mongoose = require('mongoose');

const { ObjectId } = mongoose.Schema.Types;
const MAX_TEXT = 1000;

const groupMessageSchema = new mongoose.Schema(
  {
    groupId: { type: ObjectId, ref: 'Group', required: true },
    senderId: { type: ObjectId, ref: 'User', required: true },
    text: { type: String, required: true, trim: true, maxlength: MAX_TEXT },
  },
  { timestamps: { createdAt: true, updatedAt: false } }
);
groupMessageSchema.index({ groupId: 1, createdAt: -1 }); // history: newest first, per group

module.exports = mongoose.model('GroupMessage', groupMessageSchema);
module.exports.MAX_TEXT = MAX_TEXT;