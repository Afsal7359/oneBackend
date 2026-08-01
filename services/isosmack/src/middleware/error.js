import env from '../config/env.js';
import ApiError from '../utils/ApiError.js';

export function notFound(req, _res, next) {
  next(ApiError.notFound(`Route ${req.method} ${req.originalUrl} does not exist`));
}

// eslint-disable-next-line no-unused-vars
export function errorHandler(err, req, res, _next) {
  let error = err;

  // ---- Translate driver/ODM errors into clean API errors ----
  if (err?.name === 'CastError') {
    error = ApiError.badRequest(`Invalid ${err.path}: ${err.value}`);
  } else if (err?.name === 'ValidationError') {
    const details = Object.values(err.errors).map((e) => ({ field: e.path, message: e.message }));
    error = ApiError.badRequest('Please check the highlighted fields', details);
  } else if (err?.code === 11000) {
    const field = Object.keys(err.keyValue || {})[0] || 'field';
    const pretty = field === 'email' ? 'An account with this email already exists' : `That ${field} is already taken`;
    error = ApiError.conflict(pretty);
  } else if (err?.name === 'JsonWebTokenError') {
    error = ApiError.unauthorized('Invalid session');
  } else if (err?.type === 'entity.too.large') {
    error = ApiError.badRequest('Upload is too large');
  } else if (!(err instanceof ApiError)) {
    error = new ApiError(err.statusCode || 500, err.message || 'Something went wrong');
    error.isOperational = false;
  }

  if (!error.isOperational || error.statusCode >= 500) {
    console.error('[error]', req.method, req.originalUrl, '\n', err);
  }

  res.status(error.statusCode || 500).json({
    success: false,
    message: error.message,
    ...(error.details ? { details: error.details } : {}),
    ...(env.NODE_ENV !== 'production' && error.statusCode >= 500 ? { stack: err.stack } : {}),
  });
}
