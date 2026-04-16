const jwt = require('jsonwebtoken');

function setupSocket(io) {
  io.use((socket, next) => {
    const token = socket.handshake.auth?.token;
    if (!token) return next(new Error('Authentication required'));
    try {
      const decoded = jwt.verify(token, process.env.JWT_SECRET);
      socket.user = decoded;
      next();
    } catch {
      next(new Error('Invalid token'));
    }
  });

  io.on('connection', (socket) => {
    console.log(`Socket connected: ${socket.user.fullName}`);

    socket.on('join:room', (roomId) => {
      socket.join(`room:${roomId}`);
    });

    socket.on('leave:room', (roomId) => {
      socket.leave(`room:${roomId}`);
    });

    socket.on('disconnect', () => {
      console.log(`Socket disconnected: ${socket.user.fullName}`);
    });
  });
}

module.exports = { setupSocket };
