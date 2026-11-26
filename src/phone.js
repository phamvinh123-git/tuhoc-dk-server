// Chuẩn hoá số điện thoại Việt Nam về dạng 10 số bắt đầu bằng 0 (vd "975911323", "+84 975 911 323",
// "84975911323" -> "0975911323"). Trả về null nếu không giống số điện thoại di động hợp lệ.
function normalizePhone(raw) {
  if (raw === null || raw === undefined) return null;
  let s = String(raw).trim().replace(/\.0+$/, '').replace(/\D/g, '');
  if (s.startsWith('84') && s.length === 11) s = '0' + s.slice(2);
  if (s.length === 9) s = '0' + s;
  return /^0\d{9}$/.test(s) ? s : null;
}

module.exports = { normalizePhone };
