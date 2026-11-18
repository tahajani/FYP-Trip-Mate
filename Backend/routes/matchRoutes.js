// mount in server.js: app.use('/api/matches', require('./routes/matchRoutes'));
const express = require('express');
const auth = require('../middleware/auth');
const User = require('../models/User');
const Group = require('../models/Group');
const { suggestCompanions, MATCH_THRESHOLD } = require('../services/companionMatching');

const router = express.Router();
router.use(auth);
const toMember = (u) => ({ id: String(u._id), name: u.name, interests: u.interests || [], pace: u.pace });

// GET /api/matches?groupId=<id>&limit=20
// Users whose interests match mine (TF-IDF cosine >= 0.6). With groupId: people already in that group are left out.
router.get('/', async (req, res) => {
  try {
    const me = await User.findById(req.userId).select('name interests pace').lean(); // field names not verified
    if (!me) return res.status(404).json({ message: 'User nahi mila' });
    if (!Array.isArray(me.interests) || me.interests.length === 0) {
      return res.status(400).json({ message: 'Pehle apne interests chuno, phir matching chalegi' });
    }
    const exclude = new Set([String(me._id)]);
    if (req.query.groupId) {
      let g;
      try { g = await Group.findById(String(req.query.groupId)); } catch { return res.status(400).json({ message: 'Invalid groupId' }); }
      const mine = g && g.members.find((m) => String(m.userId) === String(req.userId));
      if (!g || !mine || mine.status !== 'accepted') return res.status(403).json({ message: 'Tum is group ke member nahi ho' });
      g.members.filter((m) => m.status !== 'declined').forEach((m) => exclude.add(String(m.userId)));
    }
    const others = await User.find({ _id: { $nin: [...exclude] }, 'interests.0': { $exists: true } })
      .select('name interests pace').limit(500).lean();
    const limit = Math.min(Math.max(parseInt(req.query.limit, 10) || 20, 1), 50);
    const suggestions = suggestCompanions(toMember(me), others.map(toMember), { limit });
    res.json({ threshold: MATCH_THRESHOLD, count: suggestions.length, suggestions }); // no emails are exposed
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

module.exports = router;