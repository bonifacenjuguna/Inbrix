const Redis = require('ioredis');
const config = require('../config');
const logger = require('../lib/logger');

const redis = new Redis(config.REDIS_URL, {
  maxRetriesPerRequest: 3,
  lazyConnect: false,
});

redis.on('error', (err) => {
  logger.error('Redis error', { error: err.message });
});

async function ping() {
  const start = Date.now();
  await redis.ping();
  return Date.now() - start;
}

module.exports = { redis, ping };
