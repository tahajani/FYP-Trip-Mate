const mongoose = require('mongoose');

const poiSchema = new mongoose.Schema({
  osmType: { type: String, required: true },
  osmId: { type: Number, required: true },
  name: String,
  location: {
    type: { type: String, enum: ['Point'], default: 'Point' },
    coordinates: { type: [Number], required: true }, // [lon, lat]
  },
  regionId: { type: mongoose.Schema.Types.ObjectId, ref: 'Region', index: true },
  kind: String, // fort, museum, mosque... (duration/intensity isi se aate hain)
  interestVector: { type: [Number], default: null }, // CATEGORIES ki order me, length 10
  avgVisitDuration: Number, // minutes
  intensity: Number, // 0 to 1
  needsReview: { type: Boolean, default: false },
  reviewReason: String,
  tags: { type: Object }, // raw OSM tags, review ke liye
});

poiSchema.index({ location: '2dsphere' });
poiSchema.index({ osmType: 1, osmId: 1 }, { unique: true });

module.exports = mongoose.model('Poi', poiSchema);