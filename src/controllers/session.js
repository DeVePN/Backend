import crypto from 'crypto';
import { generateWireGuardKeypair } from '../services/keygen.js';
import { buildClientConfig, addPeerToNode, removePeerFromNode, getPeerStats, assignClientIP } from '../services/wg.js';
import { validateChannelForSession, deductFromChannel, calculateSessionCost } from '../services/payment.js';
import { getOrCreateUser, getNodeById, createSession, getSessionByToken, getSessionById, stopSession as dbStopSession, getUserSessions, createPaymentChannel, getOrCreatePaymentChannel } from '../services/supabase.js';
import { getBestNode } from '../services/registry.js';
import { generateSessionToken } from '../utils/id.js';
import { asyncHandler } from '../middleware/errorHandler.js';

/**
 * POST /session/start
 * Start a new VPN session
 */
export const start = asyncHandler(async (req, res) => {
  // Accept both camelCase (from frontend) and snake_case (legacy)
  const {
    telegram_id,
    node_id = req.body.nodeId,           // Accept nodeId or node_id
    ton_wallet_address = req.body.userWallet,  // Accept userWallet or ton_wallet_address
    transaction_boc = req.body.transactionBoc, // Accept transactionBoc or transaction_boc
    deposit_amount = req.body.depositAmount    // Accept depositAmount or deposit_amount
  } = req.body;

  // 1. Get or create user
  const user = await getOrCreateUser(telegram_id || 'web_user', {
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

  // 3. Payment Verification
  let paymentChannelId = null;
  let estimatedSessionTime = null; // Initialize estimatedSessionTime

  if (transaction_boc) {
    // TODO: Verify transaction on-chain using the BOC
    // For now, we accept it as valid proof of payment
    console.log(`[Payment] Received transaction BOC for user ${user.id}, amount: ${deposit_amount}`);

    // Get or create payment channel (reuses existing channel for same user+node)
    // If channel exists, adds new deposit to existing balance
    const channel = await getOrCreatePaymentChannel(user.id, node.id, {
      user_id: user.id,
      node_id: node.id,
      channel_address: 'virtual_' + crypto.randomUUID(), // Unique dummy address (only used if creating new)
      initial_balance: deposit_amount || 0,
      current_balance: deposit_amount || 0,
      expires_at: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString() // 24 hours
    });

    paymentChannelId = channel.id;

    // For direct payments, we don't have an estimated session time from a channel
    // This might need to be calculated based on deposit_amount and node rates
    estimatedSessionTime = 'N/A';

  } else {
    // Fallback to existing channel logic
    const channelValidation = await validateChannelForSession(user.id, node.id);

    if (!channelValidation.canStart) {
      return res.status(402).json({
        error: 'Payment required',
        reason: channelValidation.reason,
        details: channelValidation.details
      });
    }
    paymentChannelId = channelValidation.channel.id;
    estimatedSessionTime = channelValidation.estimatedSessionTime;
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
    payment_channel_id: paymentChannelId,
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
      id: session.id, // Critical for frontend redirection
      session_token: sessionToken,
      node: {
        id: node.id,
        region: node.region,
        country: node.country,
        city: node.city,
        endpoint: node.endpoint
      },
      client_ip: clientIP,
      start_time: session.start_time,
      estimated_duration: transaction_boc ? (deposit_amount / (node.price_per_minute || 0.001)) * 60 : 3600 // Fallback or calc
    },
    wireguard_config: wgConfig
  });
});

/**
 * POST /session/stop
 * Stop an active VPN session
 */
export const stop = asyncHandler(async (req, res) => {
  const { sessionId, session_token } = req.body;

  // 1. Get session from database
  // Accept either sessionId (UUID) or session_token for backwards compatibility
  const session = sessionId
    ? await getSessionById(sessionId)
    : await getSessionByToken(session_token);

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
/**
 * GET /session/active/:wallet
 * Get the currently active session for a wallet
 */
export const getActiveSession = asyncHandler(async (req, res) => {
  const { wallet } = req.params;
  console.log('[getActiveSession] Request for wallet:', wallet);

  if (!wallet) {
    console.log('[getActiveSession] No wallet address provided');
    return res.status(400).json({
      error: 'Wallet address is required'
    });
  }

  // Get all sessions for this wallet
  const sessions = await getUserSessions(wallet);
  console.log('[getActiveSession] Retrieved', sessions.length, 'sessions');

  // Find the active one
  const activeSession = sessions.find(s => s.status === 'active');

  if (!activeSession) {
    console.log('[getActiveSession] No active session found');
    return res.json({
      success: true,
      active: false,
      session: null
    });
  }

  console.log('[getActiveSession] Active session found:', {
    id: activeSession.id,
    node_id: activeSession.node_id,
    status: activeSession.status,
    has_node_data: !!activeSession.nodes
  });

  const responseData = {
    success: true,
    active: true,
    session: {
      id: activeSession.id,
      session_token: activeSession.session_token,
      node_id: activeSession.node_id,
      user_id: activeSession.user_id,
      payment_channel_id: activeSession.payment_channel_id,
      status: activeSession.status,
      start_time: activeSession.start_time,
      end_time: activeSession.end_time,
      duration_seconds: activeSession.duration_seconds || 0,
      data_used_bytes: activeSession.data_used_bytes || 0,
      cost_nanoton: activeSession.cost_nanoton || '0',
      client_ip: activeSession.client_ip,
      wg_client_private_key: activeSession.wg_client_private_key,
      wg_client_public_key: activeSession.wg_client_public_key,
      wg_server_public_key: activeSession.wg_server_public_key,
      dns_servers: activeSession.dns_servers || ['1.1.1.1', '8.8.8.8'],
      allowed_ips: activeSession.allowed_ips || ['0.0.0.0/0', '::/0'],
      nodes: activeSession.nodes ? {
        id: activeSession.nodes.id,
        region: activeSession.nodes.region,
        country: activeSession.nodes.country,
        city: activeSession.nodes.city,
        endpoint: activeSession.nodes.endpoint,
        price_per_gb: activeSession.nodes.price_per_gb,
        price_per_minute: activeSession.nodes.price_per_minute
      } : null
    }
  };

  console.log('[getActiveSession] Sending response with session id:', responseData.session.id);
  res.json(responseData);
});

/**
 * GET /session/:id
 * Get session details by ID
 */
export const getSessionById = asyncHandler(async (req, res) => {
  const { id } = req.params;

  // Try to get session by UUID (id) or session_token
  // Since we don't have a direct getSessionById in supabase service that returns joined data easily,
  // we can reuse getSessionByToken if the ID passed is a token, or add a new service method.
  // But wait, the frontend passes the UUID (session.id).
  // Let's check getSessionByToken implementation. It queries by session_token.
  // We need to query by ID.

  // Let's assume we need to add getSessionById to supabase service or use a raw query.
  // For now, let's use getSessionByToken if it matches, or fetch all user sessions and find it? No, inefficient.

  // Let's import getSessionById from supabase service if it exists, or add it.
  // Checking supabase.js... it has getSessionByToken.
  // It does NOT have getSessionById.
  // I will add getSessionById to supabase service in the next step.
  // For now, I'll implement the controller assuming the service function exists.

  const { getSessionById: dbGetSessionById } = await import('../services/supabase.js');

  const session = await dbGetSessionById(id);

  if (!session) {
    return res.status(404).json({
      error: 'Session not found'
    });
  }

  // Construct response
  res.json({
    id: session.id,
    sessionToken: session.session_token,
    status: session.status,
    startTime: session.start_time,
    endTime: session.end_time,
    nodeId: session.node_id,
    nodeLocation: session.nodes ? {
      country: session.nodes.country,
      city: session.nodes.city,
      countryCode: session.nodes.region // Assuming region is country code or similar
    } : {
      country: 'Unknown',
      city: 'Unknown',
      countryCode: 'XX'
    },
    connection: {
      serverIP: session.nodes?.endpoint?.split(':')[0],
      port: session.nodes?.endpoint?.split(':')[1],
      clientIP: session.client_ip
    },
    config: session.wg_client_private_key ? {
      privateKey: session.wg_client_private_key,
      address: session.client_ip,
      dns: session.dns_servers
    } : null,
    costPerHour: session.nodes?.price_per_minute ? session.nodes.price_per_minute * 60 : 0,
    totalCost: session.cost_nanoton,
    paymentChannelId: session.payment_channel_id
  });
});

/**
 * GET /sessions/:wallet
 * Get all sessions for a wallet address
 */
export const getSessions = asyncHandler(async (req, res) => {
  const { wallet } = req.params;

  if (!wallet) {
    return res.status(400).json({
      error: 'Wallet address is required'
    });
  }

  const sessions = await getUserSessions(wallet);

  // Transform sessions for frontend if needed, or return as is
  // The frontend expects an array of sessions
  // We should map them to the expected format
  const formattedSessions = sessions.map(session => ({
    id: session.id,
    sessionToken: session.session_token,
    status: session.status,
    startTime: session.start_time,
    endTime: session.end_time,
    nodeId: session.node_id,
    nodeLocation: session.nodes ? {
      country: session.nodes.country,
      city: session.nodes.city,
      countryCode: session.nodes.region
    } : {
      country: 'Unknown',
      city: 'Unknown',
      countryCode: 'XX'
    },
    connection: {
      serverIP: session.nodes?.endpoint?.split(':')[0],
      port: session.nodes?.endpoint?.split(':')[1],
      clientIP: session.client_ip
    },
    costPerHour: session.nodes?.price_per_minute ? session.nodes.price_per_minute * 60 : 0,
    totalCost: session.cost_nanoton,
    paymentChannelId: session.payment_channel_id
  }));

  res.json(formattedSessions);
});

export default {
  start,
  stop,
  getActiveSession,
  getSessionById,
  getSessions
};
