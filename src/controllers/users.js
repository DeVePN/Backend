import { getUserByWallet, upsertUserByWallet } from '../services/supabase.js';

/**
 * Register or update user profile (idempotent)
 * POST /users/register
 * Headers: X-Wallet-Address (required)
 * Body: { username?, telegram_id? }
 */
export async function registerUser(req, res) {
  try {
    const walletAddress = req.headers['x-wallet-address'];

    if (!walletAddress) {
      return res.status(400).json({
        error: 'Missing wallet address',
        message: 'X-Wallet-Address header is required'
      });
    }

    // Extract optional data from request body
    const { username, telegram_id } = req.body || {};

    // Create or update user (idempotent operation)
    const user = await upsertUserByWallet(walletAddress, {
      username,
      telegram_id
    });

    return res.status(200).json({
      success: true,
      user: {
        id: user.id,
        wallet_address: user.ton_wallet_address,
        username: user.username,
        telegram_id: user.telegram_id,
        created_at: user.created_at,
        last_login: user.last_login
      }
    });
  } catch (error) {
    console.error('Error registering user:', error);
    return res.status(500).json({
      error: 'Failed to register user',
      message: error.message
    });
  }
}

/**
 * Get current user profile
 * GET /users/me
 * Headers: X-Wallet-Address (required)
 */
export async function getCurrentUser(req, res) {
  try {
    const walletAddress = req.headers['x-wallet-address'];

    if (!walletAddress) {
      return res.status(400).json({
        error: 'Missing wallet address',
        message: 'X-Wallet-Address header is required'
      });
    }

    const user = await getUserByWallet(walletAddress);

    if (!user) {
      return res.status(404).json({
        error: 'User not found',
        message: 'No user profile found for this wallet address'
      });
    }

    return res.status(200).json({
      success: true,
      user: {
        id: user.id,
        wallet_address: user.ton_wallet_address,
        username: user.username,
        telegram_id: user.telegram_id,
        created_at: user.created_at,
        last_login: user.last_login
      }
    });
  } catch (error) {
    console.error('Error fetching user:', error);
    return res.status(500).json({
      error: 'Failed to fetch user',
      message: error.message
    });
  }
}
