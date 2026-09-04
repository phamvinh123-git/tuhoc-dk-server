const express = require('express');
const { pool } = require('../db');
const { authRequired } = require('../middleware');
const { logAction } = require('../audit');
const { isRegistrationClosed } = require('../dateUtil');

const router = express.Router();

// P0002 (đã đủ số lượng tối đa) KHÔNG dùng message tĩnh ở đây — sức chứa giờ khác nhau theo ngành (10 hoặc
// 15), nên dùng thẳng message do trigger fn_check_slot_capacity() (schema.sql) raise ra, đã có đúng số
// động qua v_suc_chua.
const PG_ERROR_MESSAGES = {
  P0001: 'Slot đã bị khóa bởi Cô trưởng bộ môn',
};

router.post('/registrations', authRequired, async (req, res) => {
  const scheduleEntryId = parseInt(req.body.scheduleEntryId);
  let studentId;
  if (req.user.role === 'SINH_VIEN') {
    studentId = req.user.student_id;
    if (!studentId) return res.status(400).json({ error: 'Tài khoản của bạn chưa gắn với hồ sơ sinh viên nào' });
  } else if (req.user.role === 'ADMIN') {
    studentId = parseInt(req.body.studentId);
    if (!studentId) return res.status(400).json({ error: 'Thiếu studentId' });
  } else {
    return res.status(403).json({ error: 'Vai trò của bạn không thể tự đăng ký buổi học' });
  }
  if (!scheduleEntryId) return res.status(400).json({ error: 'Thiếu buổi học' });

  // Khóa đăng ký từ 17:00 (giờ VN) ngày hôm trước buổi học — áp dụng cho sinh viên tự đăng ký; Admin vẫn
  // đăng ký thay được trong trường hợp đặc biệt (giống các quyền ghi đè khác Admin đang có sẵn).
  const entryRow = (await pool.query('SELECT ngay_hoc FROM schedule_entries WHERE id=$1', [scheduleEntryId])).rows[0];
  if (!entryRow) return res.status(404).json({ error: 'Buổi học không tồn tại' });
  if (req.user.role !== 'ADMIN' && isRegistrationClosed(entryRow.ngay_hoc)) {
    return res.status(400).json({ error: 'Đã quá hạn đăng ký — chỉ được đăng ký tới 17:00 ngày hôm trước buổi học.' });
  }

  try {
    await pool.query('INSERT INTO registrations (schedule_entry_id, student_id) VALUES ($1,$2)', [scheduleEntryId, studentId]);
    const info = (await pool.query(
      `SELECT se.subject, se.ngay_hoc, s.ma_sv, s.ten_sv FROM schedule_entries se, students s
       WHERE se.id=$1 AND s.id=$2`, [scheduleEntryId, studentId]
    )).rows[0];
    if (info) {
      await logAction(req.user, 'REGISTER', `${info.ma_sv} (${info.ten_sv}) đăng ký buổi "${info.subject}" ngày ${info.ngay_hoc.toISOString().slice(0, 10)}`);
    }
    res.status(201).json({ ok: true });
  } catch (e) {
    if (e.code === '23505') return res.status(409).json({ error: 'Sinh viên đã đăng ký slot này rồi' });
    if (e.code === 'P0002') return res.status(400).json({ error: e.message });
    if (PG_ERROR_MESSAGES[e.code]) return res.status(400).json({ error: PG_ERROR_MESSAGES[e.code] });
    throw e;
  }
});

router.delete('/registrations', authRequired, async (req, res) => {
  const scheduleEntryId = parseInt(req.query.scheduleEntryId);
  let studentId;
  if (req.user.role === 'SINH_VIEN') {
    studentId = req.user.student_id;
  } else if (['ADMIN', 'TRUONG_BO_MON', 'QUAN_LY'].includes(req.user.role)) {
    studentId = parseInt(req.query.studentId);
    if (!studentId) return res.status(400).json({ error: 'Thiếu studentId' });
  } else {
    return res.status(403).json({ error: 'Bạn không có quyền hủy đăng ký' });
  }
  if (!scheduleEntryId) return res.status(400).json({ error: 'Thiếu buổi học' });

  const info = (await pool.query(
    `SELECT se.subject, se.ngay_hoc, s.ma_sv, s.ten_sv FROM schedule_entries se, students s
     WHERE se.id=$1 AND s.id=$2`, [scheduleEntryId, studentId]
  )).rows[0];
  await pool.query('DELETE FROM registrations WHERE schedule_entry_id=$1 AND student_id=$2', [scheduleEntryId, studentId]);
  if (info) {
    await logAction(req.user, 'CANCEL_REGISTRATION', `Hủy đăng ký của ${info.ma_sv} (${info.ten_sv}) buổi "${info.subject}" ngày ${info.ngay_hoc.toISOString().slice(0, 10)}`);
  }
  res.json({ ok: true });
});

module.exports = router;
