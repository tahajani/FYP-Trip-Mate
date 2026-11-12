const test = require('node:test');
const assert = require('node:assert/strict');
const mongoose = require('mongoose');
const { selectGroupCandidates, slowestPace, memberScoreMatrix } = require('../services/groupScoring');
const { invite, accept, leave, HttpError } = require('../services/groupService');
const Group = require('../models/Group');

const near = (a, b) => assert.ok(Math.abs(a - b) < 1e-9, `${a} != ${b}`);

// ---- worked example: 3 members, scores written down by hand (scoreFn replaces soloScore) ----
const TABLE = {
  A: { P1: 0.9, P2: 0.6, P3: 0.9, P4: 0.1, P5: 0.2, P6: 0.4 },
  B: { P1: 0.8, P2: 0.6, P3: 0.2, P4: 0.9, P5: 0.1, P6: 0.5 },
  C: { P1: 0.7, P2: 0.5, P3: 0.3, P4: 0.2, P5: 0.9, P6: 0.6 },
};
const poi = (name, i) => ({
  osmId: i + 1, name, kind: 'attraction', needsReview: false, interestVector: [1, 0, 0, 0, 0, 0, 0, 0, 0, 0],
  intensity: 0.5, avgVisitDuration: 60, location: { type: 'Point', coordinates: [73 + i * 0.01, 33.6] },
});
const POIS = ['P1', 'P2', 'P3', 'P4', 'P5', 'P6'].map(poi);
const member = (id, pace = 'moderate') => ({ id, name: id, interests: ['history_heritage'], pace });
const scoreFn = (m, p) => TABLE[m.id][p.name];
const opts = { scoreFn, poolSizeFn: () => 4 };

test('worked example: consensus first (min >= 0.5), then round-robin by cumSat', () => {
  const r = selectGroupCandidates([member('A'), member('B'), member('C')], 1, POIS, opts);
  assert.deepEqual(r.places.map((p) => [p.poi.name, p.source, p.selectedFor]), [
    ['P1', 'consensus', 'all'],
    ['P2', 'consensus', 'all'], // min score exactly 0.5 counts
    ['P5', 'roundrobin', 'C'], // cumSat A 1.5, B 1.4, C 1.2 -> C is lowest, takes her favourite
    ['P4', 'roundrobin', 'B'], // after P5: A 1.7, B 1.5, C 2.1 -> B is lowest
  ]);
  assert.equal(r.consensusCount, 2);
  assert.deepEqual(r.places[0].memberScores, { A: 0.9, B: 0.8, C: 0.7 });
  assert.equal(r.places[0].minScore, 0.7);
  near(r.satisfaction.A, 0.45);
  near(r.satisfaction.B, 0.6);
  near(r.satisfaction.C, 0.575);
  assert.match(r.places[2].reason, /C ki baari/);
});

test('round-robin tie goes to the earlier member; result is deterministic', () => {
  const same = { A: { P1: 0.4, P2: 0.4 }, B: { P1: 0.4, P2: 0.4 } };
  const two = [poi('P1', 0), poi('P2', 1)];
  const run = () => selectGroupCandidates([member('A'), member('B')], 1, two, { scoreFn: (m, p) => same[m.id][p.name], poolSizeFn: () => 2 });
  const r = run();
  assert.equal(r.consensusCount, 0);
  assert.equal(r.places[0].selectedFor, 'A');
  // both members score 0.4, so after A's pick both cumSat values grow equally and the tie goes to A again
  assert.equal(r.places[1].selectedFor, 'A');
  assert.deepEqual(run().places.map((p) => p.poi.name), r.places.map((p) => p.poi.name));
});

test('capacity follows the slowest member', () => {
  assert.equal(slowestPace([member('A', 'fast'), member('B', 'relaxed'), member('C', 'moderate')]), 'relaxed');
  let seen;
  selectGroupCandidates([member('A', 'fast'), member('B', 'relaxed')], 2, POIS, { scoreFn, poolSizeFn: (d, pace) => ((seen = [d, pace]), 3) });
  assert.deepEqual(seen, [2, 'relaxed']);
  assert.throws(() => slowestPace([{ pace: 'x' }]), /valid pace/);
});

test('score matrix has one row per member and one column per place', () => {
  const m = memberScoreMatrix([member('A'), member('B')], POIS, scoreFn);
  assert.equal(m.length, 2);
  assert.equal(m[0].length, 6);
  assert.equal(m[1][3], 0.9);
});

