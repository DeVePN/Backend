import nacl from 'tweetnacl';

/**
 * Generate a WireGuard keypair using Curve25519
 * WireGuard uses the same curve as NaCl's box
 */
export function generateWireGuardKeypair() {
  const keypair = nacl.box.keyPair();
  
  // Convert to base64 (WireGuard standard format)
  const privateKey = Buffer.from(keypair.secretKey).toString('base64');
  const publicKey = Buffer.from(keypair.publicKey).toString('base64');
  
  return {
    privateKey,
    publicKey
  };
}

/**
 * Generate a preshared key for additional security
 */
export function generatePresharedKey() {
  const key = nacl.randomBytes(32);
  return Buffer.from(key).toString('base64');
}

/**
 * Derive public key from private key
 * @param {string} privateKeyBase64 - Base64 encoded private key
 * @returns {string} Base64 encoded public key
 */
export function derivePublicKey(privateKeyBase64) {
  const privateKey = Buffer.from(privateKeyBase64, 'base64');
  const keypair = nacl.box.keyPair.fromSecretKey(new Uint8Array(privateKey));
  return Buffer.from(keypair.publicKey).toString('base64');
}

export default {
  generateWireGuardKeypair,
  generatePresharedKey,
  derivePublicKey
};
