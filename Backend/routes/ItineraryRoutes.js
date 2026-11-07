const express = require('express');
const auth = require('../middleware/auth');
const User = require('../models/User');
const Itinerary = require('../models/Itinerary');
const { loadRegionPois } = require('../services/candidates');
const { generateSoloItinerary } = require('../services/soloItinerary');
const { recomputeDays } = require('../services/itineraryEdit');

const router = express.Router();

// tumhara middleware/auth.js req.userId set karta hai
const userIdOf = (req) => String(req.userId);

// POST /api/itineraries/solo   body: { regionSlug, days }
router.post('/solo', auth, async (req, res) => {
  try {
    const { regionSlug, days } = req.body || {};
    if (!regionSlug || typeof regionSlug !== 'string') {
      return res.status(400).json({ message: 'regionSlug is required' });
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
      days: Number(days),
      pois,
      regionSlug,
      userId,
    });

    // Ye extra fields Itinerary model mein nahi hain, save se pehle hata do
    const { dropped, moved, poolSize, avgVisitUsed, ...toSave } = result;

    // Tumhare model mein owner ka field ownerId hai
    const saved = await Itinerary.create({ ...toSave, ownerId: userId });
    res.status(201).json({ itinerary: saved, dropped, moved, poolSize });
  } catch (err) {
    const isValidation = /pace|days|interests/i.test(err.message);
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
    await it.save(); // schema validation errors land in the catch below
    res.json({ itinerary: it, warnings: result.warnings });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

module.exports = router;
