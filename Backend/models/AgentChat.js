// models/AgentChat.js  one assistant conversation per user (the user comes from the JWT, never from the request body)
const mongoose = require('mongoose');

const messageSchema = new mongoose.Schema({
  role: { type: String, enum: ['user', 'assistant'], required: true },
  content: { type: String, required: true, maxlength: 4000 },
  createdAt: { type: Date, default: Date.now },
}, { _id: false });

const agentChatSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, unique: true },
  messages: [messageSchema],
}, { timestamps: true });

module.exports = mongoose.model('AgentChat', agentChatSchema);