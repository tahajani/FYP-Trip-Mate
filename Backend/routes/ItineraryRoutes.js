const express = require('express');
const auth = require('../middleware/auth');
const User = require('../models/User');
const Itinerary = require('../models/Itinerary');
const { loadRegionPois } = require('../services/candidates');
const { generateSoloItinerary, MAX_DAYS } = require('../services/soloItinerary');
const { recomputeDays } = require('../services/itineraryEdit');
const { validateTripDates } = require('../utils/dates');

const router = express.Router();

// tumhara middleware/auth.js req.userId set karta hai
const userIdOf = (req) => String(req.userId);

// POST /api/itineraries/solo   body: { regionSlug, startDate: 'YYYY-MM-DD', endDate: 'YYYY-MM-DD' }
// The number of days comes from the dates (both days included). Old clients may still send { regionSlug, days }.
router.post('/solo', auth, async (req, res) => {
  try {
    const { regionSlug, startDate, endDate, days: daysBody } = req.body || {};
    if (!regionSlug || typeof regionSlug !== 'string') {
      return res.status(400).json({ message: 'regionSlug is required' });
    }

    let days;
    let start = null;
    if (startDate || endDate) {
      try {
        days = validateTripDates(startDate, endDate, { maxDays: MAX_DAYS });
        start = startDate;
      } catch (e) {
        return res.status(400).json({ message: e.message });
      }
    } else {
      days = Number(daysBody); // no dates: the trip is not tied to a calendar
    }

    const userId = userIdOf(req);
    const user = await User.findById(userId).select('interests pace');
    if (!user) return res.status(404).json({ message: 'User not found' });
    if (!user.interests || user.interests.length === 0) {
      return res.status(400).json({ message: 'Pehle onboarding mein interests chuno.' });
    }

    const pois = await loadRegionPois(regionSlug);

    const result = await generateSoloItinerary({
      user: { interests: user.interests, pace: user.pace },
      days,
      pois,
      regionSlug,
      userId,
      startDate: start,
    });

    // Ye extra fields Itinerary model mein nahi hain, save se pehle hata do
    const { dropped, moved, poolSize, avgVisitUsed, coverage, ...toSave } = result;

    // Tumhare model mein owner ka field ownerId hai
    const saved = await Itinerary.create({ ...toSave, ownerId: userId });
    res.status(201).json({ itinerary: saved, dropped, moved, poolSize, coverage });
  } catch (err) {
    const isValidation = /pace|days|interests|date/i.test(err.message);
    res.status(isValidation ? 400 : 500).json({ message: err.message });
  }
});

// GET /api/itineraries  (meri itineraries, nayi pehle)
router.get('/', auth, async (req, res) => {
  try {
    const list = await Itinerary.find({ ownerId: userIdOf(req) })
      .sort({ createdAt: -1 })
      .select('-__v');
    res.json(list);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// GET /api/itineraries/:id
router.get('/:id', auth, async (req, res) => {
  try {
    const it = await Itinerary.findById(req.params.id);
    if (!it) return res.status(404).json({ message: 'Not found' });
    if (String(it.ownerId) !== userIdOf(req)) {
      return res.status(403).json({ message: 'Ye itinerary tumhari nahi hai' });
    }
    res.json(it);
  } catch (err) {
    res.status(400).json({ message: 'Invalid id' });
  }
});

// PUT /api/itineraries/:id/days   body: { days: [{ day, places: [...] }] }
// Day adjustment: add / remove / reorder / move between days. Travel times are recomputed (OSRM, else estimate).
// Sending the current days unchanged is also the way to ask for the road times again.
router.put('/:id/days', auth, async (req, res) => {
  try {
    const it = await Itinerary.findById(req.params.id);
    if (!it) return res.status(404).json({ message: 'Not found' });
    if (String(it.ownerId) !== userIdOf(req)) {
      return res.status(403).json({ message: 'Ye itinerary tumhari nahi hai' });
    }

    const existing = it.days.map((d) => (d.toObject ? d.toObject() : d));
    let result;
    try {
      result = await recomputeDays(existing, (req.body || {}).days);
    } catch (e) {
      return res.status(400).json({ message: e.message });
    }

    it.days = result.days;
    if (result.source) it.travelTimeSource = result.source;
    // once the road times are there, the old "estimated" warning is no longer true
    if (result.source === 'osrm') {
      it.warnings = (it.warnings || []).filter((w) => !/estimated from straight-line/i.test(w));
    }
    await it.save(); // schema validation errors land in the catch below
    res.json({ itinerary: it, warnings: result.warnings });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

module.exports = router;
