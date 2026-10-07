// Minimal structured (JSON-lines) logger. Level is controlled by LOG_LEVEL
// (debug | info | warn | error); defaults to "debug" in development and
// "info" in production. debug/info go to stdout, warn/error go to stderr so
// downstream tooling can split the streams.
const LEVELS = { debug: 10, info: 20, warn: 30, error: 40 };

function resolveThreshold() {
  const configured = String(process.env.LOG_LEVEL || '').toLowerCase();
  if (LEVELS[configured]) return LEVELS[configured];
  return process.env.NODE_ENV === 'production' ? LEVELS.info : LEVELS.debug;
}

// Errors don't survive JSON.stringify, so flatten them into plain fields.
function serializeFields(fields) {
  const out = {};
  for (const [key, value] of Object.entries(fields)) {
    out[key] = value instanceof Error
      ? { name: value.name, message: value.message, stack: value.stack }
      : value;
  }
  return out;
}

function write(level, message, fields = {}) {
  if (LEVELS[level] < resolveThreshold()) return;
  const line = JSON.stringify({
    timestamp: new Date().toISOString(),
    level,
    message,
    ...serializeFields(fields),
  });
  const stream = LEVELS[level] >= LEVELS.warn ? process.stderr : process.stdout;
  stream.write(`${line}\n`);
}

export const logger = {
  debug: (message, fields) => write('debug', message, fields),
  info: (message, fields) => write('info', message, fields),
  warn: (message, fields) => write('warn', message, fields),
  error: (message, fields) => write('error', message, fields),
};
