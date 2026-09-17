const fs = require('fs');
const path = require('path');
const { pool } = require('./postgres');
const logger = require('../lib/logger');

async function migrate() {
  const sql = fs.readFileSync(path.join(__dirname, 'schema.sql'), 'utf8');
  await pool.query(sql);
  logger.info('Database schema is up to date');
}

// Allow `npm run migrate` standalone, or being required by index.js on boot.
if (require.main === module) {
  migrate()
    .then(() => process.exit(0))
    .catch((err) => {
      logger.error('Migration failed', { error: err.message });
      process.exit(1);
    });
}

module.exports = { migrate };
