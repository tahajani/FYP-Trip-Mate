// Full group flow against the RUNNING backend (npm start in another terminal):
//   node scripts/tryGroupFlow.js owner@gmail.com member@gmail.com [region=lahore] [--keep]
// Both users must exist, have interests and pace (log in once in the app with each account).
require('dotenv').config();
const jwt = require('jsonwebtoken');
const mongoose = require('mongoose');
const { io } = require('socket.io-client');
const User = require('../models/User');
const Group = require('../models/Group');
const GroupMessage = require('../models/GroupMessage');
const Itinerary = require('../models/Itinerary');

const BASE = process.env.API_URL || `http://localhost:${process.env.PORT || 5000}`;
const args = process.argv.slice(2).filter((a) => !a.startsWith('--'));
const keep = process.argv.includes('--keep');
const [ownerEmail, memberEmail, region = 'lahore'] = args;
const day = (n) => new Date(Date.now() + n * 86400000).toISOString().slice(0, 10);
// the id is put in three fields so it works whichever one middleware/auth.js reads (NOT VERIFIED which)
const sign = (u) => jwt.sign({ id: String(u._id), userId: String(u._id), _id: String(u._id) }, process.env.JWT_SECRET, { expiresIn: '1h' });

let passed = 0;
let failed = 0;
const check = (label, ok, detail = '') => {
  ok ? passed++ : failed++;
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}${detail ? '  -> ' + detail : ''}`);
  return ok;
};
async function call(token, method, path, body) {
  const res = await fetch(`${BASE}/api${path}`, {
    method,
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` }, // NOT VERIFIED: header style of your auth middleware
    body: body ? JSON.stringify(body) : undefined,
  });
  return { status: res.status, data: await res.json().catch(() => ({})) };
}
function connect(token) {
  return new Promise((resolve, reject) => {
    const s = io(BASE, { auth: { token }, transports: ['websocket'] });
    s.on('connect', () => resolve(s));
    s.on('connect_error', (e) => reject(new Error('socket: ' + e.message)));
  });
}
const emit = (s, ev, body) => new Promise((r) => s.emit(ev, body, r));

async function main() {
  if (!ownerEmail || !memberEmail) throw new Error('Usage: node scripts/tryGroupFlow.js <ownerEmail> <memberEmail> [region] [--keep]');
  await mongoose.connect(process.env.MONGO_URI);
  const [owner, member] = await Promise.all([
    User.findOne({ email: ownerEmail.toLowerCase() }),
    User.findOne({ email: memberEmail.toLowerCase() }),
  ]);
  if (!owner || !member) throw new Error('Owner or member email not found in the users collection');
  const [tO, tM] = [sign(owner), sign(member)];
  let groupId;
  const sockets = [];
  try {
    let r = await call(tO, 'POST', '/groups', { name: 'Script test group', regionSlug: region });
    if (!check('create group (201)', r.status === 201, `status ${r.status} ${r.data.message || ''}`)) return;
    groupId = r.data._id;

    r = await call(tO, 'GET', `/matches?groupId=${groupId}`);
    check('matches endpoint answers (200)', r.status === 200, r.status === 200 ? `${r.data.count} suggestion(s)` : `status ${r.status} ${r.data.message || ''}`);

    r = await call(tO, 'POST', `/groups/${groupId}/invite`, { userId: String(member._id) });
    check('invite member by userId (200)', r.status === 200, `status ${r.status} ${r.data.message || ''}`);

    r = await call(tM, 'GET', '/groups');
    const listed = Array.isArray(r.data) ? r.data.some((g) => String(g._id) === String(groupId)) : false;
    check('member sees the pending invite in GET /groups', r.status === 200 && listed, `status ${r.status}`);

    r = await call(tM, 'POST', `/groups/${groupId}/accept`);
    check('member accepts (200)', r.status === 200, `status ${r.status} ${r.data.message || ''}`);

    r = await call(tO, 'POST', `/groups/${groupId}/itinerary`, { startDate: day(10), endDate: day(12) });
    const ok = check('owner generates the group itinerary (201)', r.status === 201, `status ${r.status} ${r.data.message || ''}`);
    if (ok) {
      const places = r.data.itinerary.days.flatMap((d) => d.places);
      const bySource = places.reduce((a, p) => ((a[p.source] = (a[p.source] || 0) + 1), a), {});
      console.log(`      places: ${places.length}  sources: ${JSON.stringify(bySource)}  travel: ${r.data.itinerary.travelTimeSource}`);
      console.log(`      satisfaction: ${JSON.stringify(r.data.satisfaction)}`);
      if (r.data.itinerary.warnings?.length) console.log(`      warnings: ${r.data.itinerary.warnings.join(' | ')}`);
      check('every place has score, minScore and memberScores', places.every((p) => typeof p.score === 'number' && typeof p.minScore === 'number' && p.memberScores?.length === 2), 'add `minScore: Number` to placeSchema if this fails');
    }
    r = await call(tM, 'GET', `/groups/${groupId}/itinerary`);
    check('member can read the group itinerary (200)', r.status === 200, `status ${r.status}`);

    // live chat
    const [so, sm] = [await connect(tO), await connect(tM)];
    sockets.push(so, sm);
    check('both join the chat room', (await emit(so, 'group:join', { groupId })).ok && (await emit(sm, 'group:join', { groupId })).ok);
    const got = new Promise((resolve) => { sm.on('group:message', resolve); setTimeout(() => resolve(null), 3000); });
    const ack = await emit(so, 'group:message', { groupId, text: 'hello from the script' });
    check('owner sends a message (ack ok)', ack.ok, ack.error || '');
    const m = await got;
    check('member receives it live', m && m.text === 'hello from the script');
    r = await call(tM, 'GET', `/groups/${groupId}/messages?limit=10`);
    check('history has the message (200)', r.status === 200 && JSON.stringify(r.data).includes('hello from the script'), `status ${r.status}`);
  } finally {
    sockets.forEach((s) => s.disconnect());
    if (groupId && !keep) {
      await Promise.all([Group.deleteOne({ _id: groupId }), GroupMessage.deleteMany({ groupId }), Itinerary.deleteMany({ groupId })]);
      console.log('cleanup: test group, messages and itinerary deleted (use --keep to keep them)');
    }
    await mongoose.disconnect();
  }
  console.log(`\n${passed} passed, ${failed} failed`);
  process.exitCode = failed ? 1 : 0;
}
main().catch((e) => { console.error('ERROR:', e.message); process.exit(1); });