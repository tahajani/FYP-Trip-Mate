const test = require('node:test');
const assert = require('node:assert/strict');
const { suggestCompanions, MATCH_THRESHOLD } = require('../services/companionMatching');

const u = (id, interests, pace = 'moderate') => ({ id, name: id.toUpperCase(), interests, pace });

test('threshold is 0.6', () => assert.equal(MATCH_THRESHOLD, 0.6));

test('hand-checked value: me [A,B] vs [A,C], two users in the corpus, score about 0.336', () => {
  // idf(A)=ln(3/3)+1=1, idf(B)=idf(C)=ln(3/2)+1=1.405465; dot=1, |v|^2 = 1+1.975=2.975 -> 1/2.975 = 0.336
  const r = suggestCompanions(u('me', ['history_heritage', 'religious']), [u('x', ['history_heritage', 'food_cafes'])], { threshold: 0 });
  assert.ok(Math.abs(r[0].score - 0.336) < 0.001, String(r[0].score));
  assert.deepEqual(r[0].sharedInterests, ['history_heritage']);
});

test('identical interests score 1, disjoint score 0 and are filtered out, self is excluded', () => {
  const me = u('me', ['history_heritage', 'religious']);
  const r = suggestCompanions(me, [u('same', ['religious', 'history_heritage']), u('none', ['food_cafes']), me]);
  assert.deepEqual(r.map((x) => [x.userId, x.score]), [['same', 1]]);
});

test('only users with score >= 0.6 are suggested, best first, limit applies, result is deterministic', () => {
  const me = u('me', ['history_heritage', 'religious', 'museums_art']);
  const others = [
    u('b', ['history_heritage', 'religious']),
    u('a', ['history_heritage', 'religious']), // same score as b: tie goes to the smaller id
    u('c', ['history_heritage', 'religious', 'museums_art']),
    u('d', ['history_heritage', 'food_cafes', 'viewpoints']),
  ];
  const r = suggestCompanions(me, others);
  assert.ok(r.every((x) => x.score >= 0.6));
  assert.equal(r[0].userId, 'c');
  assert.deepEqual(r.slice(1, 3).map((x) => x.userId), ['a', 'b']);
  assert.ok(!r.some((x) => x.userId === 'd'));
  assert.equal(suggestCompanions(me, others, { limit: 1 }).length, 1);
  assert.deepEqual(suggestCompanions(me, others), r);
});

test('a user without interests is ignored; the caller needs interests', () => {
  assert.deepEqual(suggestCompanions(u('me', ['religious']), [u('z', [])]), []);
  assert.throws(() => suggestCompanions(u('me', []), []), /no interests/);
});