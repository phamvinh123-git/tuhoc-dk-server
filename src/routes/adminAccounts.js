const express = require('express');
const bcrypt = require('bcryptjs');
const { pool } = require('../db');
const { authRequired, requireRole } = require('../middleware');

const router = express.Router();
// Chỉ áp middleware cho đúng các route /admin/... của router này — KHÔNG dùng router.use() không path,
// vì router này được mount ở '/api' dùng chung với các router khác: nếu không giới hạn path, middleware
// sẽ chặn nhầm mọi request /api/* nào lọt tới router này (vd: /api/health) do Express match theo thứ tự mount.
router.use('/admin', authRequired, requireRole('ADMIN'));

router.get('/admin/accounts', async (req, res) => {
  const rows = (await pool.query(
    `SELECT u.username, u.ho_ten, u.role, u.dang_hoat_dong, n.ten_nganh,
            s.ma_sv, s.to_lop,
            CASE WHEN u.role='SINH_VIEN' THEN 'student' ELSE 'staff' END AS kind
     FROM users u
     LEFT JOIN nganh n ON n.id = u.nganh_id
     LEFT JOIN students s ON s.user_id = u.id
     ORDER BY u.role, u.username`
  )).rows;
  res.json({
    accounts: rows.map(r => ({
      username: r.username, hoTen: r.ho_ten, role: r.role, nganh: r.ten_nganh || null,
      active: r.dang_hoat_dong, kind: r.kind, ma_sv: r.ma_sv || null, to_lop: r.to_lop || null,
    })),
  });
});

router.post('/admin/accounts', async (req, res) => {
  const { role, hoTen, username: rawUsername, password, nganh: tenNganh, ma_sv: rawMaSv, to_lop } = req.body;
  const username = String(rawUsername || '').trim().toLowerCase();
  if (!hoTen || !String(hoTen).trim()) return res.status(400).json({ error: 'Vui lòng nhập họ tên' });
  if (!username) return res.status(400).json({ error: 'Vui lòng nhập tên đăng nhập' });
  if (!password || password.length < 4) return res.status(400).json({ error: 'Mật khẩu cần tối thiểu 4 ký tự' });
  if (!['ADMIN', 'TRUONG_BO_MON', 'CO_VAN', 'QUAN_LY', 'SINH_VIEN'].includes(role)) return res.status(400).json({ error: 'Vai trò không hợp lệ' });

  const dupUser = (await pool.query('SELECT 1 FROM users WHERE lower(username)=$1', [username])).rows[0];
  if (dupUser) return res.status(409).json({ error: 'Tên đăng nhập đã tồn tại — hãy chọn tên khác' });

  let nganhId = null;
  if (role !== 'ADMIN') {
    const nganh = (await pool.query('SELECT id FROM nganh WHERE ten_nganh=$1', [tenNganh])).rows[0];
    if (!nganh) return res.status(400).json({ error: 'Ngành không hợp lệ' });
    nganhId = nganh.id;
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const hash = await bcrypt.hash(password, 10);
    if (role === 'SINH_VIEN') {
      const ma_sv = String(rawMaSv || '').trim().toUpperCase();
      const toLop = String(to_lop || '').trim();
      if (!ma_sv || !toLop) { await client.query('ROLLBACK'); return res.status(400).json({ error: 'Vui lòng nhập Mã SV và Tổ/Lớp' }); }
      const dupMaSv = (await client.query('SELECT 1 FROM students WHERE upper(ma_sv)=$1', [ma_sv])).rows[0];
      if (dupMaSv) { await client.query('ROLLBACK'); return res.status(409).json({ error: 'Mã SV này đã tồn tại' }); }
      const uRes = await client.query(
        `INSERT INTO users (username, password_hash, ho_ten, role, nganh_id, dang_hoat_dong) VALUES ($1,$2,$3,'SINH_VIEN',$4,TRUE) RETURNING id`,
        [username, hash, String(hoTen).trim(), nganhId]
      );
      await client.query(`INSERT INTO students (ma_sv, ten_sv, to_lop, nganh_id, user_id) VALUES ($1,$2,$3,$4,$5)`,
        [ma_sv, String(hoTen).trim(), toLop, nganhId, uRes.rows[0].id]);
    } else {
      await client.query(
        `INSERT INTO users (username, password_hash, ho_ten, role, nganh_id, dang_hoat_dong) VALUES ($1,$2,$3,$4,$5,TRUE)`,
        [username, hash, String(hoTen).trim(), role, nganhId]
      );
    }
    await client.query('COMMIT');
  } catch (e) {
    await client.query('ROLLBACK');
    if (e.code === '23505') return res.status(409).json({ error: 'Tên đăng nhập hoặc Mã SV đã tồn tại' });
    throw e;
  } finally {
    client.release();
  }
  res.status(201).json({ ok: true });
});

