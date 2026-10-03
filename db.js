require('dotenv').config();
const { Pool } = require('pg');

const connectionString = process.env.DATABASE_URL;

// SSL logic for cloud databases and production
const ssl = (connectionString && (connectionString.includes('neon.tech') || connectionString.includes('render.com') || process.env.NODE_ENV === 'production')) 
  ? { rejectUnauthorized: false } 
  : false;

const pool = new Pool({
  connectionString,
  ssl,
  max: 20,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 10000
});

pool.on('error', (err, client) => {
  console.error('Unexpected error on idle client', err);
});

module.exports = {
  // Expose the pool directly
  pool,
  // Helper for direct queries
  query: (text, params) => pool.query(text, params),
  // Helper for obtaining a client for transactions
  getClient: () => pool.connect()
};
