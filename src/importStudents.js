// Nhập (hoặc cập nhật) danh sách sinh viên hàng loạt từ file Excel (.xlsx).
//
// Cách dùng (chạy trong thư mục gốc repo, đã có file .env):
//   npm run import-students -- duong-dan/file.xlsx --dry-run   # chạy thử, KHÔNG ghi gì vào DB
//   npm run import-students -- duong-dan/file.xlsx             # nhập thật
//
// File cần có 1 dòng tiêu đề chứa các cột: "Mã sinh viên", "Họ và tên", "Tổ", "Lớp", "Điện thoại",
// "Ngành đào tạo" (thứ tự cột tuỳ ý). Các cột khác bị bỏ qua — KHÔNG lưu CCCD, ngày sinh, nơi sinh...
//
// - Sinh viên CHƯA có: tạo tài khoản, tên đăng nhập = Mã SV (viết thường), mật khẩu ban đầu 123456,
//   bắt buộc đổi mật khẩu ở lần đăng nhập đầu tiên. Đăng nhập được bằng Mã SV hoặc Số điện thoại.
// - Sinh viên ĐÃ có (trùng Mã SV): chỉ cập nhật Tổ/Lớp, Ngành, Số điện thoại — KHÔNG đổi mật khẩu, họ tên.
// - Tất cả chạy trong 1 transaction: lỗi giữa chừng thì không ghi gì cả.
const path = require('path');
const ExcelJS = require('exceljs');
const bcrypt = require('bcryptjs');
const { pool } = require('./db');
const { normalizePhone } = require('./phone');
const { logAction } = require('./audit');

const MAT_KHAU_MAC_DINH = '123456';

// Tên ngành trong file Excel (viết thường, gộp khoảng trắng) -> tên ngành trong hệ thống.
const NGANH_MAP = {
  'y khoa': 'Y Khoa',
  'bác sĩ y khoa': 'Y Khoa',
  'bác sĩ y khoa chương trình đổi mới': 'Y Khoa',
  'bsykđm': 'Y Khoa',
  'điều dưỡng': 'Điều dưỡng',
  'cử nhân điều dưỡng': 'Điều dưỡng',
  'cnđd': 'Điều dưỡng',
  'kỹ thuật phục hồi chức năng': 'Phục hồi chức năng',
  'phục hồi chức năng': 'Phục hồi chức năng',
  'cnktphcn': 'Phục hồi chức năng',
  'kỹ thuật xét nghiệm y học': 'Kỹ thuật xét nghiệm',
  'kỹ thuật xét nghiệm': 'Kỹ thuật xét nghiệm',
  'cnxnyh': 'Kỹ thuật xét nghiệm',
  'kỹ thuật hình ảnh y học': 'Chẩn đoán hình ảnh',
  'chẩn đoán hình ảnh': 'Chẩn đoán hình ảnh',
};

const COLS = {
  ma_sv: ['mã sinh viên', 'mã sv', 'masv'],
  ho_ten: ['họ và tên', 'họ tên'],
  to: ['tổ'],
  lop: ['lớp'],
  sdt: ['điện thoại', 'số điện thoại', 'sđt', 'sdt'],
  nganh: ['ngành đào tạo', 'ngành'],
};

const norm = (v) => String(v ?? '').normalize('NFC').replace(/\s+/g, ' ').trim();
const key = (v) => norm(v).toLowerCase();

function cellText(cell) {
  const v = cell.value;
  if (v === null || v === undefined) return '';
  if (typeof v === 'object') {
    if (v.richText) return v.richText.map((t) => t.text).join('');
    if (v.text !== undefined) return String(v.text);
    if (v.result !== undefined) return String(v.result);
  }
  return String(v);
}

// "HOÀNG VŨ" -> "Hoàng Vũ"; tên đã viết hoa/thường bình thường thì giữ nguyên.
function fixName(name) {
  if (name !== name.toLocaleUpperCase('vi')) return name;
  return name.toLocaleLowerCase('vi').replace(/(^|\s)(\S)/g, (m, sp, ch) => sp + ch.toLocaleUpperCase('vi'));
}

