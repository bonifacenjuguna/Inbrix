const { Pool } = require('pg');
const config = require('../config');
const logger = require('../lib/logger');

// Railway's internal Postgres URLs don't need SSL; external/managed ones
// (e.g. a hosted Postgres add-on) usually do. `sslmode=require` in the
// connection string is respected by `pg` automatically; this flag only
// covers the common "external host, no sslmode in the URL" case.
const needsSsl = /sslmode=require/.test(config.DATABASE_URL) ||
  /\.railway\.app|render\.com|amazonaws\.com|neon\.tech|supabase\.co/.test(config.DATABASE_URL);

const pool = new Pool({
  connectionString: config.DATABASE_URL,
  ssl: needsSsl ? { rejectUnauthorized: false } : false,
  max: 5,
  idleTimeoutMillis: 30000,
});

pool.on('error', (err) => {
  // Fires on idle client errors (dropped connections etc.) — never let it
  // crash the whole process, just log it.
  logger.error('Unexpected Postgres pool error', { error: err.message });
});

async function query(text, params) {
  return pool.query(text, params);
}

async function ping() {
  const start = Date.now();
  await pool.query('SELECT 1');
  return Date.now() - start;
}

module.exports = { pool, query, ping };
