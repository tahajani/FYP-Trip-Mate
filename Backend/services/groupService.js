// Pure rules on a Group document (ownerId, members[{userId,status,invitedBy,joinedAt}], maxMembers).
// Routes only load/save. status: 'pending' | 'accepted' | 'declined'.
class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

const same = (a, b) => String(a) === String(b);
const find = (g, uid) => g.members.find((m) => same(m.userId, uid));
// pending invites hold a seat too, so a person who accepts can never find the group full; declined ones do not
const seats = (g, exceptId) =>
  g.members.filter((m) => m.status !== 'declined' && !(exceptId && same(m.userId, exceptId))).length;
const joinedTime = (m) => (m.joinedAt ? new Date(m.joinedAt).getTime() : Number.MAX_SAFE_INTEGER);

// owner only. A person who declined earlier can be invited again.
function invite(g, actorId, targetId) {
  if (!same(g.ownerId, actorId)) throw new HttpError(403, 'Only group owner can invite!');
  const existing = find(g, targetId);
  if (existing && existing.status !== 'declined') throw new HttpError(409, 'This user is already in this group or invited.');
  if (seats(g) >= g.maxMembers) throw new HttpError(409, `Group is full (${g.maxMembers} log)`);
  if (existing) {
    existing.status = 'pending';
    existing.invitedBy = actorId;
  } else {
    g.members.push({ userId: targetId, status: 'pending', invitedBy: actorId });
  }
}

function accept(g, uid) {
  const m = find(g, uid);
  if (!m || m.status === 'declined') throw new HttpError(404, 'You are not invited by this group.');
  if (m.status === 'accepted') throw new HttpError(409, 'You are already in this group.');
  if (g.members.filter((x) => x.status === 'accepted').length >= g.maxMembers) throw new HttpError(409, 'Group is full.');
  m.status = 'accepted';
  m.joinedAt = new Date();
}

function decline(g, uid) {
  const m = find(g, uid);
  if (!m || m.status === 'declined') throw new HttpError(404, 'You are not invited in this group.');
  if (m.status === 'accepted') throw new HttpError(409, 'You are a group member, for leaving group press leave.');
  m.status = 'declined';
}

// Accepted member leaves. If the owner leaves, the accepted member who joined first becomes owner.
// Returns { deleted: true } when nobody accepted is left (the route then deletes the group).
function leave(g, uid) {
  const i = g.members.findIndex((m) => same(m.userId, uid));
  const me = i < 0 ? null : g.members[i];
  if (!me || me.status === 'declined') throw new HttpError(404, 'You are not a member in this group.');
  if (me.status === 'pending') throw new HttpError(409, 'He is invited, decline him.');
  g.members.splice(i, 1);
  const accepted = g.members.filter((m) => m.status === 'accepted');
  if (accepted.length === 0) return { deleted: true };
  if (same(g.ownerId, uid)) {
    g.ownerId = accepted.slice().sort((a, b) => joinedTime(a) - joinedTime(b))[0].userId;
  }
  return { deleted: false };
}

// Anyone who has the group's inviteCode joins directly (no invite needed).
function joinByCode(g, uid) {
  const m = find(g, uid);
  if (m && m.status === 'accepted') throw new HttpError(409, 'You are already in this group.');
  if (seats(g, uid) >= g.maxMembers) throw new HttpError(409, `Group is full. (${g.maxMembers} log)`);
  if (m) {
    m.status = 'accepted';
    m.joinedAt = new Date();
  } else {
    g.members.push({ userId: uid, status: 'accepted', joinedAt: new Date() });
  }
}

module.exports = { HttpError, invite, accept, decline, leave, joinByCode };