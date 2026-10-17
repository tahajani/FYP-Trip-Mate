const express = require('express');
const mongoose = require('mongoose');
const dotenv = require('dotenv');
const userRoutes = require('./routes/userRoutes');
const authRoutes = require('./routes/authRoutes');
const cors = require('cors');
dotenv.config();

const app = express();

// Middleware
app.use(express.json());
app.use(cors());

app.use('/api/users', userRoutes);
app.use('/api/auth',authRoutes)


const PORT = process.env.PORT 
mongoose.connect(process.env.MONGO_URI)
  .then(() => {
    console.log('MongoDB Connected successfully');
    app.listen(PORT, () => console.log(`Server running on port http://LOCALHOST:${PORT}`));
  })
  .catch((err) => {
    console.log('Database connection error:', err);
  });
