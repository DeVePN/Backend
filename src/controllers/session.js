import { generateWireGuardKeypair } from '../services/keygen.js';
import { buildClientConfig, addPeerToNode, removePeerFromNode, getPeerStats, assignClientIP } from '../services/wg.js';
import { validateChannelForSession, deductFromChannel, calculateSessionCost } from '../services/payment.js';
import { getOrCreateUser, getNodeById, createSession, getSessionByToken, stopSession as dbStopSession, getUserSessions } from '../services/supabase.js';
import { getBestNode } from '../services/registry.js';
import { generateSessionToken } from '../utils/id.js';
import { asyncHandler } from '../middleware/errorHandler.js';

/**
 * POST /session/start
 * Start a new VPN session
 */
export const start = asyncHandler(async (req, res) => {
  const { telegram_id, node_id, ton_wallet_address } = req.body;

  // 1. Get or create user
  const user = await getOrCreateUser(telegram_id, {
    ton_wallet_address: ton_wallet_address || req.wallet?.address
  });

  // 2. Select node (use provided node_id or get best node)
  let node;
  if (node_id) {
    node = await getNodeById(node_id);
    if (!node || !node.is_active) {
      return res.status(404).json({
        error: 'Node not found or inactive'
      });
    }
  } else {
    node = await getBestNode({
      max_load: 80
    });
  }

  // 3. Check payment channel has sufficient balance
  const channelValidation = await validateChannelForSession(user.id, node.id);
  
  if (!channelValidation.canStart) {
    return res.status(402).json({
      error: 'Payment required',
      reason: channelValidation.reason,
      details: channelValidation.details
    });
  }

  // 4. Generate WireGuard keypair for client
  const { privateKey, publicKey } = generateWireGuardKeypair();

  // 5. Assign IP address for client
  const clientIP = assignClientIP('10.8.0', node.id);

  // 6. Add peer to node daemon
  try {
    await addPeerToNode({
      nodeEndpoint: node.endpoint,
      clientPublicKey: publicKey,
      clientIP: clientIP,
      allowedIPs: ['0.0.0.0/0', '::/0']
    });
  } catch (error) {
    return res.status(503).json({
      error: 'Failed to configure node',
      details: error.message
    });
  }

  // 7. Create session record
  const sessionToken = generateSessionToken();
  const session = await createSession({
    session_token: sessionToken,
    user_id: user.id,
    node_id: node.id,
    payment_channel_id: channelValidation.channel.id,
    wg_client_private_key: privateKey,
    wg_client_public_key: publicKey,
    wg_server_public_key: node.wg_public_key,
    client_ip: clientIP
  });

  // 8. Build WireGuard config for client
  const wgConfig = buildClientConfig({
    clientPrivateKey: privateKey,
    clientIP: clientIP,
    serverPublicKey: node.wg_public_key,
    serverEndpoint: node.endpoint,
    allowedIPs: ['0.0.0.0/0', '::/0'],
    dnsServers: ['1.1.1.1', '8.8.8.8']
  });

  // 9. Return session info and config
  res.status(201).json({
    success: true,
    message: 'Session started successfully',
    session: {
      session_token: sessionToken,
      node: {
        id: node.id,
        region: node.region,
        country: node.country,
        endpoint: node.endpoint
      },
      client_ip: clientIP,
      start_time: session.start_time,
      estimated_duration: channelValidation.estimatedSessionTime
    },
    wireguard_config: wgConfig
  });
});

/**
 * POST /session/stop
 * Stop an active VPN session
 */
export const stop = asyncHandler(async (req, res) => {
  const { session_token } = req.body;

  // 1. Get session from database
  const session = await getSessionByToken(session_token);

  if (!session) {
    return res.status(404).json({
      error: 'Session not found'
    });
  }

  if (session.status !== 'active') {
    return res.status(400).json({
      error: 'Session is not active',
      current_status: session.status
    });
  }

  const node = session.nodes;

  // 2. Get peer statistics from node daemon
  let stats = { rx_bytes: 0, tx_bytes: 0 };
  try {
    stats = await getPeerStats(node.endpoint, session.wg_client_public_key);
  } catch (error) {
    console.warn('Failed to get peer stats:', error.message);
  }

  // 3. Calculate session duration and cost
  const startTime = new Date(session.start_time).getTime();
  const endTime = Date.now();
  const durationSeconds = Math.floor((endTime - startTime) / 1000);
  const dataUsedBytes = (stats.rx_bytes || 0) + (stats.tx_bytes || 0);

  const cost = calculateSessionCost(
    { data_used_bytes: dataUsedBytes, duration_seconds: durationSeconds },
    node
  );

  // 4. Remove peer from node daemon
  try {
    await removePeerFromNode({
      nodeEndpoint: node.endpoint,
      clientPublicKey: session.wg_client_public_key
    });
  } catch (error) {
    console.warn('Failed to remove peer from node:', error.message);
  }

  // 5. Deduct cost from payment channel
  try {
    await deductFromChannel(session.payment_channel_id, cost);
  } catch (error) {
    console.error('Failed to deduct from channel:', error.message);
  }

  // 6. Update session record
  const stoppedSession = await dbStopSession(session.id, {
    data_used_bytes: dataUsedBytes,
    duration_seconds: durationSeconds,
    cost_nanoton: cost.toString()
  });

  // 7. Return session summary
  res.json({
    success: true,
    message: 'Session stopped successfully',
    session: {
      session_token: session_token,
      duration_seconds: durationSeconds,
      data_used_bytes: dataUsedBytes,
      data_used_mb: (dataUsedBytes / (1024 * 1024)).toFixed(2),
      cost_nanoton: cost.toString(),
      cost_ton: (Number(cost) / 1e9).toFixed(6),
      start_time: session.start_time,
      end_time: stoppedSession.end_time
    }
  });
});

/**
 * GET /sessions/user/:wallet
 * Get all sessions for a wallet address
 */
export const getUserSessionsByWallet = asyncHandler(async (req, res) => {
  const { wallet } = req.params;

  if (!wallet) {
    return res.status(400).json({
      error: 'Wallet address is required'
    });
  }

  // Get sessions for this wallet
  const sessions = await getUserSessions(wallet);

  res.json({
    success: true,
    count: sessions.length,
    sessions: sessions.map(session => ({
      id: session.id,
      session_token: session.session_token,
      user_wallet: wallet,
      node_id: session.node_id,
      node: session.nodes ? {
        id: session.nodes.id,
        country: session.nodes.country,
        region: session.nodes.region,
        city: session.nodes.city,
        endpoint: session.nodes.endpoint,
        price_per_minute: session.nodes.price_per_minute
      } : null,
      status: session.status,
      start_time: session.start_time,
      end_time: session.end_time,
      client_ip: session.client_ip,
      bytes_used: session.bytes_used,
      duration_seconds: session.duration_seconds,
      cost_nanoton: session.cost_nanoton,
      created_at: session.created_at,
      updated_at: session.updated_at
    }))
  });
});

export default {
  start,
  stop,
  getUserSessionsByWallet
};
