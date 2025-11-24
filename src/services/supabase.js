import { createClient } from '@supabase/supabase-js';

// Initialize Supabase client
const supabaseUrl = process.env.SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseServiceKey) {
  throw new Error('Missing Supabase environment variables');
}

// Create Supabase client with service role key for admin access
const supabase = createClient(supabaseUrl, supabaseServiceKey, {
  auth: {
    autoRefreshToken: false,
    persistSession: false
  },
  db: {
    schema: 'public'
  }
});

// Database helper functions

/**
 * Get all nodes with optional filtering
 */
export async function getNodes(filters = {}) {
  let query = supabase
    .from('nodes')
    .select('*')
    .eq('is_active', true);

  // Apply filters
  if (filters.region) {
    query = query.eq('region', filters.region);
  }
  if (filters.country) {
    query = query.eq('country', filters.country);
  }
  if (filters.city) {
    query = query.eq('city', filters.city);
  }
  if (filters.min_price) {
    query = query.gte('price_per_gb', filters.min_price);
  }
  if (filters.max_price) {
    query = query.lte('price_per_gb', filters.max_price);
  }
  if (filters.max_load !== undefined) {
    query = query.lte('current_load', filters.max_load);
  }
  if (filters.version) {
    query = query.eq('version', filters.version);
  }

  // Default sorting: by price (cheapest first), then by load
  query = query.order('price_per_gb', { ascending: true })
    .order('current_load', { ascending: true });

  // Limit results
  const limit = filters.limit || parseInt(process.env.DEFAULT_RECOMMENDED_NODES) || 10;
  query = query.limit(limit);

  const { data, error } = await query;

  if (error) throw error;
  return data;
}

/**
 * Get a single node by ID
 */
export async function getNodeById(nodeId) {
  const { data, error } = await supabase
    .from('nodes')
    .select('*')
    .eq('id', nodeId)
    .single();

  if (error) throw error;
  return data;
}

/**
 * Register a new node
 */
export async function registerNode(nodeData) {
  const { data, error } = await supabase
    .from('nodes')
    .insert([{
      owner_wallet: nodeData.owner_wallet,
      wg_public_key: nodeData.wg_public_key,
      endpoint: nodeData.endpoint,
      region: nodeData.region,
      country: nodeData.country,
      city: nodeData.city || null,
      price_per_gb: nodeData.price_per_gb,
      price_per_minute: nodeData.price_per_minute,
      max_peers: nodeData.max_peers || 100,
      bandwidth_mbps: nodeData.bandwidth_mbps || null,
      version: nodeData.version || '1.0.0',
      metadata: nodeData.metadata || {}
    }])
    .select()
    .single();

  if (error) throw error;
  return data;
}

/**
 * Update node status and load
 */
export async function updateNodeStatus(nodeId, status) {
  const { data, error } = await supabase
    .from('nodes')
    .update({
      current_load: status.current_load,
      is_active: status.is_active,
      last_heartbeat: new Date().toISOString()
    })
    .eq('id', nodeId)
    .select()
    .single();

  if (error) throw error;
  return data;
}

/**
 * Get user by telegram ID or create if doesn't exist
 */
export async function getOrCreateUser(telegramId, userData = {}) {
  // Try to get existing user
  let { data: user, error } = await supabase
    .from('users')
    .select('*')
    .eq('telegram_id', telegramId)
    .single();

  // If user doesn't exist, create one
  if (error && error.code === 'PGRST116') {
    const { data: newUser, error: createError } = await supabase
      .from('users')
      .insert([{
        telegram_id: telegramId,
        ton_wallet_address: userData.ton_wallet_address || null,
        username: userData.username || null
      }])
      .select()
      .single();

    if (createError) throw createError;
    return newUser;
  }

  if (error) throw error;
  return user;
}

/**
 * Get user by wallet address
 */
