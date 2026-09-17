const db = require('../db/postgres');

async function isBlocked(email) {
  if (!email) return false;
  const { rows } = await db.query(
    'SELECT 1 FROM blocked_senders WHERE email = $1',
    [email.toLowerCase()]
  );
  return rows.length > 0;
}

async function block(email) {
  await db.query(
    'INSERT INTO blocked_senders (email) VALUES ($1) ON CONFLICT (email) DO NOTHING',
    [email.toLowerCase()]
  );
}

async function unblock(email) {
  await db.query('DELETE FROM blocked_senders WHERE email = $1', [email.toLowerCase()]);
}

async function list() {
  const { rows } = await db.query('SELECT email, blocked_at FROM blocked_senders ORDER BY blocked_at DESC');
  return rows;
}

module.exports = { isBlocked, block, unblock, list };
