// Group candidate selection: per-member scores -> consensus places -> round-robin by cumSat.
// Pure function, no database. Members: [{ id, name?, interests: [...], pace }]
const { isUsable, dedupePois } = require('./candidates');
const { soloScore, poolSize } = require('./scoring');

const PACES = ['relaxed', 'moderate', 'fast'];
const CONSENSUS_MIN = 0.5; // [Decided] consensus = every member scores the place >= 0.5
const MAX_GROUP_SIZE = 4; // [Suggested] confirm

const mean = (a) => a.reduce((s, x) => s + x, 0) / a.length;
const r3 = (x) => Math.round(x * 1000) / 1000;

// F14 [Suggested]: the group moves at the slowest member's pace.
function slowestPace(members) {
  const idx = members.map((m) => PACES.indexOf(m.pace)).filter((i) => i >= 0);
  if (idx.length === 0) throw new Error('No member has a valid pace');
  return PACES[Math.min(...idx)];
}

// scores[m][p] = member m's score for place p (each member's OWN pace goes into their score).
function memberScoreMatrix(members, pois, scoreFn = soloScore) {
  return members.map((m) => pois.map((poi) => scoreFn(m, poi)));
}

function selectGroupCandidates(members, days, pois, options = {}) {
  const { consensusMin = CONSENSUS_MIN, dedupe = true, scoreFn = soloScore, poolSizeFn = poolSize } = options;
  if (!Array.isArray(members) || members.length < 2 || members.length > MAX_GROUP_SIZE) {
    throw new Error(`A group needs 2 to ${MAX_GROUP_SIZE} members`);
  }
  if (!Number.isInteger(days) || days < 1) throw new Error('days must be a positive integer');

  const warnings = [];
  // members without interests cannot score anything: they are left out of the vote (suggested handling)
  const voters = members.filter((m) => Array.isArray(m.interests) && m.interests.length > 0);
  members
    .filter((m) => !voters.includes(m))
    .forEach((m) => warnings.push(`${m.name || m.id} ne interests nahi chune, is liye uski pasand score me shamil nahi.`));
  if (voters.length === 0) throw new Error('No member has chosen interests');
  voters.forEach((v) => {
    if (!PACES.includes(v.pace)) throw new Error(`Member ${v.id} has an invalid pace`);
  });

  const pace = slowestPace(members);
  const usableAll = pois.filter(isUsable);
  const usable = dedupe ? dedupePois(usableAll) : usableAll;
  if (usable.length === 0) return { places: [], poolSize: 0, avgVisitUsed: null, pace, satisfaction: {}, consensusCount: 0, warnings };

  const scores = memberScoreMatrix(voters, usable, scoreFn);
  const info = usable.map((poi, p) => {
    const s = voters.map((_, v) => scores[v][p]);
    return { poi, p, s, min: Math.min(...s), mean: mean(s) };
  });
  const osm = (r) => r.poi.osmId || 0;
  const byMean = (a, b) => b.mean - a.mean || osm(a) - osm(b);

  const top = [...info].sort(byMean).slice(0, 3 * days);
  const avgVisitUsed = mean(top.map((r) => r.poi.avgVisitDuration));
  const N = Math.max(1, poolSizeFn(days, pace, avgVisitUsed));

  // 1) consensus: best "worst score" first; ties -> higher mean -> lower osmId
  const picked = [];
  const taken = new Set();
  const consensus = info.filter((r) => r.min >= consensusMin).sort((a, b) => b.min - a.min || byMean(a, b));
  for (const r of consensus) {
    if (picked.length >= N) break;
    picked.push({ ...r, source: 'consensus', selectedFor: 'all' });
    taken.add(r.p);
  }
  const consensusCount = picked.length;

  // 2) round-robin by cumSat [Suggested]: cumSat[m] = sum of member m's scores over the places picked so far.
  // The member with the LOWEST cumSat picks next (tie -> earlier member) and takes the remaining place they like best.
  const cumSat = voters.map((_, v) => picked.reduce((a, r) => a + r.s[v], 0));
  const exhausted = new Set();
  while (picked.length < N && exhausted.size < voters.length) {
    let v = -1;
    voters.forEach((_, i) => {
      if (exhausted.has(i)) return;
      if (v === -1 || cumSat[i] < cumSat[v] - 1e-9) v = i;
    });
    const best = info
      .filter((r) => !taken.has(r.p) && r.s[v] > 0)
      .sort((a, b) => b.s[v] - a.s[v] || byMean(a, b))[0];
    if (!best) {
      exhausted.add(v);
      continue;
    }
    picked.push({ ...best, source: 'roundrobin', selectedFor: voters[v].id });
    taken.add(best.p);
    best.s.forEach((x, i) => { cumSat[i] += x; });
  }
  if (picked.length < N) warnings.push(`Sirf ${picked.length} jagah mili, zaroorat ${N} thi.`);

  const nameOf = (id) => (voters.find((m) => m.id === id) || {}).name || id;
  const places = picked.map((r) => ({
    poi: r.poi,
    score: r3(r.mean),
    minScore: r3(r.min),
    source: r.source,
    selectedFor: r.selectedFor,
    memberScores: Object.fromEntries(voters.map((m, i) => [m.id, r3(r.s[i])])),
    reason: r.source === 'consensus'
      ? `Sab ko pasand (sabse kam score ${r3(r.min)})`
      : `${nameOf(r.selectedFor)} ki baari (uski satisfaction sabse kam thi)`,
  }));
  const satisfaction = Object.fromEntries(voters.map((m, i) => [m.id, picked.length ? r3(mean(picked.map((r) => r.s[i]))) : 0]));
  return { places, poolSize: N, avgVisitUsed, pace, satisfaction, consensusCount, warnings };
}

module.exports = { PACES, CONSENSUS_MIN, MAX_GROUP_SIZE, slowestPace, memberScoreMatrix, selectGroupCandidates };