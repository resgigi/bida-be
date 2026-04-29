require('dotenv').config();
const express = require('express');
const cors = require('cors');
const http = require('http');
const path = require('path');
const { Server } = require('socket.io');
const errorHandler = require('./middleware/errorHandler');
const { setupSocket } = require('./socket');

const app = express();
const server = http.createServer(app);
const isDesktop = process.env.DESKTOP_MODE === 'true';
const defaultAllowedOrigins = [
  'http://localhost:5173',
  'http://localhost',
  'https://localhost',
  'capacitor://localhost',
  'ionic://localhost',
  // Mobile app schemes
  'bida-mobile://',
  'app.openbida://',
];
// For production mobile apps, allow requests without strict origin check
const isProduction = process.env.NODE_ENV === 'production' ||
                     process.env.RENDER === 'true' ||
                     process.env.RAILWAY_ENVIRONMENT;
const allowedOrigins = (process.env.FRONTEND_URL || '')
  .split(',')
  .map((origin) => origin.trim())
  .filter(Boolean);
const corsOrigins = [...new Set([...defaultAllowedOrigins, ...allowedOrigins])];
const corsOriginChecker = (origin, callback) => {
  // Allow non-browser requests (curl/postman) and same-origin server calls.
  if (!origin) return callback(null, true);
  // In production, allow requests from mobile apps (no specific origin)
  if (isProduction && !origin.startsWith('http')) return callback(null, true);
  if (corsOrigins.includes(origin)) return callback(null, true);
  // Allow same-origin requests for desktop app
  if (isDesktop && origin === 'app://') return callback(null, true);
  return callback(new Error(`Not allowed by CORS: ${origin}`));
};

const io = new Server(server, {
  cors: {
    origin: corsOriginChecker,
    methods: ['GET', 'POST', 'PUT', 'DELETE'],
  },
});

app.set('io', io);

app.use(cors({ origin: corsOriginChecker, credentials: true }));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.use('/api/auth', require('./modules/auth/auth.routes'));
app.use('/api/rooms', require('./modules/rooms/rooms.routes'));
app.use('/api/sessions', require('./modules/sessions/sessions.routes'));
app.use('/api/orders', require('./modules/orders/orders.routes'));
app.use('/api/products', require('./modules/products/products.routes'));
app.use('/api/users', require('./modules/users/users.routes'));
app.use('/api/dashboard', require('./modules/dashboard/dashboard.routes'));
app.use('/api/reports', require('./modules/reports/reports.routes'));
app.use('/api/admin', require('./modules/admin/admin.routes'));

app.get('/api/health', (_req, res) => res.json({ status: 'ok', time: new Date().toISOString() }));

// Serve static frontend files in desktop mode
if (isDesktop) {
  const frontendPath = process.env.FRONTEND_PATH || path.join(__dirname, '..', 'frontend');
  app.use(express.static(frontendPath));
  // Handle SPA routing - serve index.html for non-API routes
  app.get('*', (req, res) => {
    if (!req.path.startsWith('/api')) {
      res.sendFile(path.join(frontendPath, 'index.html'));
    }
  });
}

app.use(errorHandler);

setupSocket(io);

const PORT = process.env.PORT || 4000;
server.listen(PORT, () => {
  console.log(`OpenBida API running on port ${PORT}`);
});
