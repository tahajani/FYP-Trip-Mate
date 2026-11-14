const express = require('express');
const mongoose = require('mongoose');
const dotenv = require('dotenv');
const userRoutes = require('./routes/userRoutes');
const socialAuthRoutes = require('./routes/socialAuthRoutes');
const authRoutes = require('./routes/authRoutes');
const itineraryRoutes = require('./routes/ItineraryRoutes')
const http = require('http');
const { Server } = require('socket.io');
const jwt = require('jsonwebtoken');
const Group = require('./models/Group');
const GroupMessage = require('./models/GroupMessage');
const { attachGroupChat } = require('./socket/groupChat');
const cors = require('cors');
dotenv.config();

const app = express();

// Middleware
app.use(express.json());
app.use(cors());

app.use('/api/users', userRoutes);
app.use('/api/auth/social', socialAuthRoutes);
app.use('/api/auth',authRoutes)
app.use('/api/groups', require('./routes/groupRoutes'));
app.use('/api/places', require('./routes/placeRoutes'));
app.use('/api/routes', require('./routes/routeRoutes'));
app.use('/api/itineraries', itineraryRoutes)

const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: process.env.CLIENT_ORIGIN ? process.env.CLIENT_ORIGIN.split(',') : true }, // restrict in production
});

attachGroupChat(io, {
  // NOT VERIFIED: copy exactly what your middleware/auth.js does (secret name and the id field in the token)
  verifyToken: (token) => {
    const p = jwt.verify(token, process.env.JWT_SECRET);
    return p.id || p.userId || p._id;
  },
  isAcceptedMember: async (groupId, userId) => {
    try {
      return !!(await Group.exists({ _id: groupId, members: { $elemMatch: { userId, status: 'accepted' } } }));
    } catch {
      return false; // invalid ObjectId etc.
    }
  },
  saveMessage: (d) => GroupMessage.create(d),
});

app.get('/api/health', (req, res) => {
  res.json({
    status: 'ok',
    db: mongoose.connection.readyState === 1 ? 'connected' : 'disconnected',
    uptime: Math.round(process.uptime()),
  });
});

const PORT = process.env.PORT 
mongoose.connect(process.env.MONGO_URI)
  .then(() => {
    console.log('MongoDB Connected successfully');
    // app.listen(PORT, () => console.log(`Server running on port http://LOCALHOST:${PORT}`));
  })
  .catch((err) => {
    console.log('Database connection error:', err);
  });

server.listen(PORT, () => console.log(`Server on http://LOCALHOST:${PORT}`))