// services/poll.js  pure poll rules (no database), so they can be tested without MongoDB.
const { fairnessCheck } = require('./fairness');

const FAIRNESS_OPTIONS = [
  { id: 'keep', label: 'Keep this plan' },
  { id: 'regenerate', label: 'Ask the owner to generate a new plan' },
];

// Backend rule (NOT the LLM): after a group itinerary is generated, returns the poll to open,
// or null when the plan is fair enough. The question never names a member.
function fairnessPollFor(satisfaction) {
  const r = fairnessCheck(satisfaction);
  if (!r.suggestPoll) return null;
  return {
    type: 'fairness',
    question: 'This plan does not fit every member equally well. What should the group do?',
    note: r.reasons.join('; '),
    options: FAIRNESS_OPTIONS.map((o) => ({ ...o })),
  };
}

// Custom poll made by the owner: 2 to 4 options, each 1 to 60 characters. Throws an Error with a clear message.
function buildCustomPoll(question, labels) {
  const q = String(question || '').trim();
  if (q.length < 3 || q.length > 200) throw new Error('question must be 3 to 200 characters');
  if (!Array.isArray(labels) || labels.length < 2 || labels.length > 4) throw new Error('give 2 to 4 options');
  const clean = labels.map((l) => String(l || '').trim());
  if (clean.some((l) => l.length < 1 || l.length > 60)) throw new Error('each option must be 1 to 60 characters');
  if (new Set(clean.map((l) => l.toLowerCase())).size !== clean.length) throw new Error('options must be different');
  return { type: 'custom', question: q, note: '', options: clean.map((label, i) => ({ id: `o${i + 1}`, label })) };
}

// poll: { status, options:[{id}], votes:[{userId, optionId}] }   acceptedIds: array of user id strings
// Returns the new { votes, status }. A member may change their vote while the poll is open.
function castVote(poll, userId, optionId, acceptedIds) {
  if (poll.status !== 'open') throw new Error('This poll is closed');
  const me = String(userId);
  if (!acceptedIds.map(String).includes(me)) throw new Error('Only accepted members can vote');
  if (!poll.options.some((o) => o.id === optionId)) throw new Error('Unknown option');
  const votes = (poll.votes || []).filter((v) => String(v.userId) !== me).map((v) => ({ userId: String(v.userId), optionId: v.optionId }));
  votes.push({ userId: me, optionId });
  const everyone = acceptedIds.map(String).every((id) => votes.some((v) => v.userId === id));
  return { votes, status: everyone ? 'closed' : 'open' }; // closes by itself when every accepted member has voted
}

// What the app shows: counts per option, my own vote, and the winner of a closed poll (null on a tie or no votes).
function viewOf(poll, myId) {
  const votes = poll.votes || [];
  const options = poll.options.map((o) => ({ id: o.id, label: o.label, votes: votes.filter((v) => v.optionId === o.id).length }));
  const top = Math.max(0, ...options.map((o) => o.votes));
  const leaders = options.filter((o) => o.votes === top && top > 0);
  const mineVote = votes.find((v) => String(v.userId) === String(myId));
  return {
    id: String(poll._id || poll.id),
    type: poll.type,
    question: poll.question,
    note: poll.note || '',
    status: poll.status,
    options,
    totalVotes: votes.length,
    myVote: mineVote ? mineVote.optionId : null,
    winner: poll.status === 'closed' && leaders.length === 1 ? leaders[0].id : null,
    createdAt: poll.createdAt,
  };
}

module.exports = { fairnessPollFor, buildCustomPoll, castVote, viewOf, FAIRNESS_OPTIONS };