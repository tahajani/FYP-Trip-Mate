// Pure rules on a group document; routes only load/save.
const { MAX_GROUP_SIZE } = require('./groupScoring');

class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

const same = (a, b) => String(a) === String(b);
const find = (g, uid) => g.members.find((m) => same(m.userId, uid));

// accepted AND invited members both hold a seat, so invites cannot overfill the group
function invite(g, actorId, targetId) {
  const me = find(g, actorId);
  if (!me || me.status !== 'accepted' || me.role !== 'owner') throw new HttpError(403, 'Sirf group owner invite kar sakta hai');
  if (find(g, targetId)) throw new HttpError(409, 'Ye user pehle se group me hai ya invited hai');
  if (g.members.length >= MAX_GROUP_SIZE) throw new HttpError(409, `Group me zyada se zyada ${MAX_GROUP_SIZE} log ho sakte hain`);
  g.members.push({ userId: targetId, status: 'invited', role: 'member' });
}

function accept(g, uid) {
  const m = find(g, uid);
  if (!m) throw new HttpError(404, 'Tumhe is group ka invite nahi mila');
  if (m.status === 'accepted') throw new HttpError(409, 'Tum pehle se group me ho');
  m.status = 'accepted';
  m.joinedAt = new Date();
}

// Works for accepted members and for declining an invite. If the owner leaves, the longest-standing accepted
// member becomes owner. If nobody accepted is left, the group should be deleted.
function leave(g, uid) {
  const i = g.members.findIndex((m) => same(m.userId, uid));
  if (i < 0) throw new HttpError(404, 'Tum is group ke member nahi ho');
  const [gone] = g.members.splice(i, 1);
  const accepted = g.members.filter((m) => m.status === 'accepted');
  if (accepted.length === 0) return { deleted: true };
  if (gone.role === 'owner') accepted[0].role = 'owner';
  return { deleted: false };
}

module.exports = { HttpError, invite, accept, leave };