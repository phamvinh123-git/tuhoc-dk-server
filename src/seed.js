// Gieo dữ liệu mẫu — khớp với bộ dữ liệu mô phỏng đã có trong prototype.html trước đây,
// để trải nghiệm demo/bàn giao không bị "trống trơn" sau khi chuyển sang backend thật.
// An toàn để chạy lại nhiều lần: dùng ON CONFLICT DO NOTHING / kiểm tra tồn tại trước khi tạo.
const bcrypt = require('bcryptjs');
const { pool } = require('./db');
const { migrate } = require('./migrate');

const NGANH = [
  { ten: 'Điều dưỡng', ma: 'DD' },
  { ten: 'Phục hồi chức năng', ma: 'PHCN' },
  { ten: 'Kỹ thuật xét nghiệm', ma: 'XN' },
  { ten: 'Chẩn đoán hình ảnh', ma: 'CDHA' },
];

const SLOTS = [
  { buoi: 'sang', thu: 1, nhan: '8:00 - 8:50' },
  { buoi: 'sang', thu: 2, nhan: '9:00 - 9:50' },
  { buoi: 'sang', thu: 3, nhan: '10:00 - 10:50' },
  { buoi: 'chieu', thu: 1, nhan: '13:30 - 14:20' },
  { buoi: 'chieu', thu: 2, nhan: '14:30 - 15:20' },
  { buoi: 'chieu', thu: 3, nhan: '15:30 - 16:20' },
];

const STAFF = [
  { username: 'admin', password: 'admin123', role: 'ADMIN', hoTen: 'Quản trị hệ thống', nganh: null },
  { username: 'tbm.dd', password: '123456', role: 'TRUONG_BO_MON', hoTen: 'Cô Nguyễn Thị Hạnh', nganh: 'Điều dưỡng' },
  { username: 'cv.dd', password: '123456', role: 'CO_VAN', hoTen: 'Thầy Trần Văn Long', nganh: 'Điều dưỡng' },
  { username: 'ql.dd', password: '123456', role: 'QUAN_LY', hoTen: 'Cô Lê Thị Mai', nganh: 'Điều dưỡng' },
  { username: 'tbm.phcn', password: '123456', role: 'TRUONG_BO_MON', hoTen: 'Thầy Bùi Văn Sơn', nganh: 'Phục hồi chức năng' },
  { username: 'cv.phcn', password: '123456', role: 'CO_VAN', hoTen: 'Cô Ngô Thị Yến', nganh: 'Phục hồi chức năng' },
  { username: 'ql.phcn', password: '123456', role: 'QUAN_LY', hoTen: 'Thầy Phan Văn Đạt', nganh: 'Phục hồi chức năng' },
  { username: 'tbm.xn', password: '123456', role: 'TRUONG_BO_MON', hoTen: 'Cô Đỗ Thị Hương', nganh: 'Kỹ thuật xét nghiệm' },
  { username: 'cv.xn', password: '123456', role: 'CO_VAN', hoTen: 'Thầy Vũ Văn Kiên', nganh: 'Kỹ thuật xét nghiệm' },
  { username: 'ql.xn', password: '123456', role: 'QUAN_LY', hoTen: 'Cô Trịnh Thị Nga', nganh: 'Kỹ thuật xét nghiệm' },
  { username: 'tbm.cdha', password: '123456', role: 'TRUONG_BO_MON', hoTen: 'Thầy Lý Văn Bảo', nganh: 'Chẩn đoán hình ảnh' },
  { username: 'cv.cdha', password: '123456', role: 'CO_VAN', hoTen: 'Cô Hồ Thị Diễm', nganh: 'Chẩn đoán hình ảnh' },
  { username: 'ql.cdha', password: '123456', role: 'QUAN_LY', hoTen: 'Thầy Đinh Văn Phúc', nganh: 'Chẩn đoán hình ảnh' },
];

const STUDENTS = [
  { ma_sv: 'DD45001', ten_sv: 'Nguyễn Thị Lan', to_lop: 'Tổ 1 - ĐD45A', nganh: 'Điều dưỡng' },
  { ma_sv: 'DD45002', ten_sv: 'Trần Văn Bình', to_lop: 'Tổ 1 - ĐD45A', nganh: 'Điều dưỡng' },
  { ma_sv: 'DD45003', ten_sv: 'Lê Thị Hoa', to_lop: 'Tổ 2 - ĐD45A', nganh: 'Điều dưỡng' },
  { ma_sv: 'DD45004', ten_sv: 'Phạm Văn Đức', to_lop: 'Tổ 3 - ĐD45B', nganh: 'Điều dưỡng' },
  { ma_sv: 'DD45005', ten_sv: 'Hoàng Thị Mai', to_lop: 'Tổ 2 - ĐD45A', nganh: 'Điều dưỡng' },
  { ma_sv: 'PHCN45001', ten_sv: 'Đinh Văn Khải', to_lop: 'Tổ 1 - PHCN45A', nganh: 'Phục hồi chức năng' },
  { ma_sv: 'PHCN45002', ten_sv: 'Tạ Thị Quỳnh', to_lop: 'Tổ 1 - PHCN45A', nganh: 'Phục hồi chức năng' },
  { ma_sv: 'PHCN45003', ten_sv: 'Lâm Văn Phát', to_lop: 'Tổ 2 - PHCN45A', nganh: 'Phục hồi chức năng' },
  { ma_sv: 'XN45001', ten_sv: 'Vương Thị Thanh', to_lop: 'Tổ 1 - XN45A', nganh: 'Kỹ thuật xét nghiệm' },
  { ma_sv: 'XN45002', ten_sv: 'Cao Văn Tùng', to_lop: 'Tổ 1 - XN45A', nganh: 'Kỹ thuật xét nghiệm' },
  { ma_sv: 'XN45003', ten_sv: 'Đoàn Thị Hằng', to_lop: 'Tổ 2 - XN45A', nganh: 'Kỹ thuật xét nghiệm' },
  { ma_sv: 'CDHA45001', ten_sv: 'Thái Văn Lộc', to_lop: 'Tổ 1 - CDHA45A', nganh: 'Chẩn đoán hình ảnh' },
  { ma_sv: 'CDHA45002', ten_sv: 'Kiều Thị Vân', to_lop: 'Tổ 1 - CDHA45A', nganh: 'Chẩn đoán hình ảnh' },
  { ma_sv: 'CDHA45003', ten_sv: 'Huỳnh Văn Đông', to_lop: 'Tổ 2 - CDHA45A', nganh: 'Chẩn đoán hình ảnh' },
];

const DD_SUBJECTS = ['Kỹ thuật tiêm truyền', 'Chăm sóc vết thương', 'Đo dấu hiệu sinh tồn', 'Sơ cấp cứu cơ bản', 'Kỹ năng giao tiếp lâm sàng'];
const DD_CODES = { 'Kỹ thuật tiêm truyền': 'DD301', 'Chăm sóc vết thương': 'DD302', 'Đo dấu hiệu sinh tồn': 'DD303', 'Sơ cấp cứu cơ bản': 'DD304', 'Kỹ năng giao tiếp lâm sàng': 'DD305' };
const DD_TEACHERS = { 'Kỹ thuật tiêm truyền': 'Nguyễn Thị Hạnh', 'Chăm sóc vết thương': 'Trần Minh Tuấn', 'Đo dấu hiệu sinh tồn': 'Lê Thị Thu', 'Sơ cấp cứu cơ bản': 'Phạm Văn Nam', 'Kỹ năng giao tiếp lâm sàng': 'Hoàng Thị Yến' };
const DD_CONTENT = {
  'Kỹ thuật tiêm truyền': 'Thực hành kỹ thuật tiêm bắp, tiêm tĩnh mạch và truyền dịch trên mô hình.',
  'Chăm sóc vết thương': 'Thực hành thay băng, rửa vết thương và đánh giá mức độ nhiễm trùng.',
  'Đo dấu hiệu sinh tồn': 'Thực hành đo huyết áp, nhịp tim, nhịp thở, nhiệt độ cho bệnh nhân mô phỏng.',
  'Sơ cấp cứu cơ bản': 'Thực hành ép tim ngoài lồng ngực (CPR), xử trí ngạt thở, cầm máu vết thương hở.',
  'Kỹ năng giao tiếp lâm sàng': 'Thực hành kỹ năng giao tiếp, tư vấn và trấn an người bệnh trong tình huống mô phỏng.',
};

const EQUIPMENT_DD = [
  { ten: 'Bơm kim tiêm (bộ)', tong: 60, tinhTrang: 'Tốt' },
  { ten: 'Mô hình cánh tay tiêm truyền', tong: 15, tinhTrang: 'Tốt' },
  { ten: 'Băng gạc vô trùng', tong: 200, tinhTrang: 'Tốt' },
  { ten: 'Bộ đo huyết áp', tong: 20, tinhTrang: 'Cần bảo trì (2 bộ)' },
];

function getMonday(base) {
  const d = new Date(base);
  const day = d.getDay();
  const diff = d.getDate() - day + (day === 0 ? -6 : 1);
  return new Date(d.getFullYear(), d.getMonth(), diff);
}
function isoDate(d) {
  return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
}
function weekDates(monday, offset) {
  return Array.from({ length: 5 }, (_, i) => new Date(monday.getFullYear(), monday.getMonth(), monday.getDate() + offset * 7 + i));
}

async function seed() {
  await migrate();
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // 1. Ngành
    const nganhId = {};
    for (const n of NGANH) {
      const r = await client.query(
        `INSERT INTO nganh (ten_nganh, ma_nganh) VALUES ($1,$2)
         ON CONFLICT (ten_nganh) DO UPDATE SET ma_nganh=EXCLUDED.ma_nganh RETURNING id`,
        [n.ten, n.ma]
      );
      nganhId[n.ten] = r.rows[0].id;
    }

    // 2. Khung giờ cố định
    for (const s of SLOTS) {
      await client.query(
        `INSERT INTO time_slots (buoi, thu_tu_slot, nhan) VALUES ($1,$2,$3)
         ON CONFLICT (buoi, thu_tu_slot) DO NOTHING`,
        [s.buoi, s.thu, s.nhan]
      );
    }
    const slotRows = (await client.query('SELECT id, buoi, thu_tu_slot FROM time_slots ORDER BY buoi DESC, thu_tu_slot')).rows;
    // buoi DESC để 'sang' đứng trước 'chieu' về mặt chữ cái ngược... an toàn hơn: build map rõ ràng theo slotId cũ (1-6)
    const slotIdOf = {}; // slotId cũ (1..6, đúng thứ tự SLOTS phía frontend) -> id thật trong DB
    const order = [['sang', 1], ['sang', 2], ['sang', 3], ['chieu', 1], ['chieu', 2], ['chieu', 3]];
    order.forEach((o, idx) => {
      const row = slotRows.find(r => r.buoi === o[0] && r.thu_tu_slot === o[1]);
      slotIdOf[idx + 1] = row.id;
    });

    // 3. Tài khoản staff (+ admin)
    const userIdOf = {};
    for (const s of STAFF) {
      const hash = await bcrypt.hash(s.password, 10);
      const nId = s.nganh ? nganhId[s.nganh] : null;
      const r = await client.query(
        `INSERT INTO users (username, password_hash, ho_ten, role, nganh_id, dang_hoat_dong)
         VALUES ($1,$2,$3,$4,$5,TRUE)
         ON CONFLICT (username) DO UPDATE SET password_hash=EXCLUDED.password_hash, ho_ten=EXCLUDED.ho_ten, role=EXCLUDED.role, nganh_id=EXCLUDED.nganh_id
         RETURNING id`,
        [s.username, hash, s.hoTen, s.role, nId]
      );
      userIdOf[s.username] = r.rows[0].id;
    }

    // 4. Sinh viên (mỗi SV mẫu cũng có tài khoản đăng nhập, username = mã SV viết thường, mật khẩu demo "123456")
    const studentIdOf = {};
    const studentHash = await bcrypt.hash('123456', 10);
    for (const s of STUDENTS) {
      const username = s.ma_sv.toLowerCase();
      const nId = nganhId[s.nganh];
      const uRes = await client.query(
        `INSERT INTO users (username, password_hash, ho_ten, role, nganh_id, dang_hoat_dong)
         VALUES ($1,$2,$3,'SINH_VIEN',$4,TRUE)
         ON CONFLICT (username) DO UPDATE SET ho_ten=EXCLUDED.ho_ten, nganh_id=EXCLUDED.nganh_id
         RETURNING id`,
        [username, studentHash, s.ten_sv, nId]
      );
      const userId = uRes.rows[0].id;
      const sRes = await client.query(
        `INSERT INTO students (ma_sv, ten_sv, to_lop, nganh_id, user_id)
         VALUES ($1,$2,$3,$4,$5)
         ON CONFLICT (ma_sv) DO UPDATE SET ten_sv=EXCLUDED.ten_sv, to_lop=EXCLUDED.to_lop, nganh_id=EXCLUDED.nganh_id, user_id=EXCLUDED.user_id
         RETURNING id`,
        [s.ma_sv, s.ten_sv, s.to_lop, nId, userId]
      );
      studentIdOf[s.ma_sv] = sRes.rows[0].id;
    }

    // 5. Lịch học mẫu — chỉ ngành Điều dưỡng, tuần hiện tại (giống bản demo cũ)
    const monday = getMonday(new Date());
    const wDates = weekDates(monday, 0);
    const ddId = nganhId['Điều dưỡng'];
    const scheduleIdByKey = {}; // `${dateISO}_${oldSlotId}` -> db id, dùng để gieo đăng ký mẫu bên dưới
    const existingCount = (await client.query('SELECT count(*)::int AS c FROM schedule_entries WHERE nganh_id=$1', [ddId])).rows[0].c;
    if (existingCount === 0) {
      for (let di = 0; di < wDates.length; di++) {
        const dateISO = isoDate(wDates[di]);
        for (let slotIdOld = 1; slotIdOld <= 6; slotIdOld++) {
          const hasClass = (di + slotIdOld) % 2 === 0;
          if (!hasClass) continue;
          const subj = DD_SUBJECTS[(di + slotIdOld) % DD_SUBJECTS.length];
          const r = await client.query(
            `INSERT INTO schedule_entries (nganh_id, ngay_hoc, time_slot_id, subject, ma_mon, noi_dung, phong, giang_vien, suc_chua)
             VALUES ($1,$2,$3,$4,$5,$6,$7,$8,10)
             ON CONFLICT (nganh_id, ngay_hoc, time_slot_id) DO NOTHING
             RETURNING id`,
            [ddId, dateISO, slotIdOf[slotIdOld], subj, DD_CODES[subj], DD_CONTENT[subj] || '', 'Phòng thực hành ' + (((di + slotIdOld) % 3) + 1), DD_TEACHERS[subj]]
          );
          if (r.rows[0]) scheduleIdByKey[`${dateISO}_${slotIdOld}`] = r.rows[0].id;
        }
      }

      // Đăng ký mẫu: buổi Thứ 2 slot 2 đầy 10 người, buổi Thứ 3 slot 1 gần đầy (8 người) — dùng SV mẫu ảo (không phải SV thật trong danh sách)
      // để không đụng vào 5 SV Điều dưỡng thật ở trên. Tạo nhanh các "SV mẫu" này làm học sinh phụ trong DB.
      async function seedGhostRegs(dateISO, slotIdOld, count, prefix) {
        const key = `${dateISO}_${slotIdOld}`;
        const entryId = scheduleIdByKey[key];
        if (!entryId) return;
        for (let i = 0; i < count; i++) {
          const ma = `${prefix}${10 + i}`;
          const sRes = await client.query(
            `INSERT INTO students (ma_sv, ten_sv, to_lop, nganh_id)
             VALUES ($1,$2,$3,$4) ON CONFLICT (ma_sv) DO UPDATE SET ten_sv=EXCLUDED.ten_sv RETURNING id`,
            [ma, `SV mẫu ${prefix}${i + 1}`, ['Tổ 1 - ĐD45A', 'Tổ 2 - ĐD45A', 'Tổ 3 - ĐD45B'][i % 3], ddId]
          );
          await client.query(
            `INSERT INTO registrations (schedule_entry_id, student_id) VALUES ($1,$2) ON CONFLICT DO NOTHING`,
            [entryId, sRes.rows[0].id]
          );
        }
      }
      await seedGhostRegs(isoDate(wDates[0]), 2, 10, 'DD450');
      await seedGhostRegs(isoDate(wDates[1]), 1, 8, 'DD451');
    }

    // 6. Kho dụng cụ ngành Điều dưỡng
    const eqIdOf = {};
    for (const e of EQUIPMENT_DD) {
      const r = await client.query(
        `INSERT INTO equipment (nganh_id, ten_dung_cu, tong_so_luong, tinh_trang)
         VALUES ($1,$2,$3,$4)
         ON CONFLICT (nganh_id, ten_dung_cu) DO UPDATE SET tong_so_luong=EXCLUDED.tong_so_luong, tinh_trang=EXCLUDED.tinh_trang
         RETURNING id`,
        [ddId, e.ten, e.tong, e.tinhTrang]
      );
      eqIdOf[e.ten] = r.rows[0].id;
    }

    // 7. Giao dụng cụ mẫu cho buổi đầy (Thứ 2 slot 2) — 2 SV mẫu đầu tiên của buổi đó
    const key0 = `${isoDate(wDates[0])}_2`;
    const entry0 = scheduleIdByKey[key0];
    if (entry0) {
      const already = (await client.query('SELECT count(*)::int AS c FROM equipment_assignments WHERE schedule_entry_id=$1', [entry0])).rows[0].c;
      if (already === 0) {
        const sv1 = studentIdOf['DD45001'] ? null : null; // placeholder không dùng
        const ghost1 = (await client.query(`SELECT id FROM students WHERE ma_sv='DD45010'`)).rows[0];
        const ghost2 = (await client.query(`SELECT id FROM students WHERE ma_sv='DD45011'`)).rows[0];
        const adminUserId = userIdOf['ql.dd'];
        if (ghost1) {
          await client.query(`INSERT INTO equipment_assignments (equipment_id, schedule_entry_id, student_id, so_luong, nguoi_giao_id) VALUES ($1,$2,$3,1,$4)`, [eqIdOf['Bơm kim tiêm (bộ)'], entry0, ghost1.id, adminUserId]);
          await client.query(`INSERT INTO equipment_assignments (equipment_id, schedule_entry_id, student_id, so_luong, nguoi_giao_id) VALUES ($1,$2,$3,1,$4)`, [eqIdOf['Mô hình cánh tay tiêm truyền'], entry0, ghost1.id, adminUserId]);
          await client.query(`INSERT INTO equipment_assignments (equipment_id, schedule_entry_id, student_id, so_luong, nguoi_giao_id) VALUES ($1,$2,$3,3,$4)`, [eqIdOf['Băng gạc vô trùng'], entry0, ghost1.id, adminUserId]);
        }
        if (ghost2) {
          await client.query(`INSERT INTO equipment_assignments (equipment_id, schedule_entry_id, student_id, so_luong, nguoi_giao_id) VALUES ($1,$2,$3,1,$4)`, [eqIdOf['Bơm kim tiêm (bộ)'], entry0, ghost2.id, adminUserId]);
        }
      }
    }

    await client.query('COMMIT');
    console.log('[seed] Đã gieo dữ liệu mẫu thành công.');
  } catch (e) {
    await client.query('ROLLBACK');
    throw e;
  } finally {
    client.release();
  }
}

if (require.main === module) {
  seed()
    .then(() => pool.end())
    .catch((e) => { console.error('[seed] Lỗi:', e); process.exit(1); });
}

module.exports = { seed };
