const test = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const { Server } = require('socket.io');
const { io: connect } = require('socket.io-client');
const { attachGroupChat } = require('../socket/groupChat');

const MEMBERS = { G1: ['u1', 'u2'] }; // group G1 has the accepted members u1 and u2; u3 is a stranger
async function start(extra = {}) {
  const server = http.createServer();
  const io = new Server(server);
  const saved = [];
  attachGroupChat(io, {
    verifyToken: (t) => { if (!/^tok-/.test(t)) throw new Error('bad'); return t.slice(4); },
    isAcceptedMember: async (g, u) => (MEMBERS[g] || []).includes(u),
    saveMessage: async (d) => { const m = { ...d, _id: `m${saved.length + 1}`, createdAt: new Date().toISOString() }; saved.push(m); return m; },
    ...extra,
  });
  await new Promise((r) => server.listen(0, r));
  const url = `http://127.0.0.1:${server.address().port}`;
  const clients = [];
  const client = (token) => {
    const c = connect(url, { auth: { token }, reconnection: false, transports: ['websocket'] });
    clients.push(c);
    return c;
  };
  const stop = async () => { clients.forEach((c) => c.close()); io.close(); await new Promise((r) => server.close(r)); };
  return { client, saved, stop };
}
const ready = (c) => new Promise((res, rej) => { c.on('connect', res); c.on('connect_error', rej); });
const emit = (c, ev, body) => new Promise((res) => c.emit(ev, body, res));
const nextMsg = (c) => new Promise((res) => c.once('group:message', res));

test('connection needs a valid token', async () => {
  const s = await start();
  await assert.rejects(ready(s.client(undefined)), /unauthorized/);
  await assert.rejects(ready(s.client('nope')), /unauthorized/);
  await ready(s.client('tok-u1'));
  await s.stop();
});

test('only accepted members can join; a joined member message reaches everybody in the room and is saved', async () => {
  const s = await start();
  const [a, b, x] = [s.client('tok-u1'), s.client('tok-u2'), s.client('tok-u3')];
  await Promise.all([ready(a), ready(b), ready(x)]);
  assert.deepEqual(await emit(x, 'group:join', { groupId: 'G1' }), { ok: false, error: 'Tum is group ke member nahi ho' });
  assert.equal((await emit(a, 'group:join', { groupId: 'G1' })).ok, true);
  assert.equal((await emit(b, 'group:join', { groupId: 'G1' })).ok, true);
  const gotB = nextMsg(b);
  const gotA = nextMsg(a);
  const r = await emit(a, 'group:message', { groupId: 'G1', text: '  Salam sab  ' });
  assert.equal(r.ok, true);
  const [mb, ma] = await Promise.all([gotB, gotA]);
  assert.equal(mb.text, 'Salam sab');
  assert.equal(mb.senderId, 'u1');
  assert.equal(ma.id, mb.id);
  assert.equal(s.saved.length, 1);
  assert.equal(s.saved[0].text, 'Salam sab');
  await s.stop();
});

test('rejected: empty, too long, not joined, left the group, rate limit, moderation', async () => {
  const s = await start({ rate: { windowMs: 10000, max: 2 }, moderate: async (t) => (/gaali/.test(t) ? { allowed: false, reason: 'Aisi baat nahi' } : { allowed: true }) });
  const a = s.client('tok-u1');
  await ready(a);
  assert.match((await emit(a, 'group:message', { groupId: 'G1', text: 'hi' })).error, /join/); // not joined yet
  await emit(a, 'group:join', { groupId: 'G1' });
  assert.match((await emit(a, 'group:message', { groupId: 'G1', text: '   ' })).error, /Khali/);
  assert.match((await emit(a, 'group:message', { groupId: 'G1', text: 'x'.repeat(1001) })).error, /1000/);
  assert.equal((await emit(a, 'group:message', { groupId: 'G1', text: 'gaali' })).error, 'Aisi baat nahi');
  assert.equal((await emit(a, 'group:message', { groupId: 'G1', text: 'one' })).ok, true);
  assert.match((await emit(a, 'group:message', { groupId: 'G1', text: 'three' })).error, /tez|ruko/); // 2 per window
  assert.equal(s.saved.length, 1); // only 'one' was saved; the moderated and the rate-limited ones were not
  await s.stop();
});

test('a member removed from the group after joining can no longer send', async () => {
  const s = await start();
  const a = s.client('tok-u1');
  await ready(a);
  await emit(a, 'group:join', { groupId: 'G1' });
  assert.equal((await emit(a, 'group:message', { groupId: 'G1', text: 'one' })).ok, true);
  MEMBERS.G1 = ['u2']; // u1 leaves the group
  assert.match((await emit(a, 'group:message', { groupId: 'G1', text: 'two' })).error, /member nahi/);
  MEMBERS.G1 = ['u1', 'u2'];
  await s.stop();
});