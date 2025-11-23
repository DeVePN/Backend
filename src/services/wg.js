import axios from 'axios';

/**
 * Build WireGuard client configuration
 * @param {object} params - Configuration parameters
 * @returns {string} WireGuard configuration file content
 */
export function buildClientConfig(params) {
  const {
    clientPrivateKey,
    clientIP,
    serverPublicKey,
    serverEndpoint,
    allowedIPs = ['0.0.0.0/0', '::/0'],
    dnsServers = ['1.1.1.1', '8.8.8.8'],
    presharedKey = null,
    keepalive = 25
  } = params;

  const dnsString = dnsServers.join(', ');
  const allowedIPsString = allowedIPs.join(', ');

  let config = `[Interface]
PrivateKey = ${clientPrivateKey}
Address = ${clientIP}
DNS = ${dnsString}

[Peer]
PublicKey = ${serverPublicKey}
Endpoint = ${serverEndpoint}
AllowedIPs = ${allowedIPsString}
PersistentKeepalive = ${keepalive}`;

  if (presharedKey) {
    config += `
PresharedKey = ${presharedKey}`;
  }

  return config;
}

/**
 * Send peer add request to node daemon
 * This communicates with the WireGuard daemon running on the VPN node
 * @param {object} peerData - Peer configuration data
 * @returns {Promise<object>} Response from node daemon
 */
/**
 * Send peer add request to node daemon
 * This communicates with the WireGuard daemon running on the VPN node
 * @param {object} peerData - Peer configuration data
 * @returns {Promise<object>} Response from node daemon
 */
export async function addPeerToNode(peerData) {
  const {
    nodeEndpoint,
    clientPublicKey,
    clientIP,
    presharedKey,
    allowedIPs = ['0.0.0.0/0', '::/0']
  } = peerData;

  // MOCK IMPLEMENTATION: Skip actual HTTP call to Node Provider
  // This allows the backend to function without a deployed Node Provider
  console.log(`[MOCK] Adding peer to node ${nodeEndpoint}`);
  console.log(`[MOCK] Client IP: ${clientIP}, PubKey: ${clientPublicKey}`);

  return {
    success: true,
    message: 'Peer added successfully (MOCK)',
    peer: {
      publicKey: clientPublicKey,
      allowedIPs: clientIP,
      endpoint: nodeEndpoint
    }
  };
}

/**
 * Send peer remove request to node daemon
 * @param {object} peerData - Peer removal data
 * @returns {Promise<object>} Response from node daemon
 */
export async function removePeerFromNode(peerData) {
  const {
    nodeEndpoint,
    clientPublicKey
  } = peerData;

  // MOCK IMPLEMENTATION
  console.log(`[MOCK] Removing peer from node ${nodeEndpoint}`);
  console.log(`[MOCK] PubKey: ${clientPublicKey}`);

  return {
    success: true,
    message: 'Peer removed successfully (MOCK)'
  };
}

/**
 * Get peer statistics from node daemon
 * @param {string} nodeEndpoint - Node endpoint (IP:PORT)
 * @param {string} clientPublicKey - Client public key
 * @returns {Promise<object>} Peer statistics (bytes transferred, etc.)
 */
export async function getPeerStats(nodeEndpoint, clientPublicKey) {
  // MOCK IMPLEMENTATION
  // Return random stats to simulate usage
  const rx_bytes = Math.floor(Math.random() * 1000000);
  const tx_bytes = Math.floor(Math.random() * 1000000);

  return {
    rx_bytes,
    tx_bytes,
    last_handshake: Date.now()
  };
}

/**
 * Generate a unique client IP address in the VPN network
 * @param {string} networkPrefix - Network prefix (e.g., "10.8.0")
 * @param {number} nodeId - Node identifier to avoid IP conflicts
 * @returns {string} Assigned IP address with CIDR (e.g., "10.8.0.2/24")
 */
export function assignClientIP(networkPrefix = '10.8.0', nodeId = 0) {
  // Simple IP assignment: use random number between 2-254
  // In production, track assigned IPs in database
  const octet = Math.floor(Math.random() * 253) + 2;
  return `${networkPrefix}.${octet}/24`;
}

export default {
  buildClientConfig,
  addPeerToNode,
  removePeerFromNode,
  getPeerStats,
  assignClientIP
};
