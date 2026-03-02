import pg from 'pg';
const { Pool } = pg;

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.DB_SSL === 'false' ? false : { rejectUnauthorized: false },
});

pool.on('error', (err) => {
  console.error('Unexpected PG pool error:', err);
});

export async function query<T extends pg.QueryResultRow = any>(
  text: string,
  params?: any[]
): Promise<pg.QueryResult<T>> {
  return pool.query<T>(text, params);
}

export async function initDB(): Promise<void> {
  await query(`
    CREATE TABLE IF NOT EXISTS journal_entries (
      id        TEXT PRIMARY KEY,
      date      TEXT NOT NULL,
      text      TEXT NOT NULL,
      mood      TEXT NOT NULL DEFAULT '',
      prompt    TEXT,
      timestamp BIGINT NOT NULL,
      edited    BOOLEAN NOT NULL DEFAULT FALSE
    )
  `);
  await query(`CREATE INDEX IF NOT EXISTS idx_entries_date ON journal_entries(date)`);
  await query(`CREATE INDEX IF NOT EXISTS idx_entries_timestamp ON journal_entries(timestamp DESC)`);

  await query(`
    CREATE TABLE IF NOT EXISTS user_profile (
      id             TEXT PRIMARY KEY DEFAULT 'main',
      about_me       TEXT NOT NULL DEFAULT '',
      current_season TEXT NOT NULL DEFAULT '',
      preferences    TEXT NOT NULL DEFAULT '',
      avoidances     TEXT NOT NULL DEFAULT ''
    )
  `);
  await query(`INSERT INTO user_profile (id) VALUES ('main') ON CONFLICT (id) DO NOTHING`);

  console.log('Database tables initialized');
}

export default pool;
