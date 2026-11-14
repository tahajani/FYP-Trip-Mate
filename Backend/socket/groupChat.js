// Realtime group chat. Everything that touches the database or JWT is passed in (see server.js), so it is easy to test.
//   client -> server: 'group:join' {groupId}, 'group:leave' {groupId}, 'group:message' {groupId, text}   (all with an ack callback)
//   server -> client: 'group:message' {id, groupId, senderId, text, createdAt}
const MAX_TEXT = 1000;
const RATE = { windowMs: 10000, max: 10 }; // at most 10 messages per 10 seconds per connection

function attachGroupChat(io, { verifyToken, isAcceptedMember, saveMessage, moderate = null, rate = RATE }) {
  const room = (groupId) => `group:${groupId}`;

  // the client connects with io(url, { auth: { token } })
  io.use(async (socket, next) => {
    try {
      const token = socket.handshake.auth && socket.handshake.auth.token;
      if (!token) throw new Error('no token');
      socket.data.userId = String(await verifyToken(token));
      next();
    } catch {
      next(new Error('unauthorized'));
    }
  });

  io.on('connection', (socket) => {
    const userId = socket.data.userId;
    const sentAt = [];
    const reply = (ack, body) => typeof ack === 'function' && ack(body);
    const no = (ack, error) => reply(ack, { ok: false, error });

    socket.on('group:join', async (payload, ack) => {
      try {
        const groupId = payload && payload.groupId;
        if (!groupId || !(await isAcceptedMember(groupId, userId))) return no(ack, 'You are not a member in this group.');
        await socket.join(room(groupId));
        reply(ack, { ok: true });
      } catch {
        no(ack, 'Server error');
      }
    });

    socket.on('group:leave', async (payload, ack) => {
      const groupId = payload && payload.groupId;
      if (groupId) await socket.leave(room(groupId));
      reply(ack, { ok: true });
    });

    socket.on('group:message', async (payload, ack) => {
      try {
        const { groupId, text } = payload || {};
        const clean = String(text ?? '').trim();
        if (!clean) return no(ack, 'Khali message');
        if (clean.length > MAX_TEXT) return no(ack, `Keep Message's characters less than ${MAX_TEXT}`);
        if (!groupId || !socket.rooms.has(room(groupId))) return no(ack, 'First join a group.');

        const now = Date.now();
        while (sentAt.length && now - sentAt[0] > rate.windowMs) sentAt.shift();
        if (sentAt.length >= rate.max) return no(ack, 'Very fast messages, please wait.');
        sentAt.push(now);

        // a member may have left the group after joining the room
        if (!(await isAcceptedMember(groupId, userId))) {
          await socket.leave(room(groupId));
          return no(ack, 'You are not a member in this group.');
        }
        if (moderate) {
          const verdict = await moderate(clean);
          if (verdict && verdict.allowed === false) return no(ack, verdict.reason || 'This message is not allowed.');
        }

        const msg = await saveMessage({ groupId, senderId: userId, text: clean });
        const out = { id: String(msg._id ?? msg.id), groupId: String(groupId), senderId: userId, text: msg.text ?? clean, createdAt: msg.createdAt };
        io.to(room(groupId)).emit('group:message', out);
        reply(ack, { ok: true, id: out.id });
      } catch {
        no(ack, 'Server error');
      }
    });
  });
}

module.exports = { attachGroupChat, MAX_TEXT };