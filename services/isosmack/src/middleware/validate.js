import ApiError from '../utils/ApiError.js';

/**
 * Validates req[source] against a zod schema and replaces it with the parsed value.
 * Usage: router.post('/', validate(schema), handler)
 */
export const validate =
  (schema, source = 'body') =>
  (req, _res, next) => {
    const result = schema.safeParse(req[source]);
    if (!result.success) {
      const details = result.error.issues.map((i) => ({
        field: i.path.join('.'),
        message: i.message,
      }));
      return next(ApiError.badRequest(details[0]?.message || 'Invalid request', details));
    }
    if (source === 'query') req.validatedQuery = result.data;
    else req[source] = result.data;
    return next();
  };

export default validate;
