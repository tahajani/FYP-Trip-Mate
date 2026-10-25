const mongoose = require('mongoose');

const regionSchema = new mongoose.Schema({
  name: { type: String, required: true },
  slug: { type: String, required: true, unique: true },
  bbox: { south: Number, west: Number, north: Number, east: Number },
  seeded: { type: Boolean, default: false },
  seededAt: Date,
  stats: { total: Number, usable: Number, needsReview: Number },
});

module.exports = mongoose.model('Region', regionSchema);