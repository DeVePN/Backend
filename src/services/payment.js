import { verifyPaymentChannel } from './ton.js';
import { getPaymentChannel, updateChannelBalance } from './supabase.js';

const MIN_CHANNEL_BALANCE = BigInt(process.env.MIN_CHANNEL_BALANCE || '1000000000');
const MIN_SESSION_UNIT = BigInt(process.env.MIN_SESSION_UNIT_NANOTON || '100000000');
const SESSION_UNIT_MINUTES = parseInt(process.env.SESSION_UNIT_MINUTES || '5');
const SESSION_UNIT_MB = parseInt(process.env.SESSION_UNIT_MB || '10');

/**
 * Check if user has a valid payment channel with sufficient balance
 * @param {string} userId - User ID
 * @param {string} nodeId - Node ID
 * @returns {Promise<object>} Payment channel status
 */
export async function checkPaymentChannelBalance(userId, nodeId) {
  try {
    // Get payment channel from database
    const channel = await getPaymentChannel(userId, nodeId);
    
    if (!channel) {
      return {
        valid: false,
        reason: 'No payment channel found',
        channelExists: false
      };
    }

    // Check if channel has expired
    if (channel.expires_at && new Date(channel.expires_at) < new Date()) {
      return {
        valid: false,
        reason: 'Payment channel has expired',
        channelExists: true,
        expired: true
      };
    }

    // Check if channel has minimum balance for session unit
    const currentBalance = BigInt(channel.current_balance);
    
    if (currentBalance < MIN_SESSION_UNIT) {
      return {
        valid: false,
        reason: `Insufficient balance. Need at least ${MIN_SESSION_UNIT} nanoTON for ${SESSION_UNIT_MINUTES} minutes or ${SESSION_UNIT_MB} MB`,
        channelExists: true,
        balance: currentBalance,
        requiredBalance: MIN_SESSION_UNIT
      };
    }

    // Optionally verify on-chain balance
    const onChainVerification = await verifyPaymentChannel(
      channel.channel_address,
      MIN_SESSION_UNIT
    );

    return {
      valid: true,
      channel: channel,
      balance: currentBalance,
      onChainBalance: onChainVerification.balance,
      sessionUnit: {
        minutes: SESSION_UNIT_MINUTES,
        megabytes: SESSION_UNIT_MB,
        cost: MIN_SESSION_UNIT
      }
    };
  } catch (error) {
    console.error('Error checking payment channel:', error.message);
    return {
      valid: false,
      reason: 'Failed to verify payment channel',
      error: error.message
    };
  }
}

/**
 * Calculate session cost based on usage
 * @param {object} usage - Session usage data
 * @param {object} node - Node pricing information
 * @returns {bigint} Cost in nanoTON
 */
export function calculateSessionCost(usage, node) {
  const { data_used_bytes, duration_seconds } = usage;
  const { price_per_gb, price_per_minute } = node;

  // Calculate data cost
  const dataGB = data_used_bytes / (1024 * 1024 * 1024);
  const dataCost = BigInt(Math.ceil(dataGB * Number(price_per_gb)));

  // Calculate time cost
  const durationMinutes = duration_seconds / 60;
  const timeCost = BigInt(Math.ceil(durationMinutes * Number(price_per_minute)));

  // Return the higher of the two (or sum them, depending on pricing model)
  // For now, we'll use whichever is greater
  return dataCost > timeCost ? dataCost : timeCost;
}

/**
 * Deduct session cost from payment channel
 * @param {string} channelId - Payment channel ID
 * @param {bigint} cost - Cost to deduct in nanoTON
 * @returns {Promise<object>} Updated channel
 */
export async function deductFromChannel(channelId, cost) {
  try {
    const channel = await getPaymentChannel(channelId);
    
    if (!channel) {
      throw new Error('Payment channel not found');
    }

    const currentBalance = BigInt(channel.current_balance);
    const newBalance = currentBalance - BigInt(cost);

    if (newBalance < 0n) {
      throw new Error('Insufficient balance to deduct cost');
    }

    const updatedChannel = await updateChannelBalance(channelId, newBalance.toString());
    
    return {
      success: true,
      previousBalance: currentBalance,
      deducted: cost,
      newBalance: newBalance,
      channel: updatedChannel
    };
  } catch (error) {
    console.error('Error deducting from channel:', error.message);
    throw error;
  }
}

/**
 * Validate payment channel for session start
 * This is called before starting a session
 * @param {string} userId - User ID
 * @param {string} nodeId - Node ID
 * @returns {Promise<object>} Validation result
 */
export async function validateChannelForSession(userId, nodeId) {
  const channelStatus = await checkPaymentChannelBalance(userId, nodeId);
  
  if (!channelStatus.valid) {
    return {
      canStart: false,
      reason: channelStatus.reason,
      details: channelStatus
    };
  }

  return {
    canStart: true,
    channel: channelStatus.channel,
    balance: channelStatus.balance,
    estimatedSessionTime: `~${SESSION_UNIT_MINUTES} minutes minimum`
  };
}

export default {
  checkPaymentChannelBalance,
  calculateSessionCost,
  deductFromChannel,
  validateChannelForSession,
  MIN_SESSION_UNIT,
  SESSION_UNIT_MINUTES,
  SESSION_UNIT_MB
};
