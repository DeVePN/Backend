// Load environment variables FIRST
import dotenv from 'dotenv';
dotenv.config();

// Custom BigInt serialization for JSON responses
// This allows BigInt values from PostgreSQL to be serialized to JSON
BigInt.prototype.toJSON = function() {
  return this.toString();
};

import express from 'express';
import cors from 'cors';
import bodyParser from 'body-parser';
import { validateEnv } from './utils/env.js';
import routes from './routes.js';
import { errorHandler, notFoundHandler } from './middleware/errorHandler.js';
import { initTonClient } from './services/tonContract.js';

// Validate required environment variables
try {
  validateEnv();
} catch (error) {
  console.error('Environment validation failed:', error.message);
  const nodeEnv = process.env.NODE_ENV;
  if (nodeEnv === 'production') {
    process.exit(1);
  }
}

// Initialize TON client
console.log('\n🔗 Initializing TON blockchain connection...');
initTonClient();

const app = express();
const PORT = process.env.PORT || 3000;

// CORS configuration
const corsOrigin = process.env.CORS_ORIGIN || '*';
const corsOptions = {
  origin: corsOrigin,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'x-wallet-address', 'x-wallet-signature', 'x-wallet-message'],
  credentials: true
};

// Middleware
app.use(cors(corsOptions));
app.use(bodyParser.json({ limit: '10mb' }));
app.use(bodyParser.urlencoded({ extended: true, limit: '10mb' }));

// Request logging middleware
app.use((req, res, next) => {
  const timestamp = new Date().toISOString();
  const logMsg = '[' + timestamp + '] ' + req.method + ' ' + req.path;
  console.log(logMsg);
  next();
});

// Mount routes
app.use('/api', routes);

// Root endpoint
app.get('/', (req, res) => {
  res.json({
    name: 'DeVPN Backend API',
    version: '1.0.0',
    description: 'Decentralized P2P VPN Network powered by TON blockchain',
    endpoints: {
      health: 'GET /api/health',
      nodes: 'GET /api/nodes',
      register_node: 'POST /api/node/register',
      start_session: 'POST /api/session/start',
      stop_session: 'POST /api/session/stop'
    },
    documentation: 'https://github.com/your-repo/DeVPN'
  });
});

// 404 handler
app.use(notFoundHandler);

// Global error handler (must be last)
app.use(errorHandler);

// Start server
app.listen(PORT, '0.0.0.0', () => {
  const nodeEnv = process.env.NODE_ENV || 'development';
  console.log('='.repeat(50));
  console.log('DeVPN Backend API');
  console.log('='.repeat(50));
  console.log('Environment: ' + nodeEnv);
  console.log('Server listening on port ' + PORT);
  console.log('API available at: http://localhost:' + PORT + '/api');
  console.log('='.repeat(50));
});

// Graceful shutdown
process.on('SIGTERM', () => {
  console.log('SIGTERM signal received: closing HTTP server');
  process.exit(0);
});

process.on('SIGINT', () => {
  console.log('SIGINT signal received: closing HTTP server');
  process.exit(0);
});

export default app;
