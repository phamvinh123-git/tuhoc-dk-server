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

module.exports = { allowedDateRange, isoDate, getMonday, WEEK_OFFSET_MIN, WEEK_OFFSET_MAX };
