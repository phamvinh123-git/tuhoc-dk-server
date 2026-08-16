const express = require('express');
const bcrypt = require('bcryptjs');
const { pool } = require('../db');
const { signToken } = require('../auth');
const { authRequired } = require('../middleware');

const router = express.Router();

function userView(row) {
  return {
    id: row.id,
    username: row.username,
    ho_ten: row.ho_ten,
    role: row.role,
    nganh: row.ten_nganh || null,
    ma_sv: row.ma_sv || null,
    student_id: row.student_id || null,
  };
}

router.post('/login', async (req, res) => {
  const username = String(req.body.username || '').trim().toLowerCase();
  const password = String(req.body.password || '');
  if (!username || !password) return res.status(400).json({ error: 'Vui lòng nhập tên đăng nhập và mật khẩu' });

  const r = await pool.query(
    `SELECT u.id, u.username, u.password_hash, u.ho_ten, u.role, u.dang_hoat_dong, u.nganh_id, n.ten_nganh,
            s.id AS student_id, s.ma_sv
     FROM users u
     LEFT JOIN nganh n ON n.id = u.nganh_id
     LEFT JOIN students s ON s.user_id = u.id
     WHERE lower(u.username) = $1`,
    [username]
  );
  const row = r.rows[0];
  if (!row) return res.status(401).json({ error: 'Sai tên đăng nhập hoặc mật khẩu' });
  const ok = await bcrypt.compare(password, row.password_hash);
  if (!ok) return res.status(401).json({ error: 'Sai tên đăng nhập hoặc mật khẩu' });
  if (!row.dang_hoat_dong) return res.status(403).json({ error: 'Tài khoản đã bị khóa — liên hệ Quản trị viên để được mở lại.' });

  const token = signToken({ uid: row.id });
  res.json({ token, user: userView(row) });
});

router.post('/register', async (req, res) => {
  const nganhTen = String(req.body.nganh || '').trim();
  const ma_sv = String(req.body.ma_sv || '').trim().toUpperCase();
  const ten_sv = String(req.body.ten_sv || '').trim();
  const to_lop = String(req.body.to_lop || '').trim();
  const username = String(req.body.username || '').trim().toLowerCase();
  const password = String(req.body.password || '');
  const password2 = String(req.body.password2 || '');

  if (!ma_sv || !ten_sv || !to_lop || !username || !password) return res.status(400).json({ error: 'Vui lòng điền đầy đủ thông tin' });
  if (password !== password2) return res.status(400).json({ error: 'Mật khẩu nhập lại không khớp' });
  if (password.length < 4) return res.status(400).json({ error: 'Mật khẩu cần tối thiểu 4 ký tự' });

  const nganhRow = (await pool.query('SELECT id FROM nganh WHERE ten_nganh=$1', [nganhTen])).rows[0];
  if (!nganhRow) return res.status(400).json({ error: 'Ngành không hợp lệ' });

  const dupMaSv = (await pool.query('SELECT 1 FROM students WHERE upper(ma_sv)=$1', [ma_sv])).rows[0];
  if (dupMaSv) return res.status(409).json({ error: 'Mã sinh viên này đã có tài khoản' });

  const dupUser = (await pool.query('SELECT 1 FROM users WHERE lower(username)=$1', [username])).rows[0];
  if (dupUser) return res.status(409).json({ error: 'Tên đăng nhập đã được sử dụng — hãy chọn tên khác' });

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const hash = await bcrypt.hash(password, 10);
    const uRes = await client.query(
      `INSERT INTO users (username, password_hash, ho_ten, role, nganh_id, dang_hoat_dong)
       VALUES ($1,$2,$3,'SINH_VIEN',$4,TRUE) RETURNING id`,
      [username, hash, ten_sv, nganhRow.id]
    );
    await client.query(
      `INSERT INTO students (ma_sv, ten_sv, to_lop, nganh_id, user_id) VALUES ($1,$2,$3,$4,$5)`,
      [ma_sv, ten_sv, to_lop, nganhRow.id, uRes.rows[0].id]
    );
    await client.query('COMMIT');
  } catch (e) {
    await client.query('ROLLBACK');
    if (e.code === '23505') return res.status(409).json({ error: 'Mã sinh viên hoặc tên đăng nhập đã tồn tại' });
    throw e;
  } finally {
    client.release();
  }
  res.status(201).json({ ok: true });
});

router.get('/me', authRequired, (req, res) => {
  res.json({
    user: {
      id: req.user.id,
      username: req.user.username,
      ho_ten: req.user.ho_ten,
      role: req.user.role,
      nganh: req.user.nganh,
      ma_sv: req.user.ma_sv,
      student_id: req.user.student_id,
    },
  });
});

module.exports = router;
