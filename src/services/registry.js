import { getNodes } from './supabase.js';

/**
 * Get recommended nodes based on filters
 * Returns a curated list of nodes, not all nodes blindly
 * @param {object} filters - Filter parameters
 * @returns {Promise<Array>} Filtered list of nodes
 */
export async function getRecommendedNodes(filters = {}) {
  try {
    // Build query filters
    const queryFilters = {
      region: filters.region,
      country: filters.country,
      city: filters.city,
      min_price: filters.min_price,
      max_price: filters.max_price,
      max_load: filters.max_load !== undefined ? filters.max_load : 80,
      version: filters.version,
      limit: filters.limit || parseInt(process.env.DEFAULT_RECOMMENDED_NODES) || 10
    };

    // Get filtered nodes from database
    const nodes = await getNodes(queryFilters);

    // Additional filtering and scoring
    const scoredNodes = nodes.map(node => ({
      ...node,
      score: calculateNodeScore(node)
    }));

    // Sort by score (higher is better)
    scoredNodes.sort((a, b) => b.score - a.score);

    return scoredNodes;
  } catch (error) {
    console.error('Error getting recommended nodes:', error.message);
    throw error;
  }
}

/**
 * Calculate a score for a node based on various factors
 * Higher score = better node
 * @param {object} node - Node data
 * @returns {number} Score (0-100)
 */
function calculateNodeScore(node) {
  let score = 100;

  // Penalize high load
  score -= (node.current_load || 0) * 0.5;

  // Penalize high price (normalize to a 0-50 range)
  const pricePerGB = Number(node.price_per_gb) / 1e9;
  const pricePenalty = Math.min(pricePerGB * 10, 50);
  score -= pricePenalty;

  // Bonus for recent heartbeat (active nodes)
  if (node.last_heartbeat) {
    const minutesSinceHeartbeat = (Date.now() - new Date(node.last_heartbeat).getTime()) / 60000;
    if (minutesSinceHeartbeat < 5) {
      score += 10;
    } else if (minutesSinceHeartbeat < 30) {
      score += 5;
    }
  }

  // Bonus for high bandwidth
  if (node.bandwidth_mbps) {
    score += Math.min(node.bandwidth_mbps / 100, 10);
  }

  return Math.max(0, Math.min(100, score));
}

/**
 * Filter nodes by location (region, country, city)
 * @param {Array} nodes - Array of nodes
 * @param {object} location - Location filters
 * @returns {Array} Filtered nodes
 */
export function filterByLocation(nodes, location) {
  return nodes.filter(node => {
    if (location.region && node.region !== location.region) return false;
    if (location.country && node.country !== location.country) return false;
    if (location.city && node.city !== location.city) return false;
    return true;
  });
}

/**
 * Filter nodes by price range
 * @param {Array} nodes - Array of nodes
 * @param {bigint} minPrice - Minimum price per GB in nanoTON
 * @param {bigint} maxPrice - Maximum price per GB in nanoTON
 * @returns {Array} Filtered nodes
 */
export function filterByPrice(nodes, minPrice, maxPrice) {
  return nodes.filter(node => {
    const price = BigInt(node.price_per_gb);
    if (minPrice && price < BigInt(minPrice)) return false;
    if (maxPrice && price > BigInt(maxPrice)) return false;
    return true;
  });
}

/**
 * Filter nodes by maximum load
 * @param {Array} nodes - Array of nodes
 * @param {number} maxLoad - Maximum load percentage (0-100)
 * @returns {Array} Filtered nodes
 */
export function filterByLoad(nodes, maxLoad) {
  return nodes.filter(node => (node.current_load || 0) <= maxLoad);
}

/**
 * Get a single best node for a user based on preferences
 * @param {object} preferences - User preferences
 * @returns {Promise<object>} Best matching node
 */
export async function getBestNode(preferences = {}) {
  const nodes = await getRecommendedNodes({
    ...preferences,
    limit: 5
  });

  if (nodes.length === 0) {
    throw new Error('No nodes available matching criteria');
  }

  return nodes[0];
}

export default {
  getRecommendedNodes,
  calculateNodeScore,
  filterByLocation,
  filterByPrice,
  filterByLoad,
  getBestNode
};
