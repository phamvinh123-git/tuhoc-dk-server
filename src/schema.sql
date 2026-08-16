-- ============================================================================
-- SCHEMA VẬN HÀNH THẬT của server (khác với ../../schema.sql — bản thiết kế
-- gốc dùng để tham khảo). Bản này đơn giản hoá vài chỗ (vd: tổ/lớp lưu dạng
-- text tự do thay vì bảng chuẩn hoá riêng) để khớp đúng với những gì giao
-- diện hiện tại đang thao tác, tránh xây thừa phần chưa dùng tới.
-- ============================================================================

CREATE TABLE IF NOT EXISTS nganh (
    id        SERIAL PRIMARY KEY,
    ten_nganh VARCHAR(100) NOT NULL UNIQUE,
    ma_nganh  VARCHAR(20)  UNIQUE,
    dang_hoat_dong BOOLEAN NOT NULL DEFAULT TRUE
);

CREATE TABLE IF NOT EXISTS users (
    id            BIGSERIAL PRIMARY KEY,
    username      VARCHAR(50)  NOT NULL UNIQUE,
    password_hash VARCHAR(255) NOT NULL,
    ho_ten        VARCHAR(150) NOT NULL,
    role          VARCHAR(30)  NOT NULL CHECK (role IN ('ADMIN','TRUONG_BO_MON','CO_VAN','QUAN_LY','SINH_VIEN')),
    nganh_id      INT REFERENCES nganh(id),  -- NULL cho ADMIN (mọi ngành); bắt buộc cho vai trò khác
    dang_hoat_dong BOOLEAN NOT NULL DEFAULT TRUE,
    created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS students (
    id         BIGSERIAL PRIMARY KEY,
    ma_sv      VARCHAR(20)  NOT NULL UNIQUE,
    ten_sv     VARCHAR(150) NOT NULL,
    to_lop     VARCHAR(100),
    nganh_id   INT NOT NULL REFERENCES nganh(id),
    user_id    BIGINT UNIQUE REFERENCES users(id),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS time_slots (
    id           SMALLSERIAL PRIMARY KEY,
    buoi         VARCHAR(10) NOT NULL CHECK (buoi IN ('sang','chieu')),
    thu_tu_slot  SMALLINT NOT NULL,
    nhan         VARCHAR(30) NOT NULL,  -- vd: "8:00 - 8:50"
    UNIQUE (buoi, thu_tu_slot)
);

CREATE TABLE IF NOT EXISTS schedule_entries (
    id            BIGSERIAL PRIMARY KEY,
    nganh_id      INT NOT NULL REFERENCES nganh(id),
    ngay_hoc      DATE NOT NULL,
    time_slot_id  SMALLINT NOT NULL REFERENCES time_slots(id),
    subject       VARCHAR(200) NOT NULL,
    ma_mon        VARCHAR(30),
    noi_dung      TEXT,
    phong         VARCHAR(100),
    giang_vien    VARCHAR(150),
    suc_chua      SMALLINT NOT NULL DEFAULT 10 CHECK (suc_chua > 0),
    so_luong_dk   SMALLINT NOT NULL DEFAULT 0,
    trang_thai    VARCHAR(15) NOT NULL DEFAULT 'mo' CHECK (trang_thai IN ('mo','khoa')),
    khoa_thu_cong BOOLEAN NOT NULL DEFAULT FALSE,
    created_by    BIGINT REFERENCES users(id),
    updated_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (nganh_id, ngay_hoc, time_slot_id)
);
CREATE INDEX IF NOT EXISTS idx_schedule_nganh_ngay ON schedule_entries (nganh_id, ngay_hoc);

CREATE TABLE IF NOT EXISTS registrations (
    id                BIGSERIAL PRIMARY KEY,
    schedule_entry_id BIGINT NOT NULL REFERENCES schedule_entries(id) ON DELETE CASCADE,
    student_id        BIGINT NOT NULL REFERENCES students(id) ON DELETE CASCADE,
    thoi_gian_dang_ky TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (schedule_entry_id, student_id)
);

CREATE OR REPLACE FUNCTION fn_check_slot_capacity()
RETURNS TRIGGER AS $$
DECLARE
    v_so_luong   SMALLINT;
    v_suc_chua   SMALLINT;
    v_trang_thai VARCHAR(10);
    v_khoa_tay   BOOLEAN;
BEGIN
    SELECT suc_chua, trang_thai, khoa_thu_cong INTO v_suc_chua, v_trang_thai, v_khoa_tay
    FROM schedule_entries WHERE id = NEW.schedule_entry_id
    FOR UPDATE;

    IF v_khoa_tay THEN
        RAISE EXCEPTION 'Slot đã bị khóa bởi Cô trưởng bộ môn' USING ERRCODE = 'P0001';
    END IF;

    SELECT count(*) INTO v_so_luong FROM registrations WHERE schedule_entry_id = NEW.schedule_entry_id;

    IF v_so_luong >= v_suc_chua THEN
        RAISE EXCEPTION 'Slot đã đủ % người, không thể đăng ký thêm', v_suc_chua USING ERRCODE = 'P0002';
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_before_insert_registration ON registrations;
CREATE TRIGGER trg_before_insert_registration
    BEFORE INSERT ON registrations
    FOR EACH ROW EXECUTE FUNCTION fn_check_slot_capacity();

CREATE OR REPLACE FUNCTION fn_sync_slot_status()
RETURNS TRIGGER AS $$
DECLARE
    v_entry_id BIGINT;
    v_so_luong SMALLINT;
    v_suc_chua SMALLINT;
    v_khoa_tay BOOLEAN;
BEGIN
    v_entry_id := COALESCE(NEW.schedule_entry_id, OLD.schedule_entry_id);

    SELECT count(*) INTO v_so_luong FROM registrations WHERE schedule_entry_id = v_entry_id;
    SELECT suc_chua, khoa_thu_cong INTO v_suc_chua, v_khoa_tay FROM schedule_entries WHERE id = v_entry_id;

    UPDATE schedule_entries
    SET so_luong_dk = v_so_luong,
        trang_thai = CASE
            WHEN v_khoa_tay THEN 'khoa'
            WHEN v_so_luong >= v_suc_chua THEN 'khoa'
            ELSE 'mo'
        END,
        updated_at = now()
    WHERE id = v_entry_id;

    RETURN NULL;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_after_registration_change ON registrations;
CREATE TRIGGER trg_after_registration_change
    AFTER INSERT OR DELETE ON registrations
    FOR EACH ROW EXECUTE FUNCTION fn_sync_slot_status();

CREATE TABLE IF NOT EXISTS equipment (
    id            SERIAL PRIMARY KEY,
    nganh_id      INT NOT NULL REFERENCES nganh(id),
    ten_dung_cu   VARCHAR(150) NOT NULL,
    tong_so_luong INT NOT NULL DEFAULT 0,
    tinh_trang    VARCHAR(100),
    UNIQUE (nganh_id, ten_dung_cu)
);

CREATE TABLE IF NOT EXISTS equipment_assignments (
    id                 BIGSERIAL PRIMARY KEY,
    equipment_id       INT NOT NULL REFERENCES equipment(id),
    schedule_entry_id  BIGINT NOT NULL REFERENCES schedule_entries(id) ON DELETE CASCADE,
    student_id         BIGINT NOT NULL REFERENCES students(id) ON DELETE CASCADE,
    so_luong           INT NOT NULL CHECK (so_luong > 0),
    nguoi_giao_id      BIGINT REFERENCES users(id),
    ngay_giao          DATE NOT NULL DEFAULT CURRENT_DATE
);
CREATE INDEX IF NOT EXISTS idx_eqassign_entry ON equipment_assignments (schedule_entry_id);