async function readRows(file) {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.readFile(file);
  const ws = wb.worksheets[0];
  let headerRow = null;
  const idx = {};
  ws.eachRow((row, n) => {
    if (headerRow) return;
    const found = {};
    row.eachCell((cell, c) => {
      const k = key(cellText(cell));
      for (const [field, names] of Object.entries(COLS)) if (names.includes(k) && !found[field]) found[field] = c;
    });
    if (found.ma_sv && found.ho_ten) { headerRow = n; Object.assign(idx, found); }
  });
  if (!headerRow) throw new Error('Không tìm thấy dòng tiêu đề có cột "Mã sinh viên" và "Họ và tên"');
  const missing = Object.keys(COLS).filter((f) => !idx[f]);
  if (missing.length) console.warn('[import] Cảnh báo — thiếu cột:', missing.join(', '));

  const rows = [];
  ws.eachRow((row, n) => {
    if (n <= headerRow) return;
    const get = (f) => (idx[f] ? norm(cellText(row.getCell(idx[f]))) : '');
    const ma_sv = get('ma_sv').toUpperCase();
    if (!ma_sv) return;
    rows.push({ dong: n, ma_sv, ho_ten: fixName(get('ho_ten')), to: get('to'), lop: get('lop'), sdtRaw: get('sdt'), nganhRaw: get('nganh') });
  });
  return rows;
}

