import crypto from 'node:crypto';
import { logger } from '../shared/logger.js';

const NANOSECONDS_PER_MILLISECOND = 1_000_000n;

// Log level for the end-of-request line: failures are loud, client errors are
// a warning, everything else is routine.
function levelForStatus(statusCode) {
  if (statusCode >= 500) return 'error';
  if (statusCode >= 400) return 'warn';
  return 'info';
}

// Logs one line when a request starts and one when it finishes (with status
// and duration from a monotonic clock). Only the path is logged — never the
// query string or headers, which can carry tokens.
export function requestLogger(req, res, next) {
  const requestId = req.headers['x-request-id'] || crypto.randomUUID();
  const startedAt = process.hrtime.bigint();
  // Captured once: Express strips the mount prefix from req.path while inside
  // app.use('/api', ...) and restores it afterwards, so it can't be read twice.
  const fullPath = `${req.baseUrl}${req.path}`;
  res.setHeader('X-Request-Id', requestId);

  logger.info('request started', { requestId, method: req.method, path: fullPath });

  res.on('finish', () => {
    const durationMs = Number((process.hrtime.bigint() - startedAt) / NANOSECONDS_PER_MILLISECOND);
    logger[levelForStatus(res.statusCode)]('request completed', {
      requestId,
      method: req.method,
      path: fullPath,
      status: res.statusCode,
      durationMs,
    });
  });

  next();
}
