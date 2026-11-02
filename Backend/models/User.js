// models/User.js
const mongoose = require('mongoose');
const { CATEGORIES } = require('../config/categories');

const userSchema = new mongoose.Schema({
  name: { type: String, required: true, trim: true },
  email: { type: String, required: true, unique: true, lowercase: true, trim: true },
  password: { type: String }, // empty for social-login users
  // unique + sparse: one account per provider id, and users without it are allowed
  googleId: { type: String, unique: true, sparse: true },
  facebookId: { type: String, unique: true, sparse: true },
  interests: { type: [{ type: String, enum: CATEGORIES }], default: [] },
  pace: { type: String, enum: ['relaxed', 'moderate', 'fast'], default: 'moderate' },
}, { timestamps: true });

module.exports = mongoose.model('User', userSchema);