const { CATEGORIES } = require('../config/categories');
const { PACE_VALUE, DAY_CAPACITY, ROUGH_AVG_TRAVEL_MINUTES } = require('../config/pace');

// Formula 1: cosine similarity. Returns 0 for null or zero vectors (no NaN).
function cosine(a, b) {
  if (!a || !b || a.length !== b.length) return 0;
  let dot = 0, normA = 0, normB = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }
  if (normA === 0 || normB === 0) return 0;
  return dot / (Math.sqrt(normA) * Math.sqrt(normB));
}

// User vector: 1 for each selected category, else 0 ([Decided])
function userVectorFromInterests(interests = []) {
  return CATEGORIES.map((c) => (interests.includes(c) ? 1 : 0));
}

// Formula 2
function paceCompat(userPaceValue, poiIntensity) {
  return 1 - Math.abs(userPaceValue - poiIntensity);
}

// Formula 3: SoloPOIScore = 0.75 * Interest + 0.25 * PaceCompat
function soloScore(user, poi) {
  const interest = cosine(userVectorFromInterests(user.interests), poi.interestVector);
  const pace = paceCompat(PACE_VALUE[user.pace], poi.intensity);
  return 0.75 * interest + 0.25 * pace;
}

// Formula 4: N = days * k, k = floor(dayCapacity / (avgVisitDuration + roughAvgTravel))
function poolSize(days, pace, avgVisitDuration) {
  const k = Math.floor(
    DAY_CAPACITY[pace] / (avgVisitDuration + ROUGH_AVG_TRAVEL_MINUTES)
  );
  return days * k;
}

module.exports = { cosine, userVectorFromInterests, paceCompat, soloScore, poolSize };