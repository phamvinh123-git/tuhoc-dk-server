// Chạy schema.sql để tạo (hoặc cập nhật) toàn bộ bảng/trigger. An toàn để chạy lại nhiều lần
// (mọi CREATE đều có IF NOT EXISTS / OR REPLACE / DROP...IF EXISTS trước).
const fs = require('fs');
const path = require('path');
const { pool } = require('./db');

async function migrate() {
  const sql = fs.readFileSync(path.join(__dirname, 'schema.sql'), 'utf8');
  await pool.query(sql);
  console.log('[migrate] Đã tạo/cập nhật schema thành công.');
}

if (require.main === module) {
  migrate()
    .then(() => pool.end())
    .catch((e) => { console.error('[migrate] Lỗi:', e); process.exit(1); });
}

module.exports = { migrate };
