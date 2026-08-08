const notFound = (req, res, next) => {
  res.status(404);
  next(new Error(`Not Found - ${req.originalUrl}`));
};

const errorHandler = (err, req, res, next) => {
  let status = res.statusCode === 200 ? 500 : res.statusCode;
  let message = err && err.message;

  // Errors thrown from middleware that runs before any route can't set
  // res.statusCode first, so they carry their own. Without this a blocked CORS
  // origin was reported as a 500 — it logged a stack trace on every hit and
  // read like the API was broken rather than doing its job.
  if (Number.isInteger(err?.status)) status = err.status;

  // Mongoose bad ObjectId
  if (err.name === 'CastError' && err.kind === 'ObjectId') {
    status = 404;
    message = 'Resource not found';
  }
  // Mongoose validation
  if (err.name === 'ValidationError' && err.errors) {
    status = 400;
    message = Object.values(err.errors).map((e) => e.message).join(', ');
  }
  // Duplicate key
  if (err.code === 11000) {
    status = 400;
    const field = Object.keys(err.keyValue || {})[0] || 'field';
    message = `Duplicate value for ${field}`;
  }
  // Third-party SDKs (Razorpay, Cloudinary) reject with plain objects that have
  // no .message — without this the client received `{}` and showed "Request failed".
  if (!message) {
    message =
      err?.error?.description ||
      err?.error?.message ||
      (typeof err === 'string' ? err : '') ||
      'Something went wrong on the server';
    if (err?.statusCode >= 400 && err?.statusCode < 500) status = 502; // upstream refused us, not the customer's fault
  }

  // Always leave a trace for a 5xx, whatever shape the failure arrived in.
  if (status >= 500) {
    console.error(`[${req.method} ${req.originalUrl}] ${status}`, err?.stack || err);
  }

  res.status(status).json({
    message,
    fields: err?.fields,   // per-field messages for form-level validation
    stack: process.env.NODE_ENV === 'production' ? undefined : err?.stack,
  });
};

module.exports = { notFound, errorHandler };
