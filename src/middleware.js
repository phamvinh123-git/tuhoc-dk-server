const { verifyToken } = require('./auth');
const { pool } = require('./db');

const ROLES_XEM_MOI_NGANH = ['ADMIN', 'TRUONG_BO_MON', 'CO_VAN', 'QUAN_LY'];
const ROLES_SUA_LICH = ['ADMIN', 'TRUONG_BO_MON', 'QUAN_LY'];
const ROLES_QUAN_LY_DUNG_CU = ['ADMIN', 'QUAN_LY'];

async function authRequired(req, res, next) {
  try {
    const header = req.headers.authorization || '';
    const token = header.startsWith('Bearer ') ? header.slice(7) : null;
    if (!token) return res.status(401).json({ error: 'Chưa đăng nhập' });
    const payload = verifyToken(token);
    const r = await pool.query(
      `SELECT u.id, u.username, u.ho_ten, u.role, u.dang_hoat_dong, u.nganh_id, n.ten_nganh,
              s.id AS student_id, s.ma_sv, s.to_lop
       FROM users u
       LEFT JOIN nganh n ON n.id = u.nganh_id
       LEFT JOIN students s ON s.user_id = u.id
       WHERE u.id = $1`,
      [payload.uid]
    );
    const row = r.rows[0];
    if (!row) return res.status(401).json({ error: 'Tài khoản không tồn tại' });
    if (!row.dang_hoat_dong) return res.status(403).json({ error: 'Tài khoản đã bị khóa — liên hệ Quản trị viên để được mở lại.' });
    req.user = {
      id: row.id,
      username: row.username,
      ho_ten: row.ho_ten,
      role: row.role,
      nganh_id: row.nganh_id,
      nganh: row.ten_nganh || null,
      student_id: row.student_id || null,
      ma_sv: row.ma_sv || null,
      to_lop: row.to_lop || null,
    };
    next();
  } catch (e) {
    return res.status(401).json({ error: 'Phiên đăng nhập không hợp lệ hoặc đã hết hạn' });
  }
}

function requireRole(...roles) {
  return (req, res, next) => {
    if (!roles.includes(req.user.role)) return res.status(403).json({ error: 'Bạn không có quyền thực hiện thao tác này' });
    next();
  };
}

// Xác định user có được xem/thao tác trên `tenNganh` không, và trả về nganh_id tương ứng (dùng chung cho mọi route
// nhận tham số ngành từ client — tự tra DB để tránh tin tưởng id gửi lên mà không kiểm tra).
async function resolveNganhAccess(req, res, tenNganh) {
  const r = await pool.query('SELECT id, ten_nganh FROM nganh WHERE ten_nganh = $1', [tenNganh]);
  const nganh = r.rows[0];
  if (!nganh) { res.status(400).json({ error: 'Ngành không hợp lệ' }); return null; }
  if (!ROLES_XEM_MOI_NGANH.includes(req.user.role)) {
    // SINH_VIEN: chỉ đúng ngành của mình
    if (req.user.nganh !== tenNganh) { res.status(403).json({ error: 'Bạn không có quyền xem ngành này' }); return null; }
  }
  return nganh;
}

module.exports = { authRequired, requireRole, resolveNganhAccess, ROLES_XEM_MOI_NGANH, ROLES_SUA_LICH, ROLES_QUAN_LY_DUNG_CU };
