// services/fairness.js  backend rule (NOT the LLM) that decides when a group should vote. Thresholds are an OPEN decision.
const LOW_AVG = 0.4;   // a member whose average score is below this is unhappy
const MAX_GAP = 0.25;  // best member avg minus worst member avg

// satisfaction: [{ userId, avgScore }]  ->  { suggestPoll, reasons, worst, best, gap }
function fairnessCheck(satisfaction = []) {
  const rows = satisfaction.filter((s) => typeof s.avgScore === 'number');
  if (rows.length < 2) return { suggestPoll: false, reasons: [], worst: null, best: null, gap: 0 };
  const worst = rows.reduce((a, b) => (b.avgScore < a.avgScore ? b : a));
  const best = rows.reduce((a, b) => (b.avgScore > a.avgScore ? b : a));
  const gap = best.avgScore - worst.avgScore;
  const reasons = [];
  if (worst.avgScore < LOW_AVG) reasons.push(`lowest member average ${worst.avgScore.toFixed(2)} is below ${LOW_AVG}`);
  if (gap > MAX_GAP) reasons.push(`gap between happiest and least happy member is ${gap.toFixed(2)} (limit ${MAX_GAP})`);
  return { suggestPoll: reasons.length > 0, reasons, worst, best, gap };
}

module.exports = { fairnessCheck, LOW_AVG, MAX_GAP };