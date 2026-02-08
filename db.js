const { Pool } = require('pg');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false,
});

async function initDB() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS app_state (
      id INTEGER PRIMARY KEY DEFAULT 1,
      state JSONB NOT NULL DEFAULT '{}',
      updated_at TIMESTAMPTZ DEFAULT NOW()
    );
  `);
  // Ensure the single row exists
  await pool.query(`
    INSERT INTO app_state (id, state) VALUES (1, '{}')
    ON CONFLICT (id) DO NOTHING;
  `);
}

async function getState() {
  const { rows } = await pool.query('SELECT state FROM app_state WHERE id = 1');
  return rows.length ? rows[0].state : {};
}

async function setState(state) {
  await pool.query(
    `INSERT INTO app_state (id, state, updated_at) VALUES (1, $1, NOW())
     ON CONFLICT (id) DO UPDATE SET state = $1, updated_at = NOW()`,
    [JSON.stringify(state)]
  );
}

module.exports = { pool, initDB, getState, setState };
