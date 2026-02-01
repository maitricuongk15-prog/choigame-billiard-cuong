# Hướng dẫn bật Multiplayer thật (Supabase)

## 1. Tạo project Supabase

1. Vào [supabase.com](https://supabase.com) → Đăng nhập → **New project**.
2. Điền tên, mật khẩu DB, chọn region → **Create**.
3. Vào **Project Settings** → **API** → copy:
   - **Project URL** → dùng làm `EXPO_PUBLIC_SUPABASE_URL`
   - **anon public** key → dùng làm `EXPO_PUBLIC_SUPABASE_ANON_KEY`

## 2. Cấu hình app

1. Copy file mẫu env:
   ```bash
   cp .env.example .env
   ```
2. Mở `.env` và điền:
   ```
   EXPO_PUBLIC_SUPABASE_URL=https://xxxx.supabase.co
   EXPO_PUBLIC_SUPABASE_ANON_KEY=eyJhbGc...
   ```

## 3. Chạy migration (tạo bảng)

1. Vào Supabase Dashboard → **SQL Editor**.
2. Mở file `supabase/migrations/001_initial.sql` trong project, copy toàn bộ nội dung.
3. Dán vào SQL Editor → **Run**.

## 4. Bật Realtime cho phòng chờ

1. Vào **Database** → **Replication**.
2. Bật **Replication** cho 2 bảng:
   - `public.rooms`
   - `public.room_players`

(Sau khi bật, thay đổi trong 2 bảng này sẽ sync realtime tới app.)

## 5. (Tùy chọn) Tắt xác thực email

Mặc định Supabase gửi email xác thực khi đăng ký. Để test nhanh:

1. Vào **Authentication** → **Providers** → **Email**.
2. Tắt **Confirm email**.

## 6. Chạy app

```bash
npm install
npx expo start
```

- **Tạo tài khoản**: Đăng ký (Register) với email + mật khẩu.
- **Tạo phòng**: Đăng nhập → Create Room → điền tên phòng → Tạo Phòng.
- **Vào phòng**: Trong Lobby sẽ thấy danh sách phòng thật (từ Supabase). Bấm Join để vào phòng chờ.
- **Bắt đầu trận**: Trong phòng chờ, mọi người bấm "Chưa sẵn sàng" → "✓ Ready". Host bấm **BẮT ĐẦU TRẬN** → vào màn hình game 2 người.

## Lưu ý

- Game 2 người hiện chạy **cùng máy** (local). Đồng bộ bước bắn giữa 2 thiết bị (multiplayer thật trong game) cần thêm Realtime channel cho game events (shot, balls state) – có thể làm bước tiếp theo.
- Chat trong phòng chờ hiện chỉ lưu trên máy, chưa gửi qua Supabase.
