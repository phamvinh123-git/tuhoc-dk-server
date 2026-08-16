// Chạy schema.sql để tạo (hoặc cập nhật) toàn bộ bảng/trigger. An toàn để chạy lại nhiều lần
// (mọi CREATE đều có IF NOT EXISTS / OR REPLACE / DROP...IF EXISTS trước).
const fs = require('fs');
const path = require('path');
const { pool } = require('./db');

async function migrate() {
  const sql = fs.readFileSync(path.join(__dirname, 'schema.sql'), 'utf8');
  await pool.query(sql);
  console.log('[migrate] Đã tạo/cập nhật schema thành công.');
  await bootstrapAdmin();
}

// Chỉ chạy đúng 1 lần: nếu bảng users đang trống VÀ có đủ 2 biến môi trường
// ADMIN_BOOTSTRAP_USERNAME + ADMIN_BOOTSTRAP_PASSWORD_HASH (hash bcrypt, không phải mật khẩu thô),
// thì tạo 1 tài khoản ADMIN đầu tiên. Idempotent: nếu đã có user nào rồi thì bỏ qua vĩnh viễn.
async function bootstrapAdmin() {
  const username = process.env.ADMIN_BOOTSTRAP_USERNAME;
  const hash = process.env.ADMIN_BOOTSTRAP_PASSWORD_HASH;
  if (!username || !hash) return;
  const { rows } = await pool.query('SELECT COUNT(*)::int AS c FROM users');
  if (rows[0].c > 0) return;
  await pool.query(
    `INSERT INTO users (username, password_hash, ho_ten, role, dang_hoat_dong) VALUES ($1, $2, $3, 'ADMIN', TRUE)`,
    [username, hash, 'Quản trị hệ thống']
  );
  console.log('[migrate] Đã tạo tài khoản admin đầu tiên:', username);
}

if (require.main === module) {
  migrate()
    .then(() => pool.end())
    .catch((e) => { console.error('[migrate] Lỗi:', e); process.exit(1); });
}

module.exports = { migrate };
