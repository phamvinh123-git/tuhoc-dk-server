// Ghi nhật ký truy vết (audit log) — dùng ở mọi route làm thay đổi dữ liệu, để Quản trị viên xem lại
// "ai đã làm hành động gì". Cố tình KHÔNG BAO GIỜ throw lỗi ra ngoài: nếu ghi log thất bại (vd DB tạm
// trục trặc), hành động chính của người dùng vẫn phải thành công bình thường — chỉ log lỗi ra console.
const { pool } = require('./db');

const ACTIONS = {
  LOGIN: 'Đăng nhập',
  SELF_REGISTER: 'Tự đăng ký tài khoản sinh viên',
  CHANGE_PASSWORD: 'Tự đổi mật khẩu',
  CREATE_ACCOUNT: 'Cấp tài khoản',
  UPDATE_ACCOUNT: 'Sửa tài khoản',
  TOGGLE_ACCOUNT: 'Khóa/Mở khóa tài khoản',
  DELETE_ACCOUNT: 'Xóa tài khoản',
  CREATE_SCHEDULE: 'Tạo buổi học',
  BULK_CREATE_SCHEDULE: 'Tạo lịch hàng loạt',
  UPDATE_SCHEDULE: 'Sửa buổi học',
  DELETE_SCHEDULE: 'Xóa buổi học',
  TOGGLE_LOCK_SLOT: 'Khóa/Mở khóa slot',
  REGISTER: 'Đăng ký buổi học',
  CANCEL_REGISTRATION: 'Hủy đăng ký',
  CREATE_EQUIPMENT: 'Thêm dụng cụ',
  ASSIGN_EQUIPMENT: 'Giao dụng cụ',
  BULK_ASSIGN_EQUIPMENT: 'Giao dụng cụ hàng loạt',
  REMOVE_EQUIPMENT_ASSIGNMENT: 'Thu hồi dụng cụ',
};

// actor: {id, username, ho_ten, role} — thường là req.user; với route /auth/login thì req.user chưa có
// (đó chính là request đang đăng nhập), nên truyền trực tiếp actor lấy từ hàng user vừa xác thực xong.
async function logAction(actor, action, moTa) {
  try {
    await pool.query(
      `INSERT INTO audit_logs (actor_user_id, actor_username, actor_ho_ten, actor_role, action, mo_ta)
       VALUES ($1,$2,$3,$4,$5,$6)`,
      [actor?.id || null, actor?.username || 'unknown', actor?.ho_ten || null, actor?.role || null, action, moTa]
    );
  } catch (e) {
    console.error('[audit] Lỗi ghi nhật ký:', e.message);
  }
}

module.exports = { logAction, ACTIONS };
