// mount in server.js: app.use('/api/groups', require('./routes/groupRoutes'));
const express = require('express');
const auth = require('../middleware/auth');
const Group = require('../models/Group');
const User = require('../models/User');
const Itinerary = require('../models/Itinerary');
const GroupMessage = require('../models/GroupMessage');
const { loadRegionPois } = require('../services/candidates');
const { generateGroupItinerary } = require('../services/groupItinerary');
const { validateTripDates } = require('../utils/dates');
const { invite, accept, decline, leave, joinByCode, HttpError } = require('../services/groupService');

const router = express.Router();
router.use(auth);
const uid = (req) => String(req.userId);
const mine = (g, id) => g.members.find((m) => String(m.userId) === id);
const count = (g, status) => g.members.filter((m) => m.status === status).length;

function fail(res, err) {
  const status = err instanceof HttpError ? err.status : err.name === 'ValidationError' ? 400 : 500;
  res.status(status).json({ message: err.message });
}

// loads the group; the caller must be accepted or pending (a declined user no longer sees the group)
async function load(req) {
  let g;
  try {
    g = await Group.findById(req.params.id);
  } catch {
    throw new HttpError(400, 'Invalid id');
  }
  if (!g) throw new HttpError(404, 'Group nahi mila');
  const me = mine(g, uid(req));
  if (!me || me.status === 'declined') throw new HttpError(403, 'Tum is group ke member nahi ho');
  return g;
}

// POST /api/groups  { name, regionSlug?, days? }
router.post('/', async (req, res) => {
  try {
    const { name, regionSlug, days } = req.body || {};
    const n = String(name || '').trim();
    if (!n) return res.status(400).json({ message: 'name is required' });
    if (regionSlug !== undefined && typeof regionSlug !== 'string') return res.status(400).json({ message: 'regionSlug must be a string' });
    if (days !== undefined && !(Number.isInteger(days) && days >= 1 && days <= 14)) {
      return res.status(400).json({ message: 'days must be an integer from 1 to 14' });
    }
    const g = Group.buildForOwner(n, uid(req));
    if (regionSlug) g.regionSlug = regionSlug;
    if (days) g.days = days;
    await g.save();
    res.status(201).json(g);
  } catch (err) {
    fail(res, err);
  }
});

// POST /api/groups/join  { code }   join with the group's inviteCode
router.post('/join', async (req, res) => {
  try {
    const code = String((req.body || {}).code || '').trim().toLowerCase();
    if (!code) return res.status(400).json({ message: 'code is required' });
    const g = await Group.findOne({ inviteCode: code });
    if (!g) return res.status(404).json({ message: 'Ye code galat hai' });
    joinByCode(g, uid(req));
    await g.save();
    res.json({ ok: true, groupId: g._id });
  } catch (err) {
    fail(res, err);
  }
});

// GET /api/groups   my groups and my pending invites (declined ones are hidden)
router.get('/', async (req, res) => {
  try {
    const list = await Group.find({ members: { $elemMatch: { userId: uid(req), status: { $ne: 'declined' } } } }).sort({ updatedAt: -1 });
    res.json(
      list.map((g) => ({
        id: g._id,
        name: g.name,
        regionSlug: g.regionSlug,
        days: g.days,
        myStatus: mine(g, uid(req)).status,
        isOwner: String(g.ownerId) === uid(req),
        acceptedCount: count(g, 'accepted'),
        pendingCount: count(g, 'pending'),
        maxMembers: g.maxMembers,
      }))
    );
  } catch (err) {
    fail(res, err);
  }
});

// GET /api/groups/:id   (inviteCode is shown to the owner only)
router.get('/:id', async (req, res) => {
  try {
    const g = await load(req);
    const isOwner = String(g.ownerId) === uid(req);
    await g.populate('members.userId', 'name email'); // fields not verified: depends on your User model
    const out = g.toObject();
    if (!isOwner) delete out.inviteCode;
    res.json(out);
  } catch (err) {
    fail(res, err);
  }
});

// POST /api/groups/:id/invite  { email }   (owner only)
router.post('/:id/invite', async (req, res) => {
  try {
    const g = await load(req);
    const email = String((req.body || {}).email || '').trim().toLowerCase();
    if (!email) return res.status(400).json({ message: 'email is required' });
    const target = await User.findOne({ email }).select('_id');
    if (!target) return res.status(404).json({ message: 'Is email ka koi user nahi mila' });
    invite(g, uid(req), target._id);
    await g.save();
    res.json({ ok: true, acceptedCount: count(g, 'accepted'), pendingCount: count(g, 'pending') });
  } catch (err) {
    fail(res, err);
  }
});

