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

## Cách 2 — Bất kỳ nền tảng nào chạy Docker (Railway, Fly.io...)

1. Build image từ `server/Dockerfile`.
2. Cấp 1 Postgres (Railway/Fly đều có addon managed Postgres, hoặc tự dựng).
3. Set `DATABASE_URL`, `JWT_SECRET` (và `PGSSL=require` nếu cần) cho container.
4. Chạy container — image tự chạy `migrate` (tạo bảng) rồi khởi động server ở cổng 3000.

## Cách 3 — VPS riêng với Docker Compose (Ubuntu, vd VPS Viettel)

Dùng `docker-compose.yml` có sẵn trong thư mục này — tự chạy cả app lẫn Postgres trong 2 container, dữ
liệu Postgres lưu bền vững qua named volume (không mất khi cập nhật/restart container). Nginx chạy trực
tiếp trên VPS (không phải trong container) để nhận HTTPS và chuyển tiếp vào app.

### Bước 1 — Cài Docker (chỉ cần làm 1 lần, SSH vào VPS rồi chạy)

```bash
curl -fsSL https://get.docker.com | sudo sh
sudo usermod -aG docker $USER
# Thoát ra rồi SSH lại (để áp dụng quyền nhóm docker vừa thêm) trước khi làm Bước 2
```

### Bước 2 — Lấy code về VPS

```bash
sudo apt update && sudo apt install -y git
git clone https://github.com/phamvinh123-git/tuhoc-dk-server.git
cd tuhoc-dk-server
```

### Bước 3 — Tạo file cấu hình `.env`

```bash
cp .env.example .env
# Sinh 2 chuỗi ngẫu nhiên rồi dán vào .env (POSTGRES_PASSWORD và JWT_SECRET):
openssl rand -hex 24   # dùng cho POSTGRES_PASSWORD
openssl rand -hex 32   # dùng cho JWT_SECRET
nano .env              # dán 2 giá trị vừa sinh vào đúng chỗ, lưu lại (Ctrl+O, Enter, Ctrl+X)
```

### Bước 4 — Build & chạy

```bash
docker compose up -d --build
docker compose logs -f app   # xem log, kỳ vọng thấy "[migrate] Đã tạo/cập nhật schema thành công." rồi "[server] Đang chạy tại http://localhost:3000"
```

App lúc này đã chạy, nhưng chỉ nghe ở `127.0.0.1:3000` (không truy cập được từ internet) — cần Nginx ở
Bước 5 để mở ra ngoài qua domain kèm HTTPS.

### Bước 5 — Cài Nginx + trỏ domain

1. Trên trang quản lý domain, tạo 1 bản ghi DNS loại **A** trỏ subdomain bạn chọn (vd `tuhoc.ten-mien-cua-ban.vn`) về đúng **địa chỉ IP của VPS**. Đợi vài phút tới khi DNS cập nhật (kiểm tra bằng `ping tuhoc.ten-mien-cua-ban.vn` từ máy tính của bạn, thấy đúng IP VPS là được).
2. Cài Nginx + Certbot:
   ```bash
   sudo apt install -y nginx certbot python3-certbot-nginx
   ```
3. Copy cấu hình mẫu (file `deploy/nginx-tuhoc-dk.conf` trong repo) vào Nginx, sửa `YOUR_SUBDOMAIN` thành domain thật:
   ```bash
   sudo cp deploy/nginx-tuhoc-dk.conf /etc/nginx/sites-available/tuhoc-dk
   sudo sed -i 's/YOUR_SUBDOMAIN/tuhoc.ten-mien-cua-ban.vn/' /etc/nginx/sites-available/tuhoc-dk
   sudo ln -s /etc/nginx/sites-available/tuhoc-dk /etc/nginx/sites-enabled/
   sudo nginx -t && sudo systemctl reload nginx
   ```
4. Lấy chứng chỉ HTTPS miễn phí (Let's Encrypt) — Certbot tự sửa luôn cấu hình Nginx để bật HTTPS:
   ```bash
   sudo certbot --nginx -d tuhoc.ten-mien-cua-ban.vn
   ```
5. Xong — truy cập `https://tuhoc.ten-mien-cua-ban.vn` là thấy ứng dụng. Certbot tự động gia hạn chứng chỉ trước khi hết hạn, không cần làm gì thêm.

### Tạo tài khoản Admin đầu tiên

Vì `.env` không đặt `ADMIN_BOOTSTRAP_*`, bảng `users` sẽ trống sau khi deploy — tạo tài khoản Admin đầu tiên bằng lệnh (chạy ngay trong container `app`):

```bash
docker compose exec app node -e "
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

### Cập nhật khi có bản vá mới (thủ công)

SSH vào VPS rồi chạy:

```bash
cd tuhoc-dk-server
git pull
docker compose up -d --build
```

### Tự động deploy khi có code mới (không cần SSH vào tay mỗi lần)

VPS không có cơ chế "nghe" GitHub tự động như Render, nhưng có thể làm tương tự bằng cách cho VPS **tự
kiểm tra định kỳ** xem nhánh `main` trên GitHub có commit mới không, có thì tự `git pull` + deploy lại —
dùng script `deploy/auto-deploy.sh` có sẵn trong repo, kèm cron chạy mỗi 2 phút.

**Lưu ý quan trọng:** cách này chỉ tự động hoá được **phần deploy trên VPS**. Code mới vẫn cần được
**đẩy lên GitHub trước đã** (bằng `git push`) thì VPS mới có cái để tự lấy về — bước này hiện vẫn cần bạn
(hoặc 1 người/máy có quyền push) thực hiện, vì trợ lý AI đang hỗ trợ bạn ở đây không có quyền tự đẩy code
thẳng lên GitHub của bạn.

Thiết lập 1 lần duy nhất trên VPS:

```bash
cd ~/tuhoc-dk-server
crontab -e
```

Thêm dòng sau vào cuối file (sửa `/home/UBUNTU_USER/tuhoc-dk-server` thành đúng đường dẫn thật của bạn,
xem bằng lệnh `pwd` khi đang đứng trong thư mục repo), lưu lại:

```
*/2 * * * * /home/UBUNTU_USER/tuhoc-dk-server/deploy/auto-deploy.sh
```

Từ giờ cứ mỗi 2 phút VPS sẽ tự kiểm tra, có code mới trên GitHub là tự `git pull` + `docker compose up -d
--build` ngay, không cần SSH vào tay nữa. Xem log các lần tự deploy tại file `deploy-cron.log` trong thư
mục repo:

```bash
tail -f deploy-cron.log
```

### Sao lưu dữ liệu định kỳ (khuyến nghị)

Dữ liệu Postgres nằm trong Docker volume `dbdata` trên chính VPS — nếu VPS gặp sự cố phần cứng mà không
sao lưu thì mất hết, khác với Render (tự sao lưu phía nhà cung cấp). Nên định kỳ chạy lệnh sau để xuất dữ
liệu ra 1 file (và tải file đó về máy khác/lưu đám mây để an toàn):

```bash
docker compose exec db pg_dump -U tuhoc tuhoc_dk > backup-$(date +%F).sql
```

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
