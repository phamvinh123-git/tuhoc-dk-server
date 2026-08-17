const express = require('express');
const { pool } = require('../db');
const { authRequired, resolveNganhAccess, ROLES_SUA_LICH } = require('../middleware');
const { getSlotMaps } = require('../slots');

const router = express.Router();

function requireSuaLich(req, res, next) {
  if (!ROLES_SUA_LICH.includes(req.user.role)) return res.status(403).json({ error: 'Bạn không có quyền sửa lịch học' });
  next();
}

// Tạo 1 buổi học mới
router.post('/schedule', authRequired, requireSuaLich, async (req, res) => {
  const { nganh: tenNganh, dateISO, slotId, subject, content, room, teacher } = req.body;
  if (!subject || !String(subject).trim()) return res.status(400).json({ error: 'Vui lòng nhập tên môn học' });
  if (!room || !String(room).trim()) return res.status(400).json({ error: 'Vui lòng nhập phòng' });
  const nganh = await resolveNganhAccess(req, res, tenNganh);
  if (!nganh) return;
  const { oldToDbId } = await getSlotMaps();
  const dbSlotId = oldToDbId[slotId];
  if (!dbSlotId) return res.status(400).json({ error: 'Slot không hợp lệ' });

  try {
    const r = await pool.query(
      `INSERT INTO schedule_entries (nganh_id, ngay_hoc, time_slot_id, subject, noi_dung, phong, giang_vien, suc_chua, created_by)
       VALUES ($1,$2,$3,$4,$5,$6,$7,10,$8) RETURNING id`,
      [nganh.id, dateISO, dbSlotId, String(subject).trim(), String(content || '').trim(), String(room).trim(), String(teacher || '').trim(), req.user.id]
    );
    res.status(201).json({ id: r.rows[0].id });
  } catch (e) {
    if (e.code === '23505') return res.status(409).json({ error: 'Đã có buổi học tại ngày/khung giờ này rồi ở ngành đã chọn — hãy chọn ngày, khung giờ hoặc ngành khác.' });
    throw e;
  }
});

// Tạo hàng loạt theo khoảng ngày
router.post('/schedule/bulk', authRequired, requireSuaLich, async (req, res) => {
  const { nganh: tenNganh, fromISO, toISO, slotId, subject, content, room, teacher } = req.body;
  if (!fromISO || !toISO) return res.status(400).json({ error: 'Vui lòng chọn Từ ngày và Đến ngày' });
  if (fromISO > toISO) return res.status(400).json({ error: '"Từ ngày" phải trước hoặc bằng "Đến ngày"' });
  if (!subject || !String(subject).trim()) return res.status(400).json({ error: 'Vui lòng nhập tên môn học / bài học' });
  if (!room || !String(room).trim()) return res.status(400).json({ error: 'Vui lòng nhập phòng học' });
  const nganh = await resolveNganhAccess(req, res, tenNganh);
  if (!nganh) return;
  const { oldToDbId } = await getSlotMaps();
  const dbSlotId = oldToDbId[slotId];
  if (!dbSlotId) return res.status(400).json({ error: 'Slot không hợp lệ' });

  // Tạo cho TẤT CẢ các ngày trong khoảng (kể cả Thứ 7 / Chủ nhật) — lịch tự học không giới hạn ngày trong tuần.
  let created = 0, skippedExisting = 0;
  let cur = new Date(fromISO + 'T00:00:00');
  const end = new Date(toISO + 'T00:00:00');
  while (cur <= end) {
    const dISO = cur.getFullYear() + '-' + String(cur.getMonth() + 1).padStart(2, '0') + '-' + String(cur.getDate()).padStart(2, '0');
    try {
      await pool.query(
        `INSERT INTO schedule_entries (nganh_id, ngay_hoc, time_slot_id, subject, noi_dung, phong, giang_vien, suc_chua, created_by)
         VALUES ($1,$2,$3,$4,$5,$6,$7,10,$8)`,
        [nganh.id, dISO, dbSlotId, String(subject).trim(), String(content || '').trim(), String(room).trim(), String(teacher || '').trim(), req.user.id]
      );
      created++;
    } catch (e) {
      if (e.code === '23505') skippedExisting++; else throw e;
    }
    cur.setDate(cur.getDate() + 1);
  }
  res.json({ created, skippedExisting });
});

// Sửa 1 buổi học đã có (đổi khung giờ / ngành nếu chưa có SV đăng ký; luôn sửa được nội dung/phòng/GV)
router.put('/schedule/:id', authRequired, requireSuaLich, async (req, res) => {
  const id = parseInt(req.params.id);
  const { nganh: tenNganh, slotId, subject, content, room, teacher } = req.body;
  if (!subject || !String(subject).trim()) return res.status(400).json({ error: 'Vui lòng nhập tên môn học' });
  if (!room || !String(room).trim()) return res.status(400).json({ error: 'Vui lòng nhập phòng' });

  const cur = (await pool.query(
    `SELECT se.*, n.ten_nganh, (SELECT count(*)::int FROM registrations WHERE schedule_entry_id=se.id) AS so_dk
     FROM schedule_entries se JOIN nganh n ON n.id=se.nganh_id WHERE se.id=$1`, [id]
  )).rows[0];
  if (!cur) return res.status(404).json({ error: 'Không tìm thấy buổi học' });

  const targetNganh = await resolveNganhAccess(req, res, tenNganh || cur.ten_nganh);
  if (!targetNganh) return;
  const { oldToDbId, dbIdToOld } = await getSlotMaps();
  const curOldSlotId = dbIdToOld[cur.time_slot_id];
  const newSlotId = slotId ? parseInt(slotId) : curOldSlotId;
  const dbSlotId = oldToDbId[newSlotId];
  if (!dbSlotId) return res.status(400).json({ error: 'Slot không hợp lệ' });

  const moving = dbSlotId !== cur.time_slot_id || targetNganh.id !== cur.nganh_id;
  if (moving && cur.so_dk > 0) {
    return res.status(400).json({ error: 'Không thể đổi khung giờ hoặc ngành: buổi học đã có sinh viên đăng ký. Hãy hủy đăng ký trước.' });
  }

  try {
    await pool.query(
      `UPDATE schedule_entries SET nganh_id=$1, time_slot_id=$2, subject=$3, noi_dung=$4, phong=$5, giang_vien=$6, updated_at=now() WHERE id=$7`,
      [targetNganh.id, dbSlotId, String(subject).trim(), String(content || '').trim(), String(room).trim(), String(teacher || '').trim(), id]
    );
    res.json({ ok: true, movedNganh: targetNganh.id !== cur.nganh_id, nganh: targetNganh.ten_nganh, ngayHoc: cur.ngay_hoc.toISOString().slice(0, 10) });
  } catch (e) {
    if (e.code === '23505') return res.status(409).json({ error: 'Khung giờ mới đã có buổi học khác trong ngày này ở ngành đã chọn — hãy chọn khung giờ hoặc ngành khác.' });
    throw e;
  }
});

router.delete('/schedule/:id', authRequired, requireSuaLich, async (req, res) => {
  const id = parseInt(req.params.id);
  const cur = (await pool.query(`SELECT id, (SELECT count(*)::int FROM registrations WHERE schedule_entry_id=schedule_entries.id) AS so_dk FROM schedule_entries WHERE id=$1`, [id])).rows[0];
  if (!cur) return res.status(404).json({ error: 'Không tìm thấy buổi học' });
  if (cur.so_dk > 0) return res.status(400).json({ error: 'Không thể xóa: đã có sinh viên đăng ký buổi này. Hãy hủy hết đăng ký trước.' });
  await pool.query('DELETE FROM schedule_entries WHERE id=$1', [id]);
  res.json({ ok: true });
});

// Khóa/mở khóa thủ công — chỉ Trưởng bộ môn / Quản lý / Admin
router.post('/schedule/:id/toggle-lock', authRequired, requireSuaLich, async (req, res) => {
  const id = parseInt(req.params.id);
  const cur = (await pool.query('SELECT khoa_thu_cong FROM schedule_entries WHERE id=$1', [id])).rows[0];
  if (!cur) return res.status(404).json({ error: 'Không tìm thấy buổi học' });
  const newVal = !cur.khoa_thu_cong;
  await pool.query(
    `UPDATE schedule_entries SET khoa_thu_cong=$1,
       trang_thai = CASE WHEN $1 THEN 'khoa' WHEN so_luong_dk >= suc_chua THEN 'khoa' ELSE 'mo' END,
       updated_at=now() WHERE id=$2`,
    [newVal, id]
  );
  res.json({ ok: true, lockedManual: newVal });
});

module.exports = router;
