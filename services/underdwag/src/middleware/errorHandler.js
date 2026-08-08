export function notFound(req, res, next) {
  res.status(404);
  next(new Error(`Not found: ${req.originalUrl}`));
}

export function errorHandler(err, req, res, next) {
  // `err.status` first: middleware that runs before any route can't set
  // res.statusCode, so a blocked CORS origin would otherwise be reported as a
  // 500 — a refusal logged as a server fault.
  const status = Number.isInteger(err?.status)
    ? err.status
    : (res.statusCode && res.statusCode !== 200 ? res.statusCode : 500);
  res.status(status).json({
    message: err.message || 'Server error',
    stack: process.env.NODE_ENV === 'production' ? undefined : err.stack,
  });
}