router.post('/:id/accept', async (req, res) => {
  try {
    const g = await load(req);
    accept(g, uid(req));
    await g.save();
    res.json({ ok: true });
  } catch (err) {
    fail(res, err);
  }
});

router.post('/:id/decline', async (req, res) => {
  try {
    const g = await load(req);
    decline(g, uid(req));
    await g.save();
    res.json({ ok: true });
  } catch (err) {
    fail(res, err);
  }
});

router.post('/:id/leave', async (req, res) => {
  try {
    const g = await load(req);
    const { deleted } = leave(g, uid(req));
    if (deleted) await g.deleteOne();
    else await g.save();
    res.json({ ok: true, groupDeleted: deleted });
  } catch (err) {
    fail(res, err);
  }
});

// POST /api/groups/:id/itinerary  { startDate, endDate, regionSlug? }   (owner only)
// Builds the group itinerary from the ACCEPTED members and saves it as the group's latest one.
router.post('/:id/itinerary', async (req, res) => {
  try {
    const g = await load(req);
    if (String(g.ownerId) !== uid(req)) return res.status(403).json({ message: 'Sirf owner group itinerary bana sakta hai' });
    const { startDate, endDate, regionSlug: bodyRegion } = req.body || {};
    let days;
    try {
      days = validateTripDates(startDate, endDate, { maxDays: 14 });
    } catch (e) {
      return res.status(400).json({ message: e.message });
    }
    const regionSlug = g.regionSlug || bodyRegion;
    if (!regionSlug || typeof regionSlug !== 'string') return res.status(400).json({ message: 'regionSlug is required' });

    const ids = g.members.filter((m) => m.status === 'accepted').map((m) => m.userId);
    if (ids.length < 2) return res.status(400).json({ message: 'Itinerary ke liye kam az kam 2 accepted members chahiye' });
    const users = await User.find({ _id: { $in: ids } }).select('name interests pace'); // field names not verified
    const members = users.map((u) => ({ id: String(u._id), name: u.name, interests: u.interests || [], pace: u.pace }));

    const pois = await loadRegionPois(regionSlug);
    const result = await generateGroupItinerary({ members, days, pois, regionSlug, ownerId: g.ownerId, groupId: g._id, startDate });

    // these extras are not part of the Itinerary document
    const { dropped, moved, poolSize, avgVisitUsed, selectedCount, consensusCount, pace, ...toSave } = result;
    const saved = await Itinerary.create(toSave);
    g.latestItineraryId = saved._id;
    g.regionSlug = regionSlug;
    g.days = days;
    await g.save();
    res.status(201).json({ itinerary: saved, satisfaction: result.satisfaction, consensusCount, dropped, moved });
  } catch (err) {
    if (!(err instanceof HttpError) && err.name !== 'ValidationError' && /member|days|interests|pace|date/i.test(err.message)) {
      return res.status(400).json({ message: err.message });
    }
    fail(res, err);
  }
});

// GET /api/groups/:id/itinerary   the latest group itinerary (accepted members only)
router.get('/:id/itinerary', async (req, res) => {
  try {
    const g = await load(req);
    if (mine(g, uid(req)).status !== 'accepted') return res.status(403).json({ message: 'Pehle invite accept karo' });
    if (!g.latestItineraryId) return res.status(404).json({ message: 'Abhi koi itinerary nahi bani' });
    const it = await Itinerary.findById(g.latestItineraryId);
    if (!it) return res.status(404).json({ message: 'Itinerary nahi mili' });
    res.json(it);
  } catch (err) {
    fail(res, err);
  }
});

// GET /api/groups/:id/messages?before=<ISO date>&limit=50   chat history, oldest first (accepted members only)
router.get('/:id/messages', async (req, res) => {
  try {
    const g = await load(req);
    if (mine(g, uid(req)).status !== 'accepted') return res.status(403).json({ message: 'Pehle invite accept karo' });
    const limit = Math.min(Math.max(parseInt(req.query.limit, 10) || 50, 1), 100);
    const q = { groupId: g._id };
    if (req.query.before) {
      const t = new Date(req.query.before);
      if (Number.isNaN(t.getTime())) return res.status(400).json({ message: 'before must be an ISO date' });
      q.createdAt = { $lt: t };
    }
    const rows = await GroupMessage.find(q).sort({ createdAt: -1 }).limit(limit);
    res.json(rows.reverse().map((r) => ({ id: r._id, senderId: r.senderId, text: r.text, createdAt: r.createdAt })));
  } catch (err) {
    fail(res, err);
  }
});

module.exports = router;