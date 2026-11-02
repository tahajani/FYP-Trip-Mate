const mongoose = require('mongoose');
const crypto = require('crypto');

const { ObjectId } = mongoose.Schema.Types;

const MAX_MEMBERS = 4; // [Suggested] plan: itineraries for 2 to 4 members; max size is [Open]

const memberSchema = new mongoose.Schema({
  userId: { type: ObjectId, ref: 'User', required: true },
  status: { type: String, enum: ['pending', 'accepted', 'declined'], default: 'pending' },
  invitedBy: { type: ObjectId, ref: 'User' },
  joinedAt: Date,
}, { _id: false });

const groupSchema = new mongoose.Schema({
  name: { type: String, required: true, trim: true },
  ownerId: { type: ObjectId, ref: 'User', required: true },
  members: [memberSchema],
  maxMembers: { type: Number, default: MAX_MEMBERS, min: 2 },
  inviteCode: { type: String, unique: true, default: () => crypto.randomBytes(4).toString('hex') },
  regionSlug: String,
  days: { type: Number, min: 1 },
  latestItineraryId: { type: ObjectId, ref: 'Itinerary', default: null },
}, { timestamps: true });

groupSchema.path('members').validate(function (members) {
  const ids = members.map((m) => String(m.userId));
  return new Set(ids).size === ids.length;
}, 'Duplicate member');

groupSchema.path('members').validate(function (members) {
  return members.filter((m) => m.status === 'accepted').length <= this.maxMembers;
}, 'Group is full');

// Builds (does not save) a group whose owner is already an accepted member.
groupSchema.statics.buildForOwner = function (name, ownerId) {
  return new this({
    name,
    ownerId,
    members: [{ userId: ownerId, status: 'accepted', joinedAt: new Date() }],
  });
};

module.exports = mongoose.model('Group', groupSchema);
module.exports.MAX_MEMBERS = MAX_MEMBERS;