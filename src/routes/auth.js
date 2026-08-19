const express = require('express');
const bcrypt = require('bcryptjs');
const { pool } = require('../db');
const { signToken } = require('../auth');
const { authRequired } = require('../middleware');
const { logAction } = require('../audit');

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
  await logAction({ id: row.id, username: row.username, ho_ten: row.ho_ten, role: row.role }, 'LOGIN', `${row.username} đã đăng nhập`);
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
  await logAction({ username, ho_ten: ten_sv, role: 'SINH_VIEN' }, 'SELF_REGISTER', `Sinh viên ${ma_sv} (${ten_sv}) tự đăng ký tài khoản ${username}`);
  res.status(201).json({ ok: true });
});

// Cho phép MỌI tài khoản đang đăng nhập (sinh viên lẫn cán bộ) tự đổi mật khẩu của chính mình — phải nhập
// đúng mật khẩu hiện tại để xác nhận, không cần quyền Quản trị viên.
router.put('/password', authRequired, async (req, res) => {
  const matKhauCu = String(req.body.matKhauCu || '');
  const matKhauMoi = String(req.body.matKhauMoi || '');
  const matKhauMoi2 = String(req.body.matKhauMoi2 || '');

  if (!matKhauCu || !matKhauMoi) return res.status(400).json({ error: 'Vui lòng nhập đầy đủ mật khẩu hiện tại và mật khẩu mới' });
  if (matKhauMoi !== matKhauMoi2) return res.status(400).json({ error: 'Mật khẩu mới nhập lại không khớp' });
  if (matKhauMoi.length < 4) return res.status(400).json({ error: 'Mật khẩu mới cần tối thiểu 4 ký tự' });

  const row = (await pool.query('SELECT password_hash FROM users WHERE id=$1', [req.user.id])).rows[0];
  if (!row) return res.status(404).json({ error: 'Tài khoản không tồn tại' });
  const ok = await bcrypt.compare(matKhauCu, row.password_hash);
  if (!ok) return res.status(401).json({ error: 'Mật khẩu hiện tại không đúng' });
  if (matKhauCu === matKhauMoi) return res.status(400).json({ error: 'Mật khẩu mới phải khác mật khẩu hiện tại' });

  const hash = await bcrypt.hash(matKhauMoi, 10);
  await pool.query('UPDATE users SET password_hash=$1 WHERE id=$2', [hash, req.user.id]);
  await logAction(req.user, 'CHANGE_PASSWORD', `${req.user.username} đã tự đổi mật khẩu`);
  res.json({ ok: true });
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
