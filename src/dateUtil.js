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

// Mở rộng hạn đăng ký CHỈ CHO ĐÚNG NGÀY HẠN ĐÓ RƠI VÀO HÔM NAY (giờ VN) — dùng khi cần nới hạn đăng ký
// tạm thời trong 1 ngày cụ thể (vd nới từ 17:00 lên 21:00). Tự động hết hiệu lực khi sang ngày khác vì so
// sánh với "hôm nay" mỗi lần tính, không cần sửa code/deploy lại để revert. Đổi/xóa 2 dòng dưới đây khi hết
// cần nới hạn (ví dụ xóa REG_CUTOFF_EXTENDED_DATE_ISO hoặc để nó là ngày đã qua để quay lại 17:00 như cũ).
const REG_CUTOFF_EXTENDED_DATE_ISO = '2026-10-27'; // ngày (giờ VN) được nới hạn đăng ký
const REG_CUTOFF_EXTENDED_HOUR_ICT = 21; // giờ nới hạn tới, chỉ áp dụng cho ngày ở trên

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
  // Hạn đăng ký bình thường rơi vào 17:00 (giờ VN) của ngày hôm trước buổi học — nếu đúng ngày hôm trước đó
  // là ngày đang được nới hạn (REG_CUTOFF_EXTENDED_DATE_ISO) thì dùng giờ nới hạn thay vì 17:00.
  const cutoffDay = new Date(Date.UTC(y, m, d - 1));
  const cutoffDayISO = cutoffDay.getUTCFullYear() + '-' + String(cutoffDay.getUTCMonth() + 1).padStart(2, '0') + '-' + String(cutoffDay.getUTCDate()).padStart(2, '0');
  const cutoffHourIct = cutoffDayISO === REG_CUTOFF_EXTENDED_DATE_ISO ? REG_CUTOFF_EXTENDED_HOUR_ICT : REG_CUTOFF_HOUR_ICT;
  // 17:00 giờ VN = 10:00 UTC cùng ngày => mốc khóa = (17:00 hoặc giờ nới hạn) UTC+7 của (ngày buổi học - 1 ngày).
  return Date.UTC(y, m, d - 1, cutoffHourIct - ICT_OFFSET_HOURS, 0, 0, 0);
}
function isRegistrationClosed(ngayHoc) {
  return Date.now() >= registrationCutoffMs(ngayHoc);
}

// ==== Chặn TẠO buổi học mới cho ngày đã qua (giờ Việt Nam) ====
// Dùng để chặn Trưởng bộ môn / Quản lý học tập tạo lịch học lùi về ngày trong quá khứ — Admin vẫn tạo được
// bình thường (giống các quyền ghi đè khác Admin đang có sẵn, vd đăng ký thay khi đã quá hạn đăng ký).
// So sánh dạng chuỗi 'YYYY-MM-DD' là đủ chính xác vì định dạng này sắp xếp y hệt thứ tự thời gian thật.
function todayISOInICT() {
  const nowIct = new Date(Date.now() + ICT_OFFSET_HOURS * 3600 * 1000);
  return nowIct.getUTCFullYear() + '-' + String(nowIct.getUTCMonth() + 1).padStart(2, '0') + '-' + String(nowIct.getUTCDate()).padStart(2, '0');
}
function isPastDate(dateISO) {
  return String(dateISO) < todayISOInICT();
}

module.exports = {
  allowedDateRange, isoDate, getMonday, WEEK_OFFSET_MIN, WEEK_OFFSET_MAX,
  isRegistrationClosed, registrationCutoffMs, REG_CUTOFF_HOUR_ICT,
  isPastDate, todayISOInICT,
};
