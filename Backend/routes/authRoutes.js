const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const User = require('../models/User');
const auth = require('../middleware/auth');

const router = express.Router();

const signToken = (id) =>
  jwt.sign({ id }, process.env.JWT_SECRET, {
    expiresIn: process.env.JWT_EXPIRES_IN || '7d',
  });

// Password kabhi frontend ko wapas nahi jata
const publicUser = (u) => ({
  id: u._id,
  name: u.name,
  email: u.email,
  interests: u.interests,
  pace: u.pace,
});

router.post('/register', async (req, res) => {
  try {
    const { name, email, password } = req.body;
    if (!name || !email || !password) {
      return res.status(400).json({ message: 'Name, email aur password zaroori hain' });
    }
    if (password.length < 6) {
      return res.status(400).json({ message: 'Password kam az kam 6 characters ka ho' });
    }

    const normalizedEmail = email.trim().toLowerCase();
    const exists = await User.findOne({ email: normalizedEmail });
    if (exists) {
      return res.status(400).json({ message: 'Is email se account pehle se hai' });
    }

    const hashed = await bcrypt.hash(password, 10);
    const user = await User.create({
      name: name.trim(),
      email: normalizedEmail,
      password: hashed,
    });

    res.status(201).json({ token: signToken(user._id), user: publicUser(user) });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) {
      return res.status(400).json({ message: 'Email aur password zaroori hain' });
    }

    // Agar User model me password par select:false hai to .select('+password') zaroori hai
    const user = await User.findOne({ email: email.trim().toLowerCase() }).select('+password');
    const ok = user && (await bcrypt.compare(password, user.password));
    if (!ok) {
      // Jaan bujh kar same message: attacker ko pata na chale email sahi tha ya password
      return res.status(401).json({ message: 'Email ya password galat hai' });
    }

    res.json({ token: signToken(user._id), user: publicUser(user) });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// App dobara khulne par session restore ke liye
router.get('/me', auth, async (req, res) => {
  try {
    const user = await User.findById(req.userId);
    if (!user) return res.status(401).json({ message: 'User not found' });
    res.json({ user: publicUser(user) });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

module.exports = router;