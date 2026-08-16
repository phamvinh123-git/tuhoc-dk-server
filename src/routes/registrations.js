const express = require('express');
const { pool } = require('../db');
const { authRequired } = require('../middleware');

const router = express.Router();

const PG_ERROR_MESSAGES = {
  P0001: 'Slot đã bị khóa bởi Cô trưởng bộ môn',
  P0002: 'Slot đã đủ 10 người — tự động khóa',
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

  try {
    await pool.query('INSERT INTO registrations (schedule_entry_id, student_id) VALUES ($1,$2)', [scheduleEntryId, studentId]);
    res.status(201).json({ ok: true });
  } catch (e) {
    if (e.code === '23505') return res.status(409).json({ error: 'Sinh viên đã đăng ký slot này rồi' });
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

  await pool.query('DELETE FROM registrations WHERE schedule_entry_id=$1 AND student_id=$2', [scheduleEntryId, studentId]);
  res.json({ ok: true });
});

module.exports = router;
