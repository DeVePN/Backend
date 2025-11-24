/**
 * Validate request body has required fields
 * @param {Array<string>} requiredFields - List of required field names
 * @returns {Function} Express middleware function
 */
export function validateBody(requiredFields) {
  return (req, res, next) => {
    const missing = requiredFields.filter(field => !req.body[field]);

    if (missing.length > 0) {
      const missingStr = missing.join(', ');
      return res.status(400).json({
        error: 'Missing required fields',
        missing: missing,
        message: 'Required fields: ' + missingStr
      });
    }

    next();
  };
}

/**
 * Validate query parameters
 * @param {Array<string>} allowedParams - List of allowed parameter names
 * @returns {Function} Express middleware function
 */
export function validateQuery(allowedParams) {
  return (req, res, next) => {
    const queryKeys = Object.keys(req.query);
    const invalid = queryKeys.filter(key => !allowedParams.includes(key));

    if (invalid.length > 0) {
      const invalidStr = invalid.join(', ');
      return res.status(400).json({
        error: 'Invalid query parameters',
        invalid: invalid,
        allowed: allowedParams,
        message: 'Invalid parameters: ' + invalidStr
      });
    }

    next();
  };
}

/**
 * Validate node registration data
 */
export function validateNodeRegistration(req, res, next) {
  const {
    wg_public_key,
    endpoint,
    region,
    country,
    price_per_gb,
    price_per_minute
  } = req.body;

  const errors = [];

  if (!wg_public_key || typeof wg_public_key !== 'string') {
    errors.push('wg_public_key must be a valid string');
  }

  if (!endpoint || !/^[\d.]+:\d+$/.test(endpoint)) {
    errors.push('endpoint must be in format IP:PORT');
  }

  if (!region || typeof region !== 'string') {
    errors.push('region is required');
  }

  if (!country || typeof country !== 'string') {
    errors.push('country is required');
  }

  if (!price_per_gb || isNaN(price_per_gb) || price_per_gb < 0) {
    errors.push('price_per_gb must be a non-negative number');
  }

  if (!price_per_minute || isNaN(price_per_minute) || price_per_minute < 0) {
    errors.push('price_per_minute must be a non-negative number');
  }

  if (errors.length > 0) {
    return res.status(400).json({
      error: 'Validation failed',
      errors: errors
    });
  }

  next();
}

/**
 * Validate session start request
 */
/**
 * Validate session start request
 */
export function validateSessionStart(req, res, next) {
  // Accept both camelCase and snake_case
  const telegram_id = req.body.telegram_id || req.body.telegramId;
  const wallet_address = req.body.ton_wallet_address || req.body.userWallet;

  const errors = [];

  // Require either telegram_id OR wallet_address
  if ((!telegram_id || typeof telegram_id !== 'string') &&
    (!wallet_address || typeof wallet_address !== 'string')) {
    errors.push('Either telegram_id or userWallet/ton_wallet_address is required');
  }

  // node_id is optional - if not provided, best node will be selected

  if (errors.length > 0) {
    return res.status(400).json({
      error: 'Validation failed',
      errors: errors
    });
  }

  next();
}

/**
 * Validate session stop request
 */
export function validateSessionStop(req, res, next) {
  const { session_token } = req.body;

  if (!session_token || typeof session_token !== 'string') {
    return res.status(400).json({
      error: 'session_token is required and must be a string'
    });
  }

  next();
}

export default {
  validateBody,
  validateQuery,
  validateNodeRegistration,
  validateSessionStart,
  validateSessionStop
};
