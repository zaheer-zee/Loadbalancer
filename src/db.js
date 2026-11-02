require('dotenv').config();
const { PriorityPgPool } = require('pg-priority-pool');

const PRIORITY = {
  CRITICAL: 1,
  HIGH: 2,
  NORMAL: 10,
  LOW: 20,
};

const pool = new PriorityPgPool({
  user: process.env.PGUSER || 'postgres',
  host: process.env.PGHOST || 'localhost',
  database: process.env.PGDATABASE || 'test',
  password: process.env.PGPASSWORD,
  port: parseInt(process.env.PGPORT || '5432', 10),
  max: parseInt(process.env.POOL_MAX || '3', 10),
  agingIntervalMs: parseInt(process.env.AGING_INTERVAL_MS || '3000', 10),
});

module.exports = {
  pool,
  PRIORITY,
};

