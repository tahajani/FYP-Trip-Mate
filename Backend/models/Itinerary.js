const mongoose = require('mongoose');
const { CATEGORIES } = require('../config/categories');

const { ObjectId } = mongoose.Schema.Types;

const placeSchema = new mongoose.Schema({
  // a place the user added from Nominatim has no POI in our database, so poiId is required only for other sources
  poiId: { type: ObjectId, ref: 'Poi', required: function () { return this.source !== 'manual'; } },
  name: String,
  kind: String,
  location: { lat: Number, lon: Number }, // snapshot, simple lat/lon for the map
  order: { type: Number, required: true }, // 1-based position inside the day
  visitMinutes: Number,
  travelMinutesFromPrevious: { type: Number, default: 0 },
  score: Number, // solo score; for groups the meaning of this field is still [Open] (F16)
  matched: [{ type: String, enum: CATEGORIES }], // which of the user's chosen interests this place fits
  source: { type: String, enum: ['solo', 'consensus', 'roundrobin', 'manual'], default: 'solo' },
  selectedFor: { type: ObjectId, ref: 'User', default: null }, // whose round-robin turn
  memberScores: [{ _id: false, userId: { type: ObjectId, ref: 'User' }, score: Number }],
}, { _id: false });

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

const daySchema = new mongoose.Schema({
  day: { type: Number, required: true },
  date: { type: String, match: DATE_RE }, // 'YYYY-MM-DD', set when the trip was planned with dates
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
  startDate: { type: String, match: DATE_RE }, // 'YYYY-MM-DD'
  endDate: { type: String, match: DATE_RE },
  dayCount: { type: Number, required: true, min: 1 }, // always equals the number of days from startDate to endDate
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
