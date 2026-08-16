# Triển khai Đăng ký Tự học lên public

Thư mục `server/` là ứng dụng Node.js + PostgreSQL đầy đủ (không còn dữ liệu giả lập phía trình duyệt —
mọi thứ đọc/ghi thật qua API, nhiều người dùng cùng lúc sẽ thấy cùng 1 dữ liệu).

## Biến môi trường cần thiết

| Biến | Bắt buộc | Ghi chú |
|---|---|---|
| `DATABASE_URL` | Có | Chuỗi kết nối Postgres, dạng `postgres://user:pass@host:5432/dbname` |
| `JWT_SECRET` | Có | Chuỗi bí mật ký JWT — đặt 1 giá trị ngẫu nhiên dài, giữ kín |
| `PGSSL` | Không | Đặt `require` nếu nhà cung cấp Postgres bắt buộc SSL (Render, Railway...) |
| `PORT` | Không | Mặc định 3000 |

## Cách 1 — Render (khuyến nghị, có sẵn `render.yaml`)

1. Đẩy toàn bộ thư mục `tuhoc-dk/` lên 1 GitHub repo (có thể để riêng `server/` hoặc để cả repo, blueprint đã trỏ `rootDir: server`).
2. Trên Render: **New +** → **Blueprint** → chọn repo vừa đẩy lên. Render tự đọc `server/render.yaml`, tự tạo:
   - 1 Web Service (Node) chạy `npm run release && npm start` (release = tạo schema DB)
   - 1 Postgres database, tự nối `DATABASE_URL` cho Web Service
   - Tự sinh `JWT_SECRET` ngẫu nhiên
3. Đợi build xong — Render cấp cho bạn 1 URL dạng `https://tuhoc-dk.onrender.com`, dùng được ngay, có HTTPS sẵn.

## Cách 2 — Bất kỳ nền tảng nào chạy Docker (Railway, Fly.io, VPS riêng...)

1. Build image từ `server/Dockerfile`.
2. Cấp 1 Postgres (Railway/Fly đều có addon managed Postgres, hoặc tự dựng).
3. Set `DATABASE_URL`, `JWT_SECRET` (và `PGSSL=require` nếu cần) cho container.
4. Chạy container — image tự chạy `migrate` (tạo bảng) rồi khởi động server ở cổng 3000.

## Gieo dữ liệu mẫu (tuỳ chọn — CÂN NHẮC KỸ trước khi bật trên môi trường public)

`npm run seed` (chạy 1 lần, sau khi đã `migrate`) sẽ tạo:
- 13 tài khoản cán bộ mẫu, **mật khẩu chung là `123456`** (riêng `admin` là `admin123`)
- 14 sinh viên mẫu, lịch học/dụng cụ mẫu cho ngành Điều dưỡng

**Cảnh báo bảo mật:** những mật khẩu demo này đã từng xuất hiện công khai trong bản prototype trước đây —
nếu bật seed trên 1 địa chỉ public thật, BẮT BUỘC phải đổi ngay mật khẩu các tài khoản demo (đặc biệt
`admin`/`admin123`) qua màn "Quản lý tài khoản" ngay sau khi deploy xong, hoặc xóa hẳn các tài khoản demo
không dùng tới.

Nếu muốn bắt đầu "sạch" (không có tài khoản demo lộ mật khẩu công khai), **đừng chạy `npm run seed`** —
chỉ chạy `migrate` (đã tự động khi start), sau đó tự tạo 1 tài khoản Quản trị viên đầu tiên bằng cách chạy
trực tiếp:

```
node -e "
const bcrypt = require('bcryptjs');
const { pool } = require('./src/db');
(async () => {
  const hash = await bcrypt.hash('MẬT_KHẨU_MẠNH_CỦA_BẠN', 10);
  await pool.query(
    \`INSERT INTO users (username, password_hash, ho_ten, role, dang_hoat_dong) VALUES ('admin', \$1, 'Quản trị hệ thống', 'ADMIN', TRUE)\`,
    [hash]
  );
  console.log('Đã tạo tài khoản admin đầu tiên.');
  await pool.end();
})();
"
```

rồi đăng nhập bằng tài khoản đó và tự cấp các tài khoản cán bộ/sinh viên còn lại qua màn "Quản lý tài khoản".
