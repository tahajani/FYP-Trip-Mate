const express = require('express');
const router = express.Router();
const User = require('../models/User');
const auth = require('../middleware/auth');

// Interests aur pace save/update (onboarding screen yahi call karegi)
router.put('/profile', auth, async (req, res) => {
  try {
    const { interests, pace } = req.body;
    const user = await User.findByIdAndUpdate(
      req.userId,
      { interests, pace },
      { new: true, runValidators: true }
    );
    if (!user) return res.status(404).json({ message: 'User not found' });
    res.json({
      user: { id: user._id, name: user.name, email: user.email,
              interests: user.interests, pace: user.pace },
    });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

module.exports = router;