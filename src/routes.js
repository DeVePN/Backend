import express from 'express';
import { getNodes, getNodeById, register, heartbeat } from './controllers/nodes.js';
import { start, stop, getUserSessionsByWallet } from './controllers/session.js';
import {
  prepareSessionStart,
  prepareSessionEnd,
  signUsage,
  getSessionFromChain,
  getNodeFromChain,
  getContractStatus
} from './controllers/contract.js';
import { validateQuery, validateNodeRegistration, validateSessionStart, validateSessionStop } from './middleware/validateRequest.js';
import { verifyWalletAuth, optionalWalletAuth } from './middleware/verifyWalletAuth.js';

const router = express.Router();

// Health check endpoint
router.get('/health', (req, res) => {
  res.json({
    status: 'healthy',
    timestamp: new Date().toISOString(),
    environment: process.env.NODE_ENV || 'development'
  });
});

// Node endpoints
router.get(
  '/nodes',
  validateQuery(['region', 'country', 'city', 'min_price', 'max_price', 'max_load', 'version', 'limit']),
  getNodes
);

router.get(
  '/nodes/:id',
  getNodeById
);

router.post(
  '/node/register',
  optionalWalletAuth,
  validateNodeRegistration,
  register
);

router.post(
  '/node/heartbeat',
  heartbeat
);

// Session endpoints (off-chain tracking)
router.post(
  '/session/start',
  optionalWalletAuth,
  validateSessionStart,
  start
);

router.post(
  '/session/stop',
  validateSessionStop,
  stop
);

router.get(
  '/sessions/user/:wallet',
  getUserSessionsByWallet
);

// Smart Contract endpoints
router.get('/contract/status', getContractStatus);

router.post('/contract/session/start', prepareSessionStart);

router.post('/contract/session/end', prepareSessionEnd);

router.post('/contract/sign-usage', signUsage);

router.get('/contract/session/:sessionId', getSessionFromChain);

router.get('/contract/node/:nodeId', getNodeFromChain);

export default router;
