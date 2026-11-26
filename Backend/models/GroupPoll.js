// models/GroupPoll.js  a vote inside a group (opened by the fairness rule or by the owner)
const mongoose = require('mongoose');

const { ObjectId } = mongoose.Schema.Types;

const pollSchema = new mongoose.Schema({
  groupId: { type: ObjectId, ref: 'Group', required: true, index: true },
  itineraryId: { type: ObjectId, ref: 'Itinerary', default: null }, // the plan that triggered a fairness poll
  type: { type: String, enum: ['fairness', 'custom'], required: true },
  question: { type: String, required: true, maxlength: 200 },
  note: { type: String, default: '', maxlength: 300 },
  options: [{ _id: false, id: { type: String, required: true }, label: { type: String, required: true, maxlength: 60 } }],
  votes: [{ _id: false, userId: { type: ObjectId, ref: 'User', required: true }, optionId: { type: String, required: true } }],
  status: { type: String, enum: ['open', 'closed'], default: 'open' },
  createdBy: { type: ObjectId, ref: 'User', default: null }, // null = opened by the fairness rule
  closedAt: { type: Date, default: null },
}, { timestamps: true });

pollSchema.index({ groupId: 1, createdAt: -1 });

module.exports = mongoose.model('GroupPoll', pollSchema);