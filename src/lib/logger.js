/**
 * Minimal structured-ish logger. No external dependency — Railway captures
 * stdout/stderr directly, so plain timestamped lines are enough here.
 */
function ts() {
  return new Date().toISOString();
}

function serialize(meta) {
  if (!meta) return '';
  try {
    return ' ' + JSON.stringify(meta);
  } catch (_) {
    return '';
  }
}

module.exports = {
  info: (msg, meta) => console.log(`[${ts()}] INFO  ${msg}${serialize(meta)}`),
  warn: (msg, meta) => console.warn(`[${ts()}] WARN  ${msg}${serialize(meta)}`),
  error: (msg, meta) => console.error(`[${ts()}] ERROR ${msg}${serialize(meta)}`),
  debug: (msg, meta) => {
    if (process.env.DEBUG) console.log(`[${ts()}] DEBUG ${msg}${serialize(meta)}`);
  },
};
