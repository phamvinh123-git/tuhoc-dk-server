// Khớp chính xác logic getMonday()/getWeekDates() phía frontend, để khoảng ngày server trả về
// (giới hạn điều hướng tuần: -8 tuần .. +52 tuần) luôn đồng bộ với những gì giao diện cho phép xem.
const WEEK_OFFSET_MIN = -8;
const WEEK_OFFSET_MAX = 52;

function getMonday(base) {
  const d = new Date(base);
  const day = d.getDay();
  const diff = d.getDate() - day + (day === 0 ? -6 : 1);
  return new Date(d.getFullYear(), d.getMonth(), diff);
}
function isoDate(d) {
  return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
}

function allowedDateRange() {
  const monday = getMonday(new Date());
  const from = new Date(monday.getFullYear(), monday.getMonth(), monday.getDate() + WEEK_OFFSET_MIN * 7);
  const to = new Date(monday.getFullYear(), monday.getMonth(), monday.getDate() + WEEK_OFFSET_MAX * 7 + 6);
  return { fromISO: isoDate(from), toISO: isoDate(to) };
}

// ==== Khóa đăng ký tự học từ 17:00 (giờ Việt Nam) của ngày HÔM TRƯỚC buổi học ====
// Tính hoàn toàn bằng mốc UTC epoch (không dùng giờ hệ điều hành server) để không phụ thuộc server chạy
// múi giờ nào — Việt Nam là UTC+7 quanh năm (không có giờ mùa hè) nên phép quy đổi này luôn đúng.
const REG_CUTOFF_HOUR_ICT = 17;
const ICT_OFFSET_HOURS = 7;

// ngayHoc: Date (cột DATE Postgres — driver trả về mốc UTC 00:00 đúng ngày đã lưu) hoặc chuỗi 'YYYY-MM-DD'.
// Trả về mốc thời gian (epoch ms, UTC) mà từ đó trở đi buổi học ngày `ngayHoc` bị khóa đăng ký.
function registrationCutoffMs(ngayHoc) {
  let y, m, d;
  if (ngayHoc instanceof Date) {
    y = ngayHoc.getUTCFullYear(); m = ngayHoc.getUTCMonth(); d = ngayHoc.getUTCDate();
  } else {
    const [yy, mm, dd] = String(ngayHoc).split('-').map(Number);
    y = yy; m = mm - 1; d = dd;
  }
  // 17:00 giờ VN = 10:00 UTC cùng ngày => mốc khóa = 10:00 UTC của (ngày buổi học - 1 ngày).
  return Date.UTC(y, m, d - 1, REG_CUTOFF_HOUR_ICT - ICT_OFFSET_HOURS, 0, 0, 0);
}
function isRegistrationClosed(ngayHoc) {
  return Date.now() >= registrationCutoffMs(ngayHoc);
}

module.exports = {
  allowedDateRange, isoDate, getMonday, WEEK_OFFSET_MIN, WEEK_OFFSET_MAX,
  isRegistrationClosed, registrationCutoffMs, REG_CUTOFF_HOUR_ICT,
};
