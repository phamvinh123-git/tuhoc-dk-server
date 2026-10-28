// Chạy schema.sql để tạo (hoặc cập nhật) toàn bộ bảng/trigger. An toàn để chạy lại nhiều lần
// (mọi CREATE đều có IF NOT EXISTS / OR REPLACE / DROP...IF EXISTS trước).
const fs = require('fs');
const path = require('path');
const { pool } = require('./db');

async function migrate() {
  const sql = fs.readFileSync(path.join(__dirname, 'schema.sql'), 'utf8');
  await pool.query(sql);
  console.log('[migrate] Đã tạo/cập nhật schema thành công.');
  await seedReferenceData();
  await bumpNganhCapacities();
  await reduceYKhoaCapacity();
  await bootstrapAdmin();
}

// Danh sách Ngành và khung giờ học cố định — đây là dữ liệu CẤU HÌNH của trường (không phải dữ liệu
// demo nhạy cảm như tài khoản/mật khẩu), ứng dụng không hoạt động được nếu thiếu. An toàn để chạy
// lại nhiều lần (ON CONFLICT DO NOTHING/UPDATE).
const NGANH = [
  { ten: 'Điều dưỡng', ma: 'DD' },
  { ten: 'Phục hồi chức năng', ma: 'PHCN' },
  { ten: 'Kỹ thuật xét nghiệm', ma: 'XN' },
  { ten: 'Chẩn đoán hình ảnh', ma: 'CDHA' },
  { ten: 'Y Khoa', ma: 'YK' },
];
const SLOTS = [
  { buoi: 'sang', thu: 1, nhan: '8:00 - 8:50' },
  { buoi: 'sang', thu: 2, nhan: '9:00 - 9:50' },
  { buoi: 'sang', thu: 3, nhan: '10:00 - 10:50' },
  { buoi: 'chieu', thu: 1, nhan: '13:30 - 14:20' },
  { buoi: 'chieu', thu: 2, nhan: '14:30 - 15:20' },
  { buoi: 'chieu', thu: 3, nhan: '15:30 - 16:20' },
];
async function seedReferenceData() {
  for (const n of NGANH) {
    await pool.query(
      `INSERT INTO nganh (ten_nganh, ma_nganh) VALUES ($1,$2)
       ON CONFLICT (ten_nganh) DO UPDATE SET ma_nganh=EXCLUDED.ma_nganh`,
      [n.ten, n.ma]
    );
  }
  for (const s of SLOTS) {
    await pool.query(
      `INSERT INTO time_slots (buoi, thu_tu_slot, nhan) VALUES ($1,$2,$3)
       ON CONFLICT (buoi, thu_tu_slot) DO NOTHING`,
      [s.buoi, s.thu, s.nhan]
    );
  }
  console.log('[migrate] Đã đồng bộ danh sách Ngành + khung giờ học.');
}

// Tăng sức chứa/slot của các buổi học ĐÃ TẠO SẴN ở từng ngành lên đúng mức mặc định mới nhất (khớp
// CAPACITY_BY_NGANH trong src/routes/schedule.js — chỉ đổi map đó thì các buổi CŨ đã tạo trước khi đổi vẫn
// giữ nguyên sức chứa cũ, nên cần bù thêm bước này). Idempotent theo kiểu MỘT CHIỀU (chỉ tăng, không hạ):
// chỉ cập nhật các buổi đang có suc_chua < mức mới, nên chạy lại nhiều lần vô hại — không tự động hạ lại
// nếu sau này có người chỉnh về thấp hơn theo ý muốn. Thêm ngành/mức mới vào đây khi cần tăng tiếp.
const CAPACITY_BUMPS = [
  { ten: 'Điều dưỡng', sucChua: 15 },
];
async function bumpNganhCapacities() {
  for (const b of CAPACITY_BUMPS) {
    const r = await pool.query(
      `UPDATE schedule_entries SET suc_chua = $1, updated_at = now()
       WHERE nganh_id = (SELECT id FROM nganh WHERE ten_nganh = $2) AND suc_chua < $1`,
      [b.sucChua, b.ten]
    );
    if (r.rowCount > 0) {
      console.log(`[migrate] Đã tăng sức chứa lên ${b.sucChua} sinh viên/slot cho ${r.rowCount} buổi học ngành ${b.ten} đã tạo sẵn.`);
    }
  }
}

// Giảm sức chứa/slot của các buổi học ĐÃ TẠO SẴN ở ngành Y Khoa xuống lại mức mặc định 10 (trước đó từng
// tăng lên 20 rồi 25, nay theo yêu cầu giảm về 10 — khớp CAPACITY_BY_NGANH mới trong
// src/routes/schedule.js, ngành Y Khoa không còn override riêng nữa). Idempotent: chỉ cập nhật các buổi
// đang có suc_chua > 10, chạy lại nhiều lần vô hại. Nếu buổi nào đã có NHIỀU HƠN 10 sinh viên đăng ký sẵn
// thì KHÔNG hủy bớt đăng ký của ai cả — chỉ hạ sức chứa xuống 10 nên buổi đó sẽ hiện đầy/khóa (không nhận
// thêm người mới) cho tới khi có người tự hủy bớt, dữ liệu đăng ký cũ vẫn giữ nguyên an toàn. Cũng tính lại
// trang_thai ngay trong câu UPDATE (giống logic ở route toggle-lock) để không bị "khóa ảo"/"mở ảo" sai lệch
// so với sức chứa mới — vì UPDATE trực tiếp suc_chua không tự kích hoạt trigger đồng bộ trang_thai.
async function reduceYKhoaCapacity() {
  const r = await pool.query(
    `UPDATE schedule_entries
     SET suc_chua = 10, updated_at = now(),
         trang_thai = CASE WHEN khoa_thu_cong THEN 'khoa' WHEN so_luong_dk >= 10 THEN 'khoa' ELSE 'mo' END
     WHERE nganh_id = (SELECT id FROM nganh WHERE ten_nganh = 'Y Khoa') AND suc_chua > 10`
  );
  if (r.rowCount > 0) {
    console.log(`[migrate] Đã giảm sức chứa xuống 10 sinh viên/slot cho ${r.rowCount} buổi học ngành Y Khoa đã tạo sẵn.`);
  }
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
