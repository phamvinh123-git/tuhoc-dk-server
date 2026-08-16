FROM node:20-alpine

WORKDIR /app

COPY package*.json ./
RUN npm install --omit=dev

COPY src ./src
COPY public ./public

ENV NODE_ENV=production
EXPOSE 3000

# Chạy migrate (tạo schema nếu chưa có) rồi khởi động server. Seed dữ liệu mẫu KHÔNG chạy tự động ở đây —
# xem README.deploy.md để biết cách gieo dữ liệu mẫu thủ công nếu cần (không nên bật mật khẩu demo mặc định
# trên môi trường public).
CMD ["sh", "-c", "node src/migrate.js && node src/server.js"]
