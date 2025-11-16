import { nanoid } from 'nanoid';

/**
 * Generate a unique session token
 * @returns {string} Session token
 */
export function generateSessionToken() {
  const id = nanoid(32);
  return 'session_' + id;
}

/**
 * Generate a unique node ID
 * @returns {string} Node ID
 */
export function generateNodeId() {
  const id = nanoid(16);
  return 'node_' + id;
}

/**
 * Generate a unique payment channel ID
 * @returns {string} Channel ID
 */
export function generateChannelId() {
  const id = nanoid(24);
  return 'channel_' + id;
}

/**
 * Generate a random alphanumeric ID
 * @param {number} length - Length of the ID
 * @returns {string} Random ID
 */
export function generateId(length = 16) {
  return nanoid(length);
}

export default {
  generateSessionToken,
  generateNodeId,
  generateChannelId,
  generateId
};
