// db.js
const { Pool } = require('pg');

const isCloud = !!process.env.DATABASE_URL;

const pool = isCloud
  ? new Pool({
      connectionString: process.env.DATABASE_URL,
      ssl: { rejectUnauthorized: false }
    })
  : new Pool({
      user: process.env.DB_USER,
      host: process.env.DB_HOST,
      database: process.env.DB_NAME,
      password: process.env.DB_PASSWORD,
      port: process.env.DB_PORT,
    });

pool.on('connect', () => {
  console.log('🟢 [DB] Conectado exitosamente a PostgreSQL');
});

pool.on('error', (err) => {
  console.error('🔴 [DB] Error inesperado en el pool de PostgreSQL:', err);
});

module.exports = pool;