import { getRecommendedNodes, getNodeById as dbGetNodeById } from '../services/registry.js';
import { registerNode as dbRegisterNode, updateNodeStatus } from '../services/supabase.js';
import { asyncHandler } from '../middleware/errorHandler.js';

/**
 * GET /nodes
 * Get filtered list of VPN nodes
 */
export const getNodes = asyncHandler(async (req, res) => {
  const filters = {
    region: req.query.region,
    country: req.query.country,
    city: req.query.city,
    min_price: req.query.min_price ? BigInt(req.query.min_price) : undefined,
    max_price: req.query.max_price ? BigInt(req.query.max_price) : undefined,
    max_load: req.query.max_load ? parseInt(req.query.max_load) : undefined,
    version: req.query.version,
    limit: req.query.limit ? parseInt(req.query.limit) : undefined
  };

  const nodes = await getRecommendedNodes(filters);

  res.json({
    success: true,
    count: nodes.length,
    nodes: nodes.map(node => ({
      id: node.id,
      region: node.region,
      country: node.country,
      city: node.city,
      endpoint: node.endpoint,
      price_per_gb: node.price_per_gb,
      price_per_minute: node.price_per_minute,
      current_load: node.current_load,
      bandwidth_mbps: node.bandwidth_mbps,
      version: node.version,
      score: node.score,
      last_heartbeat: node.last_heartbeat
    }))
  });
});

/**
 * POST /node/register
 * Register a new VPN node
 */
export const register = asyncHandler(async (req, res) => {
  const {
    wg_public_key,
    endpoint,
    region,
    country,
    city,
    price_per_gb,
    price_per_minute,
    max_peers,
    bandwidth_mbps,
    version,
    metadata
  } = req.body;

  // Get wallet address from auth middleware
  const ownerWallet = req.wallet?.address || req.body.owner_wallet;

  if (!ownerWallet) {
    return res.status(401).json({
      error: 'Wallet authentication required',
      message: 'Please provide wallet authentication or owner_wallet in body'
    });
  }

  // Register node in database
  const node = await dbRegisterNode({
    owner_wallet: ownerWallet,
    wg_public_key,
    endpoint,
    region: region.toLowerCase(),
    country: country.toLowerCase(),
    city: city ? city.toLowerCase() : null,
    price_per_gb: BigInt(price_per_gb),
    price_per_minute: BigInt(price_per_minute),
    max_peers: max_peers || 100,
    bandwidth_mbps: bandwidth_mbps || null,
    version: version || '1.0.0',
    metadata: metadata || {}
  });

  res.status(201).json({
    success: true,
    message: 'Node registered successfully',
    node: {
      id: node.id,
      wg_public_key: node.wg_public_key,
      endpoint: node.endpoint,
      region: node.region,
      country: node.country,
      city: node.city,
      is_active: node.is_active,
      created_at: node.created_at
    }
  });
});

/**
 * POST /node/heartbeat
 * Receive health updates from node daemon
 */
export const heartbeat = asyncHandler(async (req, res) => {
  const { nodeId, status, load, activePeers } = req.body;

  if (!nodeId) {
    return res.status(400).json({
      success: false,
      error: 'nodeId is required'
    });
  }

  // Update node status in database
  await updateNodeStatus(nodeId, {
    is_active: status === 'online',
    current_load: load || 0,
    last_heartbeat: new Date().toISOString()
  });

  res.json({
    success: true,
    message: 'Heartbeat received',
    nodeId,
    timestamp: new Date().toISOString()
  });
});

/**
 * GET /nodes/:id
 * Get single node by ID
 */
export const getNodeById = asyncHandler(async (req, res) => {
  const { id } = req.params;

  if (!id) {
    return res.status(400).json({
      error: 'Node ID is required'
    });
  }

  const node = await dbGetNodeById(id);

  if (!node) {
    return res.status(404).json({
      error: 'Node not found'
    });
  }

  res.json({
    success: true,
    node: {
      id: node.id,
      owner_wallet: node.owner_wallet,
      wg_public_key: node.wg_public_key,
      endpoint: node.endpoint,
      region: node.region,
      country: node.country,
      city: node.city,
      price_per_gb: node.price_per_gb,
      price_per_minute: node.price_per_minute,
      current_load: node.current_load,
      bandwidth_mbps: node.bandwidth_mbps,
      max_peers: node.max_peers,
      version: node.version,
      score: node.score,
      is_active: node.is_active,
      last_heartbeat: node.last_heartbeat,
      created_at: node.created_at,
      updated_at: node.updated_at
    }
  });
});

export default {
  getNodes,
  getNodeById,
  register,
  heartbeat
};
