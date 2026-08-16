require('dotenv').config();
const path = require('path');
const express = require('express');
const cors = require('cors');

const authRoutes = require('./routes/auth');
const dataRoutes = require('./routes/data');
const scheduleRoutes = require('./routes/schedule');
const registrationRoutes = require('./routes/registrations');
const equipmentRoutes = require('./routes/equipment');
const adminAccountRoutes = require('./routes/adminAccounts');

const app = express();
app.use(cors());
app.use(express.json());

app.get('/api/health', (req, res) => res.json({ ok: true }));

app.use('/api/auth', authRoutes);
app.use('/api', dataRoutes);
app.use('/api', scheduleRoutes);
app.use('/api', registrationRoutes);
app.use('/api', equipmentRoutes);
app.use('/api', adminAccountRoutes);

// Phục vụ frontend tĩnh (build sẵn trong public/) — 1 dịch vụ Node duy nhất phục vụ cả API lẫn giao diện,
// đơn giản hoá triển khai (không cần cấu hình 2 service riêng).
const publicDir = path.join(__dirname, '..', 'public');
app.use(express.static(publicDir));
app.get('/{*splat}', (req, res, next) => {
  if (req.path.startsWith('/api/')) return next();
  res.sendFile(path.join(publicDir, 'index.html'));
});

// Error handler chung — Express 5 tự động forward lỗi từ async handler bị reject vào đây.
app.use((err, req, res, next) => {
  console.error(err);
  res.status(500).json({ error: err.message || 'Lỗi máy chủ, vui lòng thử lại sau' });
});

const PORT = process.env.PORT || 3000;
if (require.main === module) {
  app.listen(PORT, () => console.log(`[server] Đang chạy tại http://localhost:${PORT}`));
}

module.exports = app;
