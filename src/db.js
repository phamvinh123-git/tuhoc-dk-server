const { Pool } = require('pg');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  // Nhiều nhà cung cấp Postgres miễn phí (Render, Railway...) yêu cầu SSL nhưng dùng chứng chỉ tự ký.
  ssl: process.env.PGSSL === 'require' ? { rejectUnauthorized: false } : false,
});

module.exports = { pool };
