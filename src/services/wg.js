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
export async function addPeerToNode(peerData) {
  const {
    nodeEndpoint,
    clientPublicKey,
    clientIP,
    presharedKey,
    allowedIPs = ['0.0.0.0/0', '::/0']
  } = peerData;

  try {
    // Extract the base URL from node endpoint (remove port)
    const [nodeHost] = nodeEndpoint.split(':');
    const daemonUrl = `http://${nodeHost}:8080/peer/add`;

    const response = await axios.post(daemonUrl, {
      public_key: clientPublicKey,
      allowed_ips: allowedIPs,
      client_ip: clientIP,
      preshared_key: presharedKey || null
    }, {
      timeout: 5000,
      headers: {
        'Content-Type': 'application/json'
      }
    });

    return response.data;
  } catch (error) {
    console.error('Failed to add peer to node:', error.message);
    throw new Error(`Node daemon communication failed: ${error.message}`);
  }
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

  try {
    const [nodeHost] = nodeEndpoint.split(':');
    const daemonUrl = `http://${nodeHost}:8080/peer/remove`;

    const response = await axios.post(daemonUrl, {
      public_key: clientPublicKey
    }, {
      timeout: 5000,
      headers: {
        'Content-Type': 'application/json'
      }
    });

    return response.data;
  } catch (error) {
    console.error('Failed to remove peer from node:', error.message);
    throw new Error(`Node daemon communication failed: ${error.message}`);
  }
}

/**
 * Get peer statistics from node daemon
 * @param {string} nodeEndpoint - Node endpoint (IP:PORT)
 * @param {string} clientPublicKey - Client public key
 * @returns {Promise<object>} Peer statistics (bytes transferred, etc.)
 */
export async function getPeerStats(nodeEndpoint, clientPublicKey) {
  try {
    const [nodeHost] = nodeEndpoint.split(':');
    const daemonUrl = `http://${nodeHost}:8080/peer/stats`;

    const response = await axios.get(daemonUrl, {
      params: {
        public_key: clientPublicKey
      },
      timeout: 5000
    });

    return response.data;
  } catch (error) {
    console.error('Failed to get peer stats:', error.message);
    return { rx_bytes: 0, tx_bytes: 0 };
  }
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
