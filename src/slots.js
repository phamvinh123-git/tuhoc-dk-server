// Khung giờ (time_slots) cố định — ánh xạ 2 chiều giữa id thật trong DB và "slotId cũ" (1..6) mà
// giao diện frontend đã dùng từ trước (SLOTS = [{id:1,...}, ..., {id:6,...}]), để không phải sửa
// lại toàn bộ phần render lịch phía client.
const { pool } = require('./db');

const ORDER = [['sang', 1], ['sang', 2], ['sang', 3], ['chieu', 1], ['chieu', 2], ['chieu', 3]];

let cache = null;

async function getSlotMaps() {
  if (cache) return cache;
  const rows = (await pool.query('SELECT id, buoi, thu_tu_slot FROM time_slots')).rows;
  const oldToDbId = {};
  const dbIdToOld = {};
  ORDER.forEach((o, idx) => {
    const row = rows.find(r => r.buoi === o[0] && r.thu_tu_slot === o[1]);
    if (!row) return;
    oldToDbId[idx + 1] = row.id;
    dbIdToOld[row.id] = idx + 1;
  });
  cache = { oldToDbId, dbIdToOld };
  return cache;
}

module.exports = { getSlotMaps };
