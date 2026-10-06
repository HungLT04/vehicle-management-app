-- ==============================================================================
-- DATABASE SCHEMA CHO ỨNG DỤNG QUẢN LÝ XE CÁ NHÂN (SUPABASE POSTGRESQL)
-- Copy toàn bộ tệp này và dán vào SQL Editor trên Supabase Dashboard -> Run!
-- ==============================================================================

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- 1. BẢNG PROFILES (Quản lý tài khoản người dùng)
CREATE TABLE IF NOT EXISTS public.profiles (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  email TEXT,
  name TEXT NOT NULL,
  username TEXT,
  password TEXT DEFAULT '123456',
  role TEXT NOT NULL DEFAULT 'USER', -- 'ADMIN' hoặc 'USER'
  assigned_vehicles TEXT DEFAULT 'ALL',
  created_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL
);

-- 2. BẢNG VEHICLES (Quản lý xe cá nhân)
CREATE TABLE IF NOT EXISTS public.vehicles (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  user_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE NOT NULL,
  name TEXT NOT NULL,
  license_plate TEXT,
  brand TEXT NOT NULL,
  model TEXT,
  year TEXT,
  type TEXT DEFAULT 'Ô tô',
  fuel_type TEXT DEFAULT 'Xăng',
  purchase_date DATE DEFAULT CURRENT_DATE,
  initial_odometer NUMERIC DEFAULT 0 NOT NULL,
  current_odometer NUMERIC DEFAULT 0 NOT NULL,
  notes TEXT,
  status TEXT DEFAULT 'ACTIVE' NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL
);

-- 3. BẢNG FUEL_LOGS (Nhật ký đổ xăng)
CREATE TABLE IF NOT EXISTS public.fuel_logs (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  vehicle_id UUID REFERENCES public.vehicles(id) ON DELETE CASCADE NOT NULL,
  user_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE NOT NULL,
  date DATE DEFAULT CURRENT_DATE NOT NULL,
  odometer NUMERIC NOT NULL,
  liters NUMERIC NOT NULL,
  price_per_liter NUMERIC DEFAULT 0,
  total_amount NUMERIC DEFAULT 0 NOT NULL,
  fuel_type TEXT DEFAULT 'Xăng',
  station TEXT,
  is_full_tank BOOLEAN DEFAULT TRUE,
  notes TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL
);

-- 4. BẢNG MAINTENANCE_LOGS (Lịch sử bảo dưỡng & sửa chữa)
CREATE TABLE IF NOT EXISTS public.maintenance_logs (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  vehicle_id UUID REFERENCES public.vehicles(id) ON DELETE CASCADE NOT NULL,
  user_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE NOT NULL,
  date DATE DEFAULT CURRENT_DATE NOT NULL,
  odometer NUMERIC DEFAULT 0,
  category TEXT NOT NULL, -- Hỗ trợ chọn nhiều hạng mục ví dụ: "Thay dầu, Lọc dầu"
  description TEXT,
  parts_cost NUMERIC DEFAULT 0,
  labor_cost NUMERIC DEFAULT 0,
  total_amount NUMERIC DEFAULT 0 NOT NULL,
  garage TEXT,
  next_odometer NUMERIC DEFAULT 0,
  next_date DATE,
  notes TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL
);

-- 5. BẢNG EXPENSES (Chi phí khác: gửi xe, phí đường bộ, rửa xe...)
CREATE TABLE IF NOT EXISTS public.expenses (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  vehicle_id UUID REFERENCES public.vehicles(id) ON DELETE CASCADE NOT NULL,
  user_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE NOT NULL,
  date DATE DEFAULT CURRENT_DATE NOT NULL,
  category TEXT NOT NULL,
  description TEXT,
  amount NUMERIC DEFAULT 0 NOT NULL,
  odometer NUMERIC DEFAULT 0,
  notes TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL
);

-- 6. BẢNG REMINDERS (Nhắc việc & Bảo dưỡng tiếp theo)
CREATE TABLE IF NOT EXISTS public.reminders (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  vehicle_id UUID REFERENCES public.vehicles(id) ON DELETE CASCADE NOT NULL,
  user_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE NOT NULL,
  title TEXT NOT NULL,
  target_odometer NUMERIC DEFAULT 0,
  target_date DATE,
  remind_before_odometer NUMERIC DEFAULT 1000,
  remind_before_days INTEGER DEFAULT 15,
  status TEXT DEFAULT 'PENDING' NOT NULL, -- 'PENDING', 'COMPLETED'
  notes TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL
);

-- 7. BẢNG CATEGORIES (Danh mục chuẩn)
CREATE TABLE IF NOT EXISTS public.categories (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  type TEXT NOT NULL, -- 'MAINTENANCE' hoặc 'EXPENSE'
  category_name TEXT NOT NULL,
  description TEXT
);

-- MẪU DANH MỤC KHỞI TẠO BAN ĐẦU
INSERT INTO public.categories (type, category_name, description) VALUES
  ('MAINTENANCE', 'Thay dầu', 'Thay dầu máy định kỳ'),
  ('MAINTENANCE', 'Lọc dầu', 'Thay lọc dầu động cơ'),
  ('MAINTENANCE', 'Bảo dưỡng định kỳ', 'Bảo dưỡng định kỳ toàn bộ xe'),
  ('MAINTENANCE', 'Lọc gió động cơ', 'Thay lọc gió động cơ'),
  ('MAINTENANCE', 'Lọc gió điều hòa', 'Thay lọc cabin'),
  ('MAINTENANCE', 'Bugi', 'Thay nến đánh lửa'),
  ('MAINTENANCE', 'Nước làm mát', 'Thay nước làm mát động cơ'),
  ('EXPENSE', 'Gửi xe', 'Phí gửi xe hàng tháng / vé lượt'),
  ('EXPENSE', 'Cầu đường', 'Phí VETC / BOT'),
  ('EXPENSE', 'Rửa xe', 'Phí rửa xe & chăm sóc nội thất'),
  ('EXPENSE', 'Đăng kiểm', 'Phí kiểm định & bảo trì đường bộ'),
  ('EXPENSE', 'Bảo hiểm', 'Bảo hiểm TNDS & bảo hiểm thân vỏ')
ON CONFLICT DO NOTHING;

-- TRIGGER TỰ ĐỘNG TẠO PROFILE KHI ĐĂNG KÝ USER MỚI
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.profiles (id, email, name, role)
  VALUES (
    new.id,
    new.email,
    COALESCE(new.raw_user_meta_data->>'name', split_part(new.email, '@', 1)),
    COALESCE(new.raw_user_meta_data->>'role', 'USER')
  );
  RETURN new;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE PROCEDURE public.handle_new_user();

-- TẮT ROW LEVEL SECURITY (RLS) ĐỂ ỨNG DỤNG HOẠT ĐỘNG TRỰC TIẾP VỚI SUPABASE ANON KEY
ALTER TABLE public.profiles DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.vehicles DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.fuel_logs DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.maintenance_logs DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.expenses DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.reminders DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.categories DISABLE ROW LEVEL SECURITY;
