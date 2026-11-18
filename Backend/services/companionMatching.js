// Companion matching: TF-IDF over the interest categories + cosine similarity, threshold 0.6 [Decided].
// STAND-IN: this is my version of F7/F8/F9. Arkum's version can replace suggestCompanions (same input and output).
const { CATEGORIES } = require('../config/categories');

const MATCH_THRESHOLD = 0.6;
const r3 = (x) => Math.round(x * 1000) / 1000;
const known = (u) => (Array.isArray(u.interests) ? u.interests.filter((c) => CATEGORIES.includes(c)) : []);
const hasInterests = (u) => known(u).length > 0;

// idf = ln((N+1)/(df+1)) + 1: an interest few people have counts more than one everybody has
function idfOf(users) {
  const N = users.length;
  return CATEGORIES.map((c) => {
    const df = users.filter((u) => known(u).includes(c)).length;
    return Math.log((N + 1) / (df + 1)) + 1;
  });
}
// tf is binary (a user either chose the interest or not), so tf-idf = idf for chosen interests, 0 otherwise
const vec = (u, idf) => CATEGORIES.map((c, i) => (known(u).includes(c) ? idf[i] : 0));
const norm = (a) => Math.sqrt(a.reduce((s, x) => s + x * x, 0));
function cosine(a, b) {
  const d = norm(a) * norm(b);
  return d === 0 ? 0 : a.reduce((s, x, i) => s + x * b[i], 0) / d;
}

// me, others: { id, name?, interests: [...], pace? }  ->  [{ userId, name, pace, score, sharedInterests }] best first
function suggestCompanions(me, others, { threshold = MATCH_THRESHOLD, limit = 20 } = {}) {
  if (!hasInterests(me)) throw new Error('Current user has no interests');
  const pool = others.filter((u) => String(u.id) !== String(me.id) && hasInterests(u));
  const idf = idfOf([me, ...pool]);
  const mv = vec(me, idf);
  return pool
    .map((u) => ({
      raw: cosine(mv, vec(u, idf)),
      userId: String(u.id), name: u.name, pace: u.pace,
      sharedInterests: known(me).filter((c) => known(u).includes(c)),
    }))
    .filter((r) => r.raw >= threshold - 1e-9)
    .sort((a, b) => b.raw - a.raw || (a.userId < b.userId ? -1 : 1))
    .slice(0, limit)
    .map(({ raw, ...r }) => ({ ...r, score: r3(raw) }));
}

module.exports = { MATCH_THRESHOLD, suggestCompanions };