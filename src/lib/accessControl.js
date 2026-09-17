const config = require('../config');
const logger = require('../lib/logger');

/**
 * Inbrix is owner-only. Anyone who isn't TELEGRAM_OWNER_ID is ignored
 * completely and silently — no reply, no error, nothing that confirms the
 * bot even exists to them. `next()` is simply never called.
 */
function ownerOnly() {
  return async (ctx, next) => {
    const fromId = ctx.from && ctx.from.id;
    if (fromId !== config.TELEGRAM_OWNER_ID) {
      if (fromId) logger.debug('Ignored non-owner update', { fromId });
      return;
    }
    return next();
  };
}

module.exports = { ownerOnly };
