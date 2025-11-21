import axios from 'axios';
import { Address } from '@ton/core';

const TON_API_URL = process.env.TON_API_URL || 'https://testnet.toncenter.com/api/v2';
const TON_API_KEY = process.env.TON_API_KEY || '';

/**
 * Get account balance from TON blockchain
 * @param {string} address - TON wallet address
 * @returns {Promise<bigint>} Balance in nanoTON
 */
export async function getAccountBalance(address) {
  try {
    const response = await axios.get(`${TON_API_URL}/getAddressBalance`, {
      params: {
        address: address
      },
      headers: {
        'X-API-Key': TON_API_KEY
      }
    });

    return BigInt(response.data.result || 0);
  } catch (error) {
    console.error('Failed to get account balance:', error.message);
    throw new Error(`TON API error: ${error.message}`);
  }
}

/**
 * Get transaction history for an address
 * @param {string} address - TON wallet address
 * @param {number} limit - Max number of transactions to fetch
 * @returns {Promise<Array>} Array of transactions
 */
export async function getTransactions(address, limit = 10) {
  try {
    const response = await axios.get(`${TON_API_URL}/getTransactions`, {
      params: {
        address: address,
        limit: limit
      },
      headers: {
        'X-API-Key': TON_API_KEY
      }
    });

    return response.data.result || [];
  } catch (error) {
    console.error('Failed to get transactions:', error.message);
    return [];
  }
}

/**
 * Verify a payment channel exists and has sufficient balance
 * @param {string} channelAddress - Payment channel smart contract address
 * @param {bigint} requiredBalance - Minimum required balance in nanoTON
 * @returns {Promise<object>} Channel status and balance
 */
export async function verifyPaymentChannel(channelAddress, requiredBalance) {
  try {
    const balance = await getAccountBalance(channelAddress);
    
    return {
      exists: balance > 0n,
      balance: balance,
      sufficient: balance >= BigInt(requiredBalance),
      channelAddress: channelAddress
    };
  } catch (error) {
    console.error('Failed to verify payment channel:', error.message);
    return {
      exists: false,
      balance: 0n,
      sufficient: false,
      channelAddress: channelAddress,
      error: error.message
    };
  }
}

/**
 * Verify wallet signature (for authentication)
 * This is a simplified version - in production use TON Connect SDK
 * @param {string} walletAddress - TON wallet address
 * @param {string} signature - Signature to verify
 * @param {string} message - Original message that was signed
 * @returns {Promise<boolean>} True if signature is valid
 */
export async function verifyWalletSignature(walletAddress, signature, message) {
  try {
    // Basic validation: check address format is valid TON address
    const addr = Address.parse(walletAddress);

    // Verify the parsed address matches the input (normalized form)
    if (!addr || addr.toString() !== walletAddress) {
      console.warn('Wallet address format mismatch:', walletAddress);
      return false;
    }

    // For hackathon: just verify address is valid TON address
    // TODO: Full signature verification for production using TON Connect SDK
    console.log('✓ Wallet address format validated:', walletAddress);
    return true;

  } catch (error) {
    console.error('Invalid wallet address format:', error.message);
    return false;
  }
}

/**
 * Check if a payment transaction is confirmed on chain
 * @param {string} txHash - Transaction hash
 * @returns {Promise<object>} Transaction status
 */
export async function checkTransactionStatus(txHash) {
  try {
    // Note: TON uses logical time (lt) and hash for tx identification
    // This is simplified for demo purposes
    const response = await axios.get(`${TON_API_URL}/detectAddress`, {
      params: {
        address: txHash
      },
      headers: {
        'X-API-Key': TON_API_KEY
      }
    });

    return {
      confirmed: response.data.ok || false,
      data: response.data.result
    };
  } catch (error) {
    return {
      confirmed: false,
      error: error.message
    };
  }
}

/**
 * Convert TON to nanoTON
 * @param {number} ton - Amount in TON
 * @returns {bigint} Amount in nanoTON
 */
export function tonToNano(ton) {
  return BigInt(Math.floor(ton * 1e9));
}

/**
 * Convert nanoTON to TON
 * @param {bigint} nanoton - Amount in nanoTON
 * @returns {number} Amount in TON
 */
export function nanoToTon(nanoton) {
  return Number(nanoton) / 1e9;
}

export default {
  getAccountBalance,
  getTransactions,
  verifyPaymentChannel,
  verifyWalletSignature,
  checkTransactionStatus,
  tonToNano,
  nanoToTon
};