test('a member without interests is left out of the vote, with a warning', () => {
  const r = selectGroupCandidates([member('A'), member('B'), { id: 'Z', name: 'Zed', interests: [], pace: 'moderate' }], 1, POIS, opts);
  assert.ok(!('Z' in r.places[0].memberScores));
  assert.match(r.warnings[0], /Zed/);
  assert.throws(
    () => selectGroupCandidates([{ id: 'X', interests: [], pace: 'fast' }, { id: 'Y', interests: [], pace: 'fast' }], 1, POIS, opts),
    /No member has chosen interests/
  );
});

test('group size is limited to 2..4 and fewer places than N gives a warning', () => {
  assert.throws(() => selectGroupCandidates([member('A')], 1, POIS, opts), /2 to 4/);
  assert.throws(() => selectGroupCandidates(['A', 'B', 'C', 'D', 'E'].map((i) => member(i)), 1, POIS, opts), /2 to 4/);
  const r = selectGroupCandidates([member('A'), member('B')], 1, POIS.slice(0, 2), { scoreFn, poolSizeFn: () => 5 });
  assert.equal(r.places.length, 2);
  assert.match(r.warnings.join(' '), /Sirf 2 jagah/);
});

// ---- invite / accept / leave ----
const id = () => new mongoose.Types.ObjectId();
const mk = (ownerId) => new Group({ name: 'Trip', members: [{ userId: ownerId, status: 'accepted', role: 'owner' }] });

test('invite: only the owner, no duplicates, max 4 seats (invited users hold a seat)', () => {
  const [o, u1, u2, u3, u4] = [id(), id(), id(), id(), id()];
  const g = mk(o);
  assert.throws(() => invite(g, u1, u2), (e) => e instanceof HttpError && e.status === 403);
  invite(g, o, u1);
  assert.throws(() => invite(g, o, u1), (e) => e.status === 409);
  invite(g, o, u2);
  invite(g, o, u3);
  assert.throws(() => invite(g, o, u4), /zyada se zyada 4/);
  assert.equal(g.validateSync(), undefined);
});

test('accept: invited -> accepted; strangers and repeats are rejected', () => {
  const [o, u1, x] = [id(), id(), id()];
  const g = mk(o);
  invite(g, o, u1);
  assert.throws(() => accept(g, x), (e) => e.status === 404);
  accept(g, u1);
  assert.equal(g.members[1].status, 'accepted');
  assert.ok(g.members[1].joinedAt instanceof Date);
  assert.throws(() => accept(g, u1), (e) => e.status === 409);
});

test('leave: owner leaves -> next accepted member becomes owner; last one out deletes; invite can be declined', () => {
  const [o, u1, u2] = [id(), id(), id()];
  const g = mk(o);
  invite(g, o, u1);
  invite(g, o, u2);
  accept(g, u1);
  assert.deepEqual(leave(g, u2), { deleted: false }); // declined invite
  assert.deepEqual(leave(g, o), { deleted: false });
  assert.equal(g.members[0].role, 'owner');
  assert.equal(g.validateSync(), undefined);
  assert.deepEqual(leave(g, u1), { deleted: true });
  assert.throws(() => leave(g, u1), (e) => e.status === 404);
});

test('Group schema: owner count, size, duplicates, name', () => {
  const [a, b, c, d, e] = [id(), id(), id(), id(), id()];
  const m = (u, role = 'member') => ({ userId: u, status: 'accepted', role });
  assert.equal(new Group({ name: 'ok', members: [m(a, 'owner'), m(b)] }).validateSync(), undefined);
  assert.ok(new Group({ name: 'ok', members: [m(a), m(b)] }).validateSync().errors['members']); // no owner
  assert.ok(new Group({ name: 'ok', members: [m(a, 'owner'), m(b, 'owner')] }).validateSync().errors['members']); // two owners
  assert.ok(new Group({ name: 'ok', members: [m(a, 'owner'), m(b), m(c), m(d), m(e)] }).validateSync().errors['members']); // 5
  assert.ok(new Group({ name: 'ok', members: [m(a, 'owner'), m(a)] }).validateSync().errors['members']); // duplicate
  assert.ok(new Group({ members: [m(a, 'owner')] }).validateSync().errors['name']);
});