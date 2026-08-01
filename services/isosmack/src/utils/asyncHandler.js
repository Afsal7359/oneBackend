/** Wraps an async route handler so rejected promises reach the error middleware. */
export const asyncHandler = (fn) => (req, res, next) =>
  Promise.resolve(fn(req, res, next)).catch(next);

/** Uniform success envelope used by every controller. */
export const ok = (res, data = {}, status = 200) =>
  res.status(status).json({ success: true, ...data });

export default asyncHandler;
