const jwt = require('jsonwebtoken');

module.exports = (req, res, next) => {
  const header = req.headers.authorization;
  if (!header || !header.startsWith('Bearer ')) {
    return res.status(401).json({ message: 'Token missing' });
  }
  try {
    const decoded = jwt.verify(header.split(' ')[1], process.env.JWT_SECRET);
    req.userId = decoded.id; // aage routes me yahi use hoga
    next();
  } catch {
    return res.status(401).json({ message: 'Invalid or expired token' });
  }
};