export async function getUserByWallet(walletAddress) {
  console.log('[getUserByWallet] Input wallet address:', walletAddress);

  // TON addresses can be in different formats (EQ vs 0Q/UQ)
  // Extract the base64 part (everything after EQ/0Q/UQ prefix)
  const addressBase = walletAddress.replace(/^(EQ|0Q|UQ)/, '');
  console.log('[getUserByWallet] Address base (without prefix):', addressBase);

  // Try multiple query strategies
  // Strategy 1: Exact match
  let { data, error } = await supabase
    .from('users')
    .select('*')
    .eq('ton_wallet_address', walletAddress)
    .maybeSingle();

  if (data) {
    console.log('[getUserByWallet] User found with exact match:', {
      id: data.id,
      wallet: data.ton_wallet_address,
      telegram_id: data.telegram_id
    });
    return data;
  }

  console.log('[getUserByWallet] Exact match failed, trying base address match');

  // Strategy 2: Match on base address (case insensitive)
  // This handles EQ vs 0Q vs UQ prefix differences
  ({ data, error } = await supabase
    .from('users')
    .select('*')
    .ilike('ton_wallet_address', `%${addressBase}`)
    .maybeSingle());

  if (data) {
    console.log('[getUserByWallet] User found with base address match:', {
      id: data.id,
      wallet: data.ton_wallet_address,
      telegram_id: data.telegram_id
    });
    return data;
  }

  // Strategy 3: Try with different prefixes
  const prefixes = ['EQ', '0Q', 'UQ'];
  for (const prefix of prefixes) {
    const testAddress = prefix + addressBase;
    console.log('[getUserByWallet] Trying prefix:', prefix, '→', testAddress);

    ({ data, error } = await supabase
      .from('users')
      .select('*')
      .eq('ton_wallet_address', testAddress)
      .maybeSingle());

    if (data) {
      console.log('[getUserByWallet] User found with prefix', prefix, ':', {
        id: data.id,
        wallet: data.ton_wallet_address,
        telegram_id: data.telegram_id
      });
      return data;
    }
  }

  console.log('[getUserByWallet] User not found after all strategies for wallet:', walletAddress);
  return null;
}

/**
 * Create or update user by wallet address (idempotent)
 */
export async function upsertUserByWallet(walletAddress, userData = {}) {
  // Check if user exists
  const existingUser = await getUserByWallet(walletAddress);

  if (existingUser) {
    // Update last_login and any provided data
    const { data, error } = await supabase
      .from('users')
      .update({
        last_login: new Date().toISOString(),
        ...userData
      })
      .eq('ton_wallet_address', walletAddress)
      .select()
      .single();

    if (error) throw error;
    return data;
  }

  // Create new user
  const { data, error } = await supabase
    .from('users')
    .insert([{
      ton_wallet_address: walletAddress,
      telegram_id: userData.telegram_id || null,
      username: userData.username || null,
      last_login: new Date().toISOString()
    }])
    .select()
    .single();

  if (error) throw error;
  return data;
}

/**
 * Get payment channel between user and node
 */
export async function getPaymentChannel(userId, nodeId) {
  const { data, error } = await supabase
    .from('payment_channels')
    .select('*')
    .eq('user_id', userId)
    .eq('node_id', nodeId)
    .eq('status', 'active')
    .single();

  if (error && error.code !== 'PGRST116') throw error;
  return data;
}

/**
 * Create a new payment channel
 */
export async function createPaymentChannel(channelData) {
  const { data, error } = await supabase
    .from('payment_channels')
    .insert([{
      user_id: channelData.user_id,
      node_id: channelData.node_id,
      channel_address: channelData.channel_address,
      initial_balance: channelData.initial_balance,
      current_balance: channelData.current_balance,
      expires_at: channelData.expires_at
    }])
    .select()
    .single();

  if (error) throw error;
  return data;
}

/**
 * Update payment channel balance
 */
export async function updateChannelBalance(channelId, newBalance) {
  const { data, error } = await supabase
    .from('payment_channels')
    .update({
      current_balance: newBalance,
      last_updated: new Date().toISOString()
    })
    .eq('id', channelId)
    .select()
    .single();

  if (error) throw error;
  return data;
}

/**
 * Get or create payment channel (upsert pattern)
 * Checks if channel exists for user+node, if yes updates balance, if no creates new
 */
