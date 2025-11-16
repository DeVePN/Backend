/**
 * Global error handler middleware
 * Must be added after all routes
 */
export function errorHandler(err, req, res, next) {
  console.error('Error:', err);

  // Handle specific error types
  if (err.name === 'ValidationError') {
    return res.status(400).json({
      error: 'Validation error',
      details: err.message
    });
  }

  if (err.name === 'UnauthorizedError') {
    return res.status(401).json({
      error: 'Unauthorized',
      details: err.message
    });
  }

  if (err.code === 'PGRST116') {
    return res.status(404).json({
      error: 'Resource not found',
      details: 'The requested resource does not exist'
    });
  }

  // Database errors
  if (err.code && err.code.startsWith('PG')) {
    return res.status(500).json({
      error: 'Database error',
      details: process.env.NODE_ENV === 'development' ? err.message : 'Internal server error'
    });
  }

  // Default error response
  res.status(err.status || 500).json({
    error: err.message || 'Internal server error',
    ...(process.env.NODE_ENV === 'development' && { stack: err.stack })
  });
}

/**
 * 404 handler for undefined routes
 */
export function notFoundHandler(req, res) {
  res.status(404).json({
    error: 'Route not found',
    path: req.path,
    method: req.method
  });
}

/**
 * Async error wrapper to catch errors in async route handlers
 * @param {Function} fn - Async route handler
 * @returns {Function} Wrapped handler
 */
export function asyncHandler(fn) {
  return (req, res, next) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
}

export default {
  errorHandler,
  notFoundHandler,
  asyncHandler
};
