const express = require('express');
const mongoose = require('mongoose');
const dotenv = require('dotenv');
const userRoutes = require('./routes/userRoutes');
const cors = require('cors');
dotenv.config();

const app = express();

// Middleware
app.use(express.json());
app.use(cors());

app.use('/api/users', userRoutes);


const PORT = process.env.PORT 
mongoose.connect(process.env.MONGO_URI)
  .then(() => {
    console.log('MongoDB Connected successfully');
    app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
  })
  .catch((err) => {
    console.log('Database connection error:', err);
  });
