// mount in server.js: app.use('/api/groups', require('./routes/groupRoutes'));
const express = require('express');
const auth = require('../middleware/auth');
const Group = require('../models/Group');
const User = require('../models/User');
const { invite, accept, leave, HttpError } = require('../services/groupService');

const router = express.Router();
router.use(auth);
const uid = (req) => String(req.userId);
const fail = (res, err) => res.status(err instanceof HttpError ? err.status : 500).json({ message: err.message });

// loads the group and checks the caller is in it (accepted or invited)
async function load(req) {
  let g;
  try {
    g = await Group.findById(req.params.id);
  } catch {
    throw new HttpError(400, 'Invalid id');
  }
  if (!g) throw new HttpError(404, 'Group nahi mila');
  if (!g.members.some((m) => String(m.userId) === uid(req))) throw new HttpError(403, 'Tum is group ke member nahi ho');
  return g;
}

// POST /api/groups  { name }
router.post('/', async (req, res) => {
  try {
    const name = String((req.body || {}).name || '').trim();
    if (!name) return res.status(400).json({ message: 'name is required' });
    const g = await Group.create({ name, members: [{ userId: uid(req), status: 'accepted', role: 'owner', joinedAt: new Date() }] });
    res.status(201).json(g);
  } catch (err) {
    fail(res, err);
  }
});

// GET /api/groups   my groups and my pending invites
router.get('/', async (req, res) => {
  try {
    const list = await Group.find({ 'members.userId': uid(req) }).sort({ updatedAt: -1 });
    res.json(
      list.map((g) => {
        const me = g.members.find((m) => String(m.userId) === uid(req));
        return {
          id: g._id,
          name: g.name,
          myStatus: me.status,
          myRole: me.role,
          acceptedCount: g.members.filter((m) => m.status === 'accepted').length,
          invitedCount: g.members.filter((m) => m.status === 'invited').length,
        };
      })
    );
  } catch (err) {
    fail(res, err);
  }
});

// GET /api/groups/:id
router.get('/:id', async (req, res) => {
  try {
    const g = await load(req);
    await g.populate('members.userId', 'name email'); // fields not verified: depends on your User model
    res.json(g);
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
    res.json({ ok: true, seats: g.members.length });
  } catch (err) {
    fail(res, err);
  }
});

// POST /api/groups/:id/accept
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

// POST /api/groups/:id/leave   (also declines an invite)
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

module.exports = router;