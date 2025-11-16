/**
 * Validate required environment variables
 * @throws {Error} If required env vars are missing
 */
export function validateEnv() {
  const required = [
    'SUPABASE_URL',
    'SUPABASE_SERVICE_ROLE_KEY',
    'TON_API_URL',
    'NODE_ENV'
  ];

  const missing = required.filter(key => !process.env[key]);

  if (missing.length > 0) {
    const missingVars = missing.join(', ');
    throw new Error('Missing required environment variables: ' + missingVars);
  }
}

/**
 * Get environment variable with fallback
 * @param {string} key - Environment variable key
 * @param {any} defaultValue - Default value if not set
 * @returns {any} Environment variable value or default
 */
export function getEnv(key, defaultValue = null) {
  return process.env[key] || defaultValue;
}

/**
 * Check if running in production
 * @returns {boolean} True if production environment
 */
export function isProduction() {
  return process.env.NODE_ENV === 'production';
}

/**
 * Check if running in development
 * @returns {boolean} True if development environment
 */
export function isDevelopment() {
  return process.env.NODE_ENV === 'development';
}

export default {
  validateEnv,
  getEnv,
  isProduction,
  isDevelopment
};