export async function getOrCreatePaymentChannel(userId, nodeId, channelData) {
  // Check if channel exists
  let channel = await getPaymentChannel(userId, nodeId);

  if (channel) {
    // Channel exists - update balance (add new deposit to existing balance)
    const newBalance = BigInt(channel.current_balance) + BigInt(channelData.initial_balance || 0);

    const { data, error } = await supabase
      .from('payment_channels')
      .update({
        current_balance: newBalance.toString(),
        expires_at: channelData.expires_at,
        status: 'active', // Reactivate if it was closed
        last_updated: new Date().toISOString()
      })
      .eq('id', channel.id)
      .select()
      .single();

    if (error) throw error;
    return data;
  } else {
    // Channel doesn't exist - create new
    return await createPaymentChannel(channelData);
  }
}

/**
 * Create a new session
 */
export async function createSession(sessionData) {
  const { data, error } = await supabase
    .from('sessions')
    .insert([{
      session_token: sessionData.session_token,
      user_id: sessionData.user_id,
      node_id: sessionData.node_id,
      payment_channel_id: sessionData.payment_channel_id,
      wg_client_private_key: sessionData.wg_client_private_key,
      wg_client_public_key: sessionData.wg_client_public_key,
      wg_server_public_key: sessionData.wg_server_public_key,
      client_ip: sessionData.client_ip,
      allowed_ips: sessionData.allowed_ips || ['0.0.0.0/0', '::/0'],
      dns_servers: sessionData.dns_servers || ['1.1.1.1', '8.8.8.8']
    }])
    .select()
    .single();

  if (error) throw error;
  return data;
}

/**
 * Get session by token
 */
export async function getSessionByToken(sessionToken) {
  const { data, error } = await supabase
    .from('sessions')
    .select('*, nodes(*), payment_channels(*)')
    .eq('session_token', sessionToken)
    .single();

  if (error) throw error;
  return data;
}

/**
 * Get session by ID
 */
export async function getSessionById(sessionId) {
  const { data, error } = await supabase
    .from('sessions')
    .select('*, nodes(*), payment_channels(*)')
    .eq('id', sessionId)
    .single();

  if (error) throw error;
  return data;
}

/**
 * Update session and stop it
 */
export async function stopSession(sessionId, usage) {
  const { data, error } = await supabase
    .from('sessions')
    .update({
      status: 'stopped',
      end_time: new Date().toISOString(),
      data_used_bytes: usage.data_used_bytes,
      duration_seconds: usage.duration_seconds,
      cost_nanoton: usage.cost_nanoton
    })
    .eq('id', sessionId)
    .select()
    .single();

  if (error) throw error;
  return data;
}

/**
 * Get all sessions for a wallet address
 */
export async function getUserSessions(walletAddress) {
  console.log('[getUserSessions] Fetching sessions for wallet:', walletAddress);

  // First get the user by wallet
  const user = await getUserByWallet(walletAddress);

  if (!user) {
    // No user found, return empty array
    console.log('[getUserSessions] No user found, returning empty array');
    return [];
  }

  console.log('[getUserSessions] User found, fetching sessions for user_id:', user.id);

  // Then get sessions for that user
  const { data, error } = await supabase
    .from('sessions')
    .select(`
      *,
      nodes (
        id,
        country,
        region,
        city,
        endpoint,
        price_per_gb,
        price_per_minute
      )
    `)
    .eq('user_id', user.id)
    .order('created_at', { ascending: false });

  if (error) {
    console.error('[getUserSessions] Error fetching sessions:', error);
    throw error;
  }

  console.log('[getUserSessions] Found', (data || []).length, 'sessions');
  if (data && data.length > 0) {
    console.log('[getUserSessions] Session statuses:', data.map(s => ({ id: s.id, status: s.status, node_id: s.node_id })));
  }

  return data || [];
}

/**
 * Log a payment transaction
 */
export async function logPayment(paymentData) {
  const { data, error } = await supabase
    .from('payments')
    .insert([{
      session_id: paymentData.session_id,
      payment_channel_id: paymentData.payment_channel_id,
      user_wallet: paymentData.user_wallet,
      node_wallet: paymentData.node_wallet,
      amount: paymentData.amount,
      tx_hash: paymentData.tx_hash || null,
      payment_type: paymentData.payment_type || 'session',
      status: paymentData.status || 'pending'
    }])
    .select()
    .single();

  if (error) throw error;
  return data;
}

export default supabase;