router.put('/admin/accounts/:username', async (req, res) => {
  const username = String(req.params.username || '').trim().toLowerCase();
  const { hoTen, nganh: tenNganh, password } = req.body;
  if (!hoTen || !String(hoTen).trim()) return res.status(400).json({ error: 'Vui lòng nhập họ tên' });
  if (password && password.length < 4) return res.status(400).json({ error: 'Mật khẩu mới cần tối thiểu 4 ký tự' });

  const u = (await pool.query('SELECT id, role FROM users WHERE lower(username)=$1', [username])).rows[0];
  if (!u) return res.status(404).json({ error: 'Không tìm thấy tài khoản' });

  let nganhId;
  if (u.role !== 'ADMIN' && tenNganh) {
    const nganh = (await pool.query('SELECT id FROM nganh WHERE ten_nganh=$1', [tenNganh])).rows[0];
    if (!nganh) return res.status(400).json({ error: 'Ngành không hợp lệ' });
    nganhId = nganh.id;
  }

  const sets = ['ho_ten=$1'];
  const params = [String(hoTen).trim()];
  if (nganhId !== undefined) { sets.push(`nganh_id=$${params.length + 1}`); params.push(nganhId); }
  if (password) { sets.push(`password_hash=$${params.length + 1}`); params.push(await bcrypt.hash(password, 10)); }
  params.push(u.id);
  await pool.query(`UPDATE users SET ${sets.join(', ')} WHERE id=$${params.length}`, params);

  if (u.role === 'SINH_VIEN') {
    const studentSets = ['ten_sv=$1'];
    const studentParams = [String(hoTen).trim()];
    if (nganhId !== undefined) { studentSets.push(`nganh_id=$${studentParams.length + 1}`); studentParams.push(nganhId); }
    studentParams.push(u.id);
    await pool.query(`UPDATE students SET ${studentSets.join(', ')} WHERE user_id=$${studentParams.length}`, studentParams);
  }
  res.json({ ok: true });
});

router.post('/admin/accounts/:username/toggle-active', async (req, res) => {
  const username = String(req.params.username || '').trim().toLowerCase();
  if (req.user.username.toLowerCase() === username) return res.status(400).json({ error: 'Không thể tự khóa tài khoản đang đăng nhập' });
  const u = (await pool.query('SELECT id, role, dang_hoat_dong FROM users WHERE lower(username)=$1', [username])).rows[0];
  if (!u) return res.status(404).json({ error: 'Không tìm thấy tài khoản' });
  if (u.role === 'ADMIN' && u.dang_hoat_dong) {
    const activeAdmins = (await pool.query(`SELECT count(*)::int AS c FROM users WHERE role='ADMIN' AND dang_hoat_dong=TRUE`)).rows[0].c;
    if (activeAdmins <= 1) return res.status(400).json({ error: 'Không thể khóa Quản trị viên cuối cùng còn hoạt động' });
  }
  await pool.query('UPDATE users SET dang_hoat_dong=NOT dang_hoat_dong WHERE id=$1', [u.id]);
  res.json({ ok: true });
});

router.delete('/admin/accounts/:username', async (req, res) => {
  const username = String(req.params.username || '').trim().toLowerCase();
  if (req.user.username.toLowerCase() === username) return res.status(400).json({ error: 'Không thể tự xóa tài khoản đang đăng nhập' });
  const u = (await pool.query('SELECT id, role FROM users WHERE lower(username)=$1', [username])).rows[0];
  if (!u) return res.status(404).json({ error: 'Không tìm thấy tài khoản' });
  if (u.role === 'ADMIN') {
    const admins = (await pool.query(`SELECT count(*)::int AS c FROM users WHERE role='ADMIN'`)).rows[0].c;
    if (admins <= 1) return res.status(400).json({ error: 'Không thể xóa Quản trị viên cuối cùng' });
  }
  if (u.role === 'SINH_VIEN') {
    const student = (await pool.query('SELECT id FROM students WHERE user_id=$1', [u.id])).rows[0];
    if (student) {
      const hasReg = (await pool.query('SELECT 1 FROM registrations WHERE student_id=$1 LIMIT 1', [student.id])).rows[0];
      if (hasReg) return res.status(400).json({ error: 'Không thể xóa: sinh viên còn lịch đã đăng ký — hãy hủy đăng ký trước.' });
    }
  }
  await pool.query('DELETE FROM users WHERE id=$1', [u.id]);
  res.json({ ok: true });
});

module.exports = router;
