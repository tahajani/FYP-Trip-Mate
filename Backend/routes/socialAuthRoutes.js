const express = require('express');
const jwt = require('jsonwebtoken');
const { verifyGoogleIdToken, verifyFacebookToken, loginWithProvider } = require('../services/socialAuth');

const router = express.Router();

// authRoutes.js wale signToken ke bilkul same: payload { id }, JWT_SECRET, JWT_EXPIRES_IN
const signToken = (id) =>
  jwt.sign({ id }, process.env.JWT_SECRET, {
    expiresIn: process.env.JWT_EXPIRES_IN || '7d',
  });

// authRoutes.js wale publicUser ke same
const publicUser = (u) => ({
  id: u._id,
  name: u.name,
  email: u.email,
  interests: u.interests,
  pace: u.pace,
});

function handler(provider, verify, field) {
  return async (req, res) => {
    try {
      const token = req.body[field];
      if (!token) return res.status(400).json({ message: `${field} is required` });
      const profile = await verify(token);
      const user = await loginWithProvider(provider, profile);
      console.log(`${provider} login ok:`, user.email); // DEBUG, baad mein hata dena
      res.json({ token: signToken(user._id), user: publicUser(user) });
    } catch (err) {
      console.error(`${provider} login failed:`, err.message);
      res.status(err.status || 401).json({ message: err.status ? err.message : 'Social login failed' });
    }
  };
}

router.post('/google', handler('google', verifyGoogleIdToken, 'idToken'));
router.post('/facebook', handler('facebook', verifyFacebookToken, 'accessToken'));

module.exports = router;