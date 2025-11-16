import { verifyWalletSignature } from '../services/ton.js';

/**
 * Middleware to verify TON wallet authentication
 * Expects headers:
 * - x-wallet-address: TON wallet address
 * - x-wallet-signature: Signature of a message
 * - x-wallet-message: The original message that was signed
 */
export async function verifyWalletAuth(req, res, next) {
  try {
    const walletAddress = req.headers['x-wallet-address'];
    const signature = req.headers['x-wallet-signature'];
    const message = req.headers['x-wallet-message'];

    // For hackathon/testnet: allow requests without wallet auth if in development
    if (process.env.NODE_ENV === 'development' && !walletAddress) {
      console.warn('[DEV MODE] Skipping wallet authentication');
      req.wallet = { address: 'dev_wallet', verified: false };
      return next();
    }

    if (!walletAddress || !signature || !message) {
      return res.status(401).json({
        error: 'Missing wallet authentication headers',
        required: ['x-wallet-address', 'x-wallet-signature', 'x-wallet-message']
      });
    }

    // Verify the signature
    const isValid = await verifyWalletSignature(walletAddress, signature, message);

    if (!isValid) {
      return res.status(401).json({
        error: 'Invalid wallet signature'
      });
    }

    // Attach wallet info to request
    req.wallet = {
      address: walletAddress,
      verified: true
    };

    next();
  } catch (error) {
    console.error('Wallet authentication error:', error.message);
    res.status(500).json({
      error: 'Wallet authentication failed',
      details: error.message
    });
  }
}

/**
 * Optional wallet auth - doesn't fail if not provided
 */
export async function optionalWalletAuth(req, res, next) {
  const walletAddress = req.headers['x-wallet-address'];
  
  if (!walletAddress) {
    req.wallet = null;
    return next();
  }

  // If wallet is provided, verify it
  return verifyWalletAuth(req, res, next);
}

export default {
  verifyWalletAuth,
  optionalWalletAuth
};
