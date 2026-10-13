// routes/userRoutes.js
const express = require('express');
const router = express.Router();
const User = require('../models/User');

router.post('/register', async (req, res) => {
  try {
    const { name, email, password, interests, pace } = req.body;
    
    // Check if user already exists
    const existingUser = await User.findOne({ email });
    if (existingUser) {
      return res.status(400).json({ error: 'User already exists with this email' });
    }

    const newUser = new User({
      name,
      email,
      password, // Note: Production mein password hash (bcrypt) karna zaroori hai
      interests: interests || [],
      pace: pace || 'moderate'
    });

    await newUser.save();
    res.status(201).json({ 
      message: 'User registered successfully!', 
      user: newUser 
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// 2. GET: Get user profile by ID (Testing GET route)
router.get('/profile/:id', async (req, res) => {
  try {
    const user = await User.findById(req.params.id).select('-password');
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }
    res.status(200).json(user);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Update user interests and pace (Called from React Native app)
router.put('/profile/:id', async (req, res) => {
  try {
    const { interests, pace } = req.body;
    const updatedUser = await User.findByIdAndUpdate(
      req.params.id,
      { interests, pace },
      { new: true }
    );
    if (!updatedUser) {
      return res.status(404).json({ error: 'User not found' });
    }
    res.status(200).json({ message: 'Profile updated successfully', user: updatedUser });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Get user profile data
router.get('/profile/:id', async (req, res) => {
  try {
    const user = await User.findById(req.params.id).select('-password');
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }
    res.status(200).json(user);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;