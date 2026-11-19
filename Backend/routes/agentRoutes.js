// mount in server.js: app.use('/api/agent', require('./routes/agentRoutes'));
const express = require('express');
const auth = require('../middleware/auth');
const User = require('../models/User');
const { buildTools, runAgent, systemPrompt } = require('../services/agent');

const router = express.Router();
router.use(auth);

// simple limiter: 10 messages per minute per user (the Groq free tier has its own limits)
const hits = new Map();
function limited(id) {
  const now = Date.now();
  const recent = (hits.get(id) || []).filter((t) => now - t < 60000);
  if (recent.length >= 10) { hits.set(id, recent); return true; }
  recent.push(now);
  hits.set(id, recent);
  return false;
}

// POST /api/agent/chat  { messages: [{ role: 'user'|'assistant', content }], groupId? }   -> { reply }
router.post('/chat', async (req, res) => {
  try {
    if (!process.env.GROQ_API_KEY || !process.env.GROQ_MODEL) {
      return res.status(503).json({ message: 'Assistant is not configured (set GROQ_API_KEY and GROQ_MODEL in .env)' });
    }
    const { messages, groupId } = req.body || {};
    if (!Array.isArray(messages) || messages.length === 0 || messages.length > 20) {
      return res.status(400).json({ message: 'messages must be an array of 1 to 20 items' });
    }
    const clean = [];
    for (const m of messages) {
      const text = typeof (m && m.content) === 'string' ? m.content.trim() : '';
      if (!m || !['user', 'assistant'].includes(m.role) || !text || text.length > 1000) {
        return res.status(400).json({ message: 'each message needs role user/assistant and 1 to 1000 characters of text' });
      }
      clean.push({ role: m.role, content: text });
    }
    if (clean[clean.length - 1].role !== 'user') return res.status(400).json({ message: 'the last message must be from the user' });
    if (limited(String(req.userId))) return res.status(429).json({ message: 'Too many messages, wait a minute' });

    const u = await User.findById(req.userId).select('name interests pace').lean(); // field names verified by the matching routes
    if (!u) return res.status(404).json({ message: 'User nahi mila' });
    const user = { id: String(u._id), name: u.name, interests: u.interests || [], pace: u.pace };
    const impl = buildTools({ user, ctx: { groupId: groupId ? String(groupId) : null } });
    const out = await runAgent({ messages: clean, impl, system: systemPrompt(user) });
    res.json({ reply: out.reply });
  } catch (err) {
    console.error('agent:', err.message);
    res.status(502).json({ message: 'The assistant is unavailable right now' });
  }
});

module.exports = router;