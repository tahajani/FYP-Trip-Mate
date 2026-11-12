const mongoose = require('mongoose');
const { MAX_GROUP_SIZE } = require('../services/groupScoring');

const memberSchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    status: { type: String, enum: ['invited', 'accepted'], default: 'invited' },
    role: { type: String, enum: ['owner', 'member'], default: 'member' },
    joinedAt: Date,
  },
  { _id: false }
);

const groupSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true, maxlength: 60 },
    members: {
      type: [memberSchema],
      validate: [
        { validator: (a) => a.length >= 1 && a.length <= MAX_GROUP_SIZE, message: `A group has 1 to ${MAX_GROUP_SIZE} members` },
        { validator: (a) => a.filter((m) => m.role === 'owner').length === 1, message: 'A group needs exactly one owner' },
        { validator: (a) => new Set(a.map((m) => String(m.userId))).size === a.length, message: 'A user can be in a group only once' },
      ],
    },
  },
  { timestamps: true }
);
groupSchema.index({ 'members.userId': 1 });

module.exports = mongoose.models.Group || mongoose.model('Group', groupSchema);