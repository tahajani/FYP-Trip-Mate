const express = require('express');
const jwt = require('jsonwebtoken');
const { verifyGoogleIdToken, verifyFacebookToken, loginWithProvider } = require('../services/socialAuth');

const router = express.Router();

// IMPORTANT: I have not seen authRoutes.js. Copy the payload, secret name and expiry
// from the jwt.sign(...) line in YOUR login route. { id } and JWT_SECRET are assumptions.
function signToken(user) {
  return jwt.sign({ id: user._id }, process.env.JWT_SECRET, { expiresIn: '7d' });
}

// IMPORTANT: make this match the user object your /login returns.
function publicUser(u) {
  return { id: u._id, name: u.name, email: u.email, interests: u.interests, pace: u.pace };
}

function handler(provider, verify, field) {
  return async (req, res) => {
    try {
      const token = req.body[field];
      if (!token) return res.status(400).json({ message: `${field} is required` });
      const profile = await verify(token);
      const user = await loginWithProvider(provider, profile);
      res.json({ token: signToken(user), user: publicUser(user) });
    } catch (err) {
      console.error(`${provider} login failed:`, err.message);
      res.status(err.status || 401).json({ message: err.status ? err.message : 'Social login failed' });
    }
  };
}

router.post('/google', handler('google', verifyGoogleIdToken, 'idToken'));
router.post('/facebook', handler('facebook', verifyFacebookToken, 'accessToken'));

module.exports = router;