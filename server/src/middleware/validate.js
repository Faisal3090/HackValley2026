import { AppError } from './errors.js';

export function validateBody(schema) {
  return (req, _res, next) => {
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) {
      const message = parsed.error.issues
        .map((i) => `${i.path.join('.') || 'body'}: ${i.message}`)
        .join('; ');
      return next(new AppError(400, 'VALIDATION_ERROR', message, parsed.error.issues));
    }
    req.body = parsed.data;
    return next();
  };
}

export function validateQuery(schema) {
  return (req, _res, next) => {
    const parsed = schema.safeParse(req.query);
    if (!parsed.success) {
      const message = parsed.error.issues
        .map((i) => `${i.path.join('.') || 'query'}: ${i.message}`)
        .join('; ');
      return next(new AppError(400, 'VALIDATION_ERROR', message, parsed.error.issues));
    }
    req.validatedQuery = parsed.data;
    return next();
  };
}
