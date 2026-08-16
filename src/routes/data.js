const express = require('express');
const { pool } = require('../db');
const { authRequired, resolveNganhAccess } = require('../middleware');
const { getSlotMaps } = require('../slots');
const { allowedDateRange } = require('../dateUtil');

const router = express.Router();

router.get('/nganh', authRequired, async (req, res) => {
  const rows = (await pool.query('SELECT id, ten_nganh FROM nganh WHERE dang_hoat_dong=TRUE ORDER BY id')).rows;
  res.json({ nganh: rows.map(r => r.ten_nganh) });
});

// "Hydrate" toàn bộ dữ liệu của 1 ngành trong khoảng ngày được phép điều hướng — trả về đúng hình dạng
// (shape) mà phần render phía client đang mong đợi, để giảm tối đa thay đổi ở tầng giao diện.
router.get('/bootstrap', authRequired, async (req, res) => {
  const tenNganh = String(req.query.nganh || '');
  const nganh = await resolveNganhAccess(req, res, tenNganh);
  if (!nganh) return;

  const { dbIdToOld } = await getSlotMaps();
  const { fromISO, toISO } = allowedDateRange();

  const entries = (await pool.query(
    `SELECT id, ngay_hoc, time_slot_id, subject, ma_mon, noi_dung, phong, giang_vien, suc_chua, khoa_thu_cong
     FROM schedule_entries
     WHERE nganh_id=$1 AND ngay_hoc BETWEEN $2 AND $3`,
    [nganh.id, fromISO, toISO]
  )).rows;

  const entryIds = entries.map(e => e.id);
  let regsByEntry = {};
  if (entryIds.length) {
    const regs = (await pool.query(
      `SELECT r.schedule_entry_id, s.id AS student_id, s.ma_sv, s.ten_sv, s.to_lop
       FROM registrations r JOIN students s ON s.id = r.student_id
       WHERE r.schedule_entry_id = ANY($1::bigint[])
       ORDER BY r.thoi_gian_dang_ky`,
      [entryIds]
    )).rows;
    regs.forEach(r => {
      (regsByEntry[r.schedule_entry_id] = regsByEntry[r.schedule_entry_id] || []).push({
        id: r.student_id, ma_sv: r.ma_sv, ten_sv: r.ten_sv, to_lop: r.to_lop,
      });
    });
  }

  const schedule = {};
  entries.forEach(e => {
    const dateISO = e.ngay_hoc.toISOString().slice(0, 10);
    const oldSlotId = dbIdToOld[e.time_slot_id];
    const key = `${dateISO}_${oldSlotId}`;
    schedule[key] = {
      id: e.id,
      subject: e.subject,
      code: e.ma_mon || '',
      content: e.noi_dung || '',
      room: e.phong || '',
      teacher: e.giang_vien || '',
      capacity: e.suc_chua,
      registered: regsByEntry[e.id] || [],
      lockedManual: e.khoa_thu_cong,
      ngayHoc: dateISO,
    };
  });

  const eqRows = (await pool.query(
    `SELECT e.id, e.ten_dung_cu, e.tong_so_luong, e.tinh_trang,
            COALESCE((SELECT sum(ea.so_luong) FROM equipment_assignments ea WHERE ea.equipment_id = e.id), 0)::int AS giao
     FROM equipment e WHERE e.nganh_id=$1 ORDER BY e.id`,
    [nganh.id]
  )).rows;
  const equipment = eqRows.map(e => ({ id: e.id, ten: e.ten_dung_cu, tong: e.tong_so_luong, giao: e.giao, tinhTrang: e.tinh_trang || '' }));

  let equipmentAssignments = [];
  if (entryIds.length) {
    const eaRows = (await pool.query(
      `SELECT ea.id, eq.ten_dung_cu AS ten, ea.so_luong, ea.ngay_giao,
              se.ngay_hoc, se.time_slot_id, se.subject,
              st.ma_sv, st.ten_sv, st.to_lop
       FROM equipment_assignments ea
       JOIN equipment eq ON eq.id = ea.equipment_id
       JOIN schedule_entries se ON se.id = ea.schedule_entry_id
       JOIN students st ON st.id = ea.student_id
       WHERE ea.schedule_entry_id = ANY($1::bigint[])
       ORDER BY ea.id DESC`,
      [entryIds]
    )).rows;
    equipmentAssignments = eaRows.map(a => {
      const dateISO = a.ngay_hoc.toISOString().slice(0, 10);
      const oldSlotId = dbIdToOld[a.time_slot_id];
      return {
        id: a.id, ten: a.ten,
        dateISO, slotId: oldSlotId, subject: a.subject,
        ma_sv: a.ma_sv, ten_sv: a.ten_sv, to_lop: a.to_lop,
        soLuong: a.so_luong, ngayGiao: a.ngay_giao.toISOString().slice(0, 10),
      };
    });
  }

  const students = (await pool.query(
    `SELECT id, ma_sv, ten_sv, to_lop FROM students WHERE nganh_id=$1 ORDER BY ma_sv`,
    [nganh.id]
  )).rows;

  res.json({ nganh: nganh.ten_nganh, schedule, equipment, equipmentAssignments, students });
});

module.exports = router;
