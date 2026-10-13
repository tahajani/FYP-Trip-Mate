// models/User.js
const mongoose = require('mongoose');

const userSchema = new mongoose.Schema({
  name: { type: String, required: true },
  email: { type: String, required: true, unique: true },
  password: { type: String }, // Optional agar social login use ho raha hai
  googleId: { type: String },
  facebookId: { type: String },
  // Shared vocabulary interest categories
  interests: {
    type: [String],
    default: []
  },
  // Pace setting: 'relaxed', 'moderate', or 'fast'
  pace: {
    type: String,
    enum: ['relaxed', 'moderate', 'fast'],
    default: 'moderate'
  }
}, { timestamps: true });

module.exports = mongoose.model('User', userSchema);