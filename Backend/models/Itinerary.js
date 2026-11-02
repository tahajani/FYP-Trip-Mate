const mongoose = require('mongoose');
const { CATEGORIES } = require('../config/categories');

const { ObjectId } = mongoose.Schema.Types;

const placeSchema = new mongoose.Schema({
  poiId: { type: ObjectId, ref: 'Poi', required: true },
  name: String,
  kind: String,
  location: { lat: Number, lon: Number }, // snapshot, simple lat/lon for the map
  order: { type: Number, required: true }, // 1-based position inside the day
  visitMinutes: Number,
  travelMinutesFromPrevious: { type: Number, default: 0 },
  score: Number, // solo score; for groups the meaning of this field is still [Open] (F16)
  source: { type: String, enum: ['solo', 'consensus', 'roundrobin', 'manual'], default: 'solo' },
  selectedFor: { type: ObjectId, ref: 'User', default: null }, // whose round-robin turn
  memberScores: [{ _id: false, userId: { type: ObjectId, ref: 'User' }, score: Number }],
}, { _id: false });

const daySchema = new mongoose.Schema({
  day: { type: Number, required: true },
  places: [placeSchema],
  capacityMinutes: Number,
  visitMinutes: { type: Number, default: 0 },
  travelMinutes: { type: Number, default: 0 },
}, { _id: false });

const itinerarySchema = new mongoose.Schema({
  ownerId: { type: ObjectId, ref: 'User', required: true },
  groupId: { type: ObjectId, ref: 'Group', default: null },
  type: { type: String, enum: ['solo', 'group'], required: true },
  regionId: { type: ObjectId, ref: 'Region' },
  regionSlug: String,
  dayCount: { type: Number, required: true, min: 1 },
  participants: [{
    _id: false,
    userId: { type: ObjectId, ref: 'User' },
    interests: [{ type: String, enum: CATEGORIES }],
    pace: { type: String, enum: ['relaxed', 'moderate', 'fast'] },
  }],
  days: [daySchema],
  satisfaction: [{ _id: false, userId: { type: ObjectId, ref: 'User' }, cumSat: Number, avgScore: Number }],
  travelTimeSource: { type: String, enum: ['osrm', 'haversine'] },
  warnings: [String],
}, { timestamps: true });

itinerarySchema.index({ ownerId: 1, createdAt: -1 });
itinerarySchema.index({ groupId: 1, createdAt: -1 });

module.exports = mongoose.model('Itinerary', itinerarySchema);