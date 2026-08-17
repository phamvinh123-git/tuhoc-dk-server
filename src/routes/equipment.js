const express = require('express');
const { pool } = require('../db');
const { authRequired, resolveNganhAccess, ROLES_QUAN_LY_DUNG_CU } = require('../middleware');
const { logAction } = require('../audit');

const router = express.Router();

function requireQuanLyDungCu(req, res, next) {
  if (!ROLES_QUAN_LY_DUNG_CU.includes(req.user.role)) return res.status(403).json({ error: 'Bạn không có quyền quản lý kho dụng cụ' });
  next();
}

router.post('/equipment', authRequired, requireQuanLyDungCu, async (req, res) => {
  const { nganh: tenNganh, ten, tong, tinhTrang } = req.body;
  if (!ten || !String(ten).trim()) return res.status(400).json({ error: 'Vui lòng nhập tên dụng cụ' });
  const nganh = await resolveNganhAccess(req, res, tenNganh);
  if (!nganh) return;
  try {
    const r = await pool.query(
      `INSERT INTO equipment (nganh_id, ten_dung_cu, tong_so_luong, tinh_trang) VALUES ($1,$2,$3,$4) RETURNING id`,
      [nganh.id, String(ten).trim(), parseInt(tong) || 1, String(tinhTrang || 'Tốt').trim()]
    );
    await logAction(req.user, 'CREATE_EQUIPMENT', `Thêm dụng cụ "${String(ten).trim()}" (${parseInt(tong) || 1}) ngành ${nganh.ten_nganh}`);
    res.status(201).json({ id: r.rows[0].id });
  } catch (e) {
    if (e.code === '23505') return res.status(409).json({ error: 'Dụng cụ này đã có trong kho' });
    throw e;
  }
});

// Giao dụng cụ cho 1 sinh viên
router.post('/equipment-assignments', authRequired, requireQuanLyDungCu, async (req, res) => {
  const { scheduleEntryId, studentId, equipmentId, soLuong } = req.body;
  if (!scheduleEntryId || !studentId || !equipmentId) return res.status(400).json({ error: 'Thiếu thông tin' });
  const qty = parseInt(soLuong) || 1;
  const r = await pool.query(
    `INSERT INTO equipment_assignments (equipment_id, schedule_entry_id, student_id, so_luong, nguoi_giao_id)
     VALUES ($1,$2,$3,$4,$5) RETURNING id`,
    [equipmentId, scheduleEntryId, studentId, qty, req.user.id]
  );
  const info = (await pool.query(
    `SELECT e.ten_dung_cu, s.ma_sv, s.ten_sv FROM equipment e, students s WHERE e.id=$1 AND s.id=$2`,
    [equipmentId, studentId]
  )).rows[0];
  if (info) {
    await logAction(req.user, 'ASSIGN_EQUIPMENT', `Giao ${info.ten_dung_cu} ×${qty} cho ${info.ma_sv} (${info.ten_sv})`);
  }
  res.status(201).json({ id: r.rows[0].id });
});

// Giao nhanh cùng 1 loại/số lượng cho cả lớp (mọi SV đã đăng ký buổi học đó)
router.post('/equipment-assignments/bulk', authRequired, requireQuanLyDungCu, async (req, res) => {
  const { scheduleEntryId, equipmentId, soLuong } = req.body;
  if (!scheduleEntryId || !equipmentId) return res.status(400).json({ error: 'Thiếu thông tin' });
  const students = (await pool.query('SELECT student_id FROM registrations WHERE schedule_entry_id=$1', [scheduleEntryId])).rows;
  const qty = parseInt(soLuong) || 1;
  for (const s of students) {
    await pool.query(
      `INSERT INTO equipment_assignments (equipment_id, schedule_entry_id, student_id, so_luong, nguoi_giao_id) VALUES ($1,$2,$3,$4,$5)`,
      [equipmentId, scheduleEntryId, s.student_id, qty, req.user.id]
    );
  }
  const eq = (await pool.query('SELECT ten_dung_cu FROM equipment WHERE id=$1', [equipmentId])).rows[0];
  const se = (await pool.query('SELECT subject, ngay_hoc FROM schedule_entries WHERE id=$1', [scheduleEntryId])).rows[0];
  await logAction(req.user, 'BULK_ASSIGN_EQUIPMENT',
    `Giao hàng loạt ${eq ? eq.ten_dung_cu : ''} ×${qty} cho ${students.length} SV — buổi "${se ? se.subject : ''}"${se ? ' ngày ' + se.ngay_hoc.toISOString().slice(0, 10) : ''}`);
  res.json({ ok: true, count: students.length });
});

router.delete('/equipment-assignments/:id', authRequired, requireQuanLyDungCu, async (req, res) => {
  const id = parseInt(req.params.id);
  const info = (await pool.query(
    `SELECT e.ten_dung_cu, s.ma_sv, s.ten_sv, ea.so_luong FROM equipment_assignments ea
     JOIN equipment e ON e.id=ea.equipment_id JOIN students s ON s.id=ea.student_id WHERE ea.id=$1`, [id]
  )).rows[0];
  await pool.query('DELETE FROM equipment_assignments WHERE id=$1', [id]);
  if (info) {
    await logAction(req.user, 'REMOVE_EQUIPMENT_ASSIGNMENT', `Thu hồi ${info.ten_dung_cu} ×${info.so_luong} từ ${info.ma_sv} (${info.ten_sv})`);
  }
  res.json({ ok: true });
});

module.exports = router;