async function main() {
  const args = process.argv.slice(2);
  const dryRun = args.includes('--dry-run');
  const file = args.find((a) => !a.startsWith('--'));
  if (!file) {
    console.error('Cách dùng: npm run import-students -- <file.xlsx> [--dry-run]');
    process.exit(1);
  }

  const rows = await readRows(path.resolve(file));
  console.log(`[import] Đọc được ${rows.length} dòng sinh viên từ ${path.basename(file)}`);

  const nganhIds = Object.fromEntries((await pool.query('SELECT id, ten_nganh FROM nganh')).rows.map((r) => [r.ten_nganh, r.id]));
  const loi = [];
  const canhBao = [];
  const valid = [];
  const seenMa = new Set();
  const seenSdt = new Map();
  for (const r of rows) {
    const tenNganh = NGANH_MAP[key(r.nganhRaw)];
    if (!tenNganh || !nganhIds[tenNganh]) { loi.push(`Dòng ${r.dong} (${r.ma_sv}): không nhận ra ngành "${r.nganhRaw}"`); continue; }
    if (!r.ho_ten) { loi.push(`Dòng ${r.dong} (${r.ma_sv}): thiếu họ tên`); continue; }
    if (r.ma_sv.length > 20) { loi.push(`Dòng ${r.dong}: Mã SV "${r.ma_sv}" dài quá 20 ký tự`); continue; }
    if (seenMa.has(r.ma_sv)) { loi.push(`Dòng ${r.dong}: Mã SV ${r.ma_sv} bị lặp trong file`); continue; }
    seenMa.add(r.ma_sv);
    let sdt = normalizePhone(r.sdtRaw);
    if (r.sdtRaw && !sdt) canhBao.push(`Dòng ${r.dong} (${r.ma_sv}): SĐT "${r.sdtRaw}" không hợp lệ — bỏ qua SĐT`);
    if (sdt && seenSdt.has(sdt)) {
      canhBao.push(`Dòng ${r.dong} (${r.ma_sv}): SĐT ${sdt} trùng với ${seenSdt.get(sdt)} — bỏ qua SĐT, chỉ đăng nhập được bằng Mã SV`);
      sdt = null;
    }
    if (sdt) seenSdt.set(sdt, r.ma_sv);
    const to_lop = [r.to && `Tổ ${r.to}`, r.lop].filter(Boolean).join(' - ') || null;
    valid.push({ ...r, sdt, to_lop, nganh_id: nganhIds[tenNganh], tenNganh });
  }

  const client = await pool.connect();
  let taoMoi = 0;
  let capNhat = 0;
  try {
    await client.query('BEGIN');
    const hash = await bcrypt.hash(MAT_KHAU_MAC_DINH, 10);
    for (const r of valid) {
      // SĐT đang thuộc về 1 sinh viên KHÁC đã có trong hệ thống -> bỏ SĐT để không có 2 người cùng 1 SĐT đăng nhập.
      if (r.sdt) {
        const owner = (await client.query('SELECT ma_sv FROM students WHERE so_dien_thoai=$1 AND upper(ma_sv)<>$2', [r.sdt, r.ma_sv])).rows[0];
        if (owner) { canhBao.push(`${r.ma_sv}: SĐT ${r.sdt} đã thuộc về ${owner.ma_sv} — bỏ qua SĐT`); r.sdt = null; }
      }
      const existing = (await client.query('SELECT id, user_id FROM students WHERE upper(ma_sv)=$1', [r.ma_sv])).rows[0];
      if (existing) {
        await client.query(
          'UPDATE students SET to_lop=COALESCE($1, to_lop), nganh_id=$2, so_dien_thoai=COALESCE($3, so_dien_thoai) WHERE id=$4',
          [r.to_lop, r.nganh_id, r.sdt, existing.id]
        );
        if (existing.user_id) await client.query('UPDATE users SET nganh_id=$1 WHERE id=$2', [r.nganh_id, existing.user_id]);
        capNhat++;
        continue;
      }
      const username = r.ma_sv.toLowerCase();
      const dupUser = (await client.query('SELECT 1 FROM users WHERE lower(username)=$1', [username])).rows[0];
      if (dupUser) { loi.push(`${r.ma_sv}: tên đăng nhập "${username}" đã được 1 tài khoản khác dùng — bỏ qua`); continue; }
      const u = await client.query(
        `INSERT INTO users (username, password_hash, ho_ten, role, nganh_id, dang_hoat_dong, phai_doi_mat_khau)
         VALUES ($1,$2,$3,'SINH_VIEN',$4,TRUE,TRUE) RETURNING id`,
        [username, hash, r.ho_ten, r.nganh_id]
      );
      await client.query(
        'INSERT INTO students (ma_sv, ten_sv, to_lop, nganh_id, user_id, so_dien_thoai) VALUES ($1,$2,$3,$4,$5,$6)',
        [r.ma_sv, r.ho_ten, r.to_lop, r.nganh_id, u.rows[0].id, r.sdt]
      );
      taoMoi++;
    }
    await client.query(dryRun ? 'ROLLBACK' : 'COMMIT');
  } catch (e) {
    await client.query('ROLLBACK');
    throw e;
  } finally {
    client.release();
  }

  const theoNganh = {};
  for (const r of valid) theoNganh[r.tenNganh] = (theoNganh[r.tenNganh] || 0) + 1;
  console.log('[import] Theo ngành:', theoNganh);
  if (canhBao.length) { console.log(`[import] ${canhBao.length} cảnh báo:`); canhBao.forEach((m) => console.log('  - ' + m)); }
  if (loi.length) { console.log(`[import] ${loi.length} dòng bị bỏ qua:`); loi.forEach((m) => console.log('  - ' + m)); }
  console.log(`[import] ${dryRun ? 'CHẠY THỬ (chưa ghi gì) — sẽ' : 'Đã'} tạo mới ${taoMoi} tài khoản, cập nhật ${capNhat} sinh viên có sẵn.`);
  if (!dryRun && (taoMoi || capNhat)) {
    await logAction({ username: 'he-thong', ho_ten: 'Nhập từ Excel', role: 'ADMIN' }, 'IMPORT_STUDENTS',
      `Nhập sinh viên từ file ${path.basename(file)}: tạo mới ${taoMoi}, cập nhật ${capNhat}`);
  }
  await pool.end();
}

main().catch((e) => { console.error('[import] Lỗi:', e.message); process.exit(1); });
