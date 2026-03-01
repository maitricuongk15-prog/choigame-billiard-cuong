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

## 7. Shop + coins migration

Run additional SQL migration after `001_initial.sql`:

- `supabase/migrations/002_shop_and_coins.sql`

This migration adds:
- `profiles.coins` (new user starts with 10,000 coins)
- `cues` and `user_cues` tables
- RPC: `purchase_cue` and `equip_cue`

## 8. Betting + cue rebalance migration

Run this migration after `002_shop_and_coins.sql`:

- `supabase/migrations/003_betting_and_cue_rebalance.sql`

This migration adds:
- Room bet fields (`rooms.bet_amount`, settlement status, winner slot)
- Stake tracking in `room_players`
- RPCs:
  - `create_room_with_bet`
  - `join_room_with_bet`
  - `leave_room_with_bet`
  - `settle_room_bet`
- Rebalanced cue prices/stats + new premium cues

## 9. Matchmaking start flow migration

Run this migration after `003_betting_and_cue_rebalance.sql`:

- `supabase/migrations/004_matchmaking_start_flow.sql`

This migration adds:
- RPC: `start_matchmaking_or_start`
  - Nếu phòng đã đủ người: bấm bắt đầu sẽ vào trận ngay.
  - Nếu phòng chỉ có chủ phòng: bấm bắt đầu sẽ chuyển sang trạng thái tìm đối thủ.
  - Khi có 2 host cùng chế độ + cùng mức cược: tự ghép cặp và vào trận.
- RPC: `cancel_matchmaking`
  - Khi host đang tìm đối thủ, bấm lại nút sẽ hủy tìm trận và về trạng thái chờ.
- Update `leave_room_with_bet` để hoàn tiền đúng khi rời phòng đang `searching`.
