# SkinAI Lab — Phase 0 MVP

Web app cho phép người dùng nộp 3 ảnh khuôn mặt + thông tin cá nhân, chạy phân
tích da bằng AI (provider có thể swap), và nhận báo cáo công khai qua token bí
mật. Kèm khu admin để quản lý submissions.

> **Disclaimer:** Kết quả phân tích chỉ mang tính tham khảo, không phải chẩn đoán
> y khoa và không thay thế việc thăm khám với bác sĩ da liễu.

## Tech stack

- **Next.js 15** (App Router) + React 19 + TypeScript strict
- **Tailwind CSS** + UI primitives tự viết (cva + clsx + tailwind-merge), `lucide-react`
- **zod** cho validation
- Backend swappable: `pg` (local Postgres) hoặc `@supabase/supabase-js` + `@supabase/ssr`
- AI: `@anthropic-ai/sdk` (provider `claude`), mặc định provider `mock`
- Image quality client-side: `@mediapipe/tasks-vision`
- Email (optional): `resend`
- `nanoid` cho report token

## Yêu cầu

- Node.js ≥ 18.18 (khuyến nghị 20+)
- Docker (cho Postgres local)

## Chạy local (BACKEND=local, SKIN_AI_PROVIDER=mock)

Không cần Anthropic key, không cần Supabase.

```bash
cp .env.example .env            # chỉnh secret nếu muốn
npm install
npm run db:up                   # Postgres 16 qua docker compose
npm run db:setup                # apply db/schema.sql
npm run dev                     # http://localhost:3000
```

Luồng thử:

1. Mở `/submit`, điền thông tin, tải 3 ảnh khuôn mặt hợp lệ → redirect tới `/report/<token>` với điểm số deterministic.
2. Tải ảnh mờ / quá tối / không có mặt → bị chặn ngay ở client với message tiếng Việt cụ thể.
3. Đăng nhập admin tại `/admin/login` (mặc định `admin@example.com` / `admin`) → xem danh sách → mở chi tiết → đổi status → thêm note → export CSV.

## Scripts

| Script               | Mô tả                                          |
| -------------------- | ---------------------------------------------- |
| `npm run dev`        | Next.js dev server                             |
| `npm run build`      | Production build                               |
| `npm run start`      | Chạy production build                          |
| `npm run lint`       | ESLint                                         |
| `npm run typecheck`  | `tsc --noEmit`                                 |
| `npm run db:up`      | `docker compose up -d postgres`                |
| `npm run db:down`    | `docker compose down`                          |
| `npm run db:setup`   | Apply `db/schema.sql` vào `DATABASE_URL`       |
| `npm run db:reset`   | Xoá volume, dựng lại Postgres, apply schema    |

## Cấu trúc kiến trúc backend (swappable)

Mọi truy cập DB / storage / auth đi qua 3 interface ở `src/lib/backend/types.ts`:

| Interface     | Local                                        | Supabase                   |
| ------------- | -------------------------------------------- | -------------------------- |
| `DataStore`   | `postgres/data-store.ts` (raw SQL qua `pg`)  | `supabase/data-store.ts`   |
| `BlobStore`   | `local/blob-store.ts` (FS + HMAC URL)        | `supabase/blob-store.ts`   |
| `AuthBackend` | `local/auth.ts` (env cred + HMAC cookie)     | `supabase/auth.ts`         |

Backend được chọn qua env `BACKEND`. Ba factory tách biệt (`data.ts`, `blob.ts`,
`auth.ts`) + `select.ts` xử lý switch. **`auth.ts` không kéo theo `pg`** để
middleware chạy được trên Edge runtime.

Thêm backend mới = tạo folder `src/lib/backend/<name>/`, implement 3 interface,
mở rộng `select.ts` + 3 factory. Không sửa page/route.

## Chuyển sang Supabase

```bash
# 1. Tạo project Supabase, chạy migration
#    supabase/migrations/0001_init.sql trong SQL editor
#    (tạo bảng + RLS deny-all + private bucket `skin-images`)

# 2. Điền env
BACKEND=supabase
NEXT_PUBLIC_SUPABASE_URL=...
NEXT_PUBLIC_SUPABASE_ANON_KEY=...
SUPABASE_SERVICE_ROLE_KEY=...
SUPABASE_STORAGE_BUCKET=skin-images

# 3. Tạo tài khoản admin trong Supabase Auth (email + password)

npm run dev
```

Toàn bộ flow hoạt động lại mà không sửa code app. RLS bật, không có policy cho
anon/authenticated → client trực tiếp không đọc được; server dùng service role.

## AI provider

Chọn qua `SKIN_AI_PROVIDER`:

- `mock` (default): điểm deterministic từ hash submissionId, không gọi API.
- `claude`: dùng `@anthropic-ai/sdk`, gửi cả 3 ảnh trong 1 request, ép JSON shape
  qua `output_config.format` (json_schema), cache system prompt
  (`cache_control: ephemeral`), ghi token usage vào `analysis_results.raw.details.usage`.
  Cần `ANTHROPIC_API_KEY`. Model mặc định `claude-opus-4-7`, override `CLAUDE_MODEL`.

Thêm provider mới = class implement `SkinAnalysisProvider` trong `src/lib/ai/` +
thêm `case` trong `src/lib/ai/index.ts`. Không sửa pipeline.

### Chuẩn hoá điểm

- `severity`: `score = (1 - value/scale) * 100` (0 = tệ nhất → 100 = tốt nhất)
- `quality`: `score = value/scale * 100`
- `overall` = trung bình; `bandLabel`: ≥75 `high`, ≥50 `medium`, còn lại `low`.

100 luôn là tốt hơn.

## Image quality validators

Client-side, chạy trước upload (`src/lib/image-validators/`):

- **TIER1** (pixel stats): size, grayscale, brightness, contrast, blur (variance of Laplacian), glare.
- **TIER2** (model-based): face (MediaPipe FaceLandmarker — presence + bbox coverage).

Fail ở bước đầu tiên → message tiếng Việt actionable, chặn submit cho đến khi cả
3 ảnh pass.

## Bảo mật & privacy

- Report URL chỉ chứa token nanoid 32 ký tự (~190 bit), **không bao giờ chứa submission id**.
- Revoke report = set `reports.revoked_at` → trang trả 404 ngay.
- IP được hash SHA-256 với `IP_HASH_PEPPER` trước khi lưu; raw IP không persist.
- Ảnh không public: local dùng signed URL ngắn hạn qua `/api/files` (HMAC + chống path traversal); Supabase bucket private + `createSignedUrl`.
- Supabase: RLS bật, không policy cho anon/authenticated.
- HMAC cookie + signed URL dùng Web Crypto API → chạy được trên cả Node và Edge.
- Admin auth Phase 0 là 1 tài khoản env-credentialed (chỉ cho dev/MVP); production
  chuyển sang Supabase Auth hoặc adapter thứ 3.

## Out of scope (Phase 0)

Thanh toán, mobile app, chẩn đoán/kê đơn y tế, training model trên dữ liệu user,
public URL cho ảnh.

## Cấu trúc thư mục

```
db/schema.sql                 # local Postgres schema
docker-compose.yml            # Postgres 16
scripts/db-setup.mjs          # apply schema
supabase/migrations/0001_init.sql

src/
  middleware.ts               # delegate AuthBackend.middleware (Edge-safe)
  app/                        # pages + API routes
  components/                 # ui primitives + site-header + disclaimer
  lib/
    backend/                  # types + factories + local/ + supabase/ + postgres/
    ai/                       # types + normalize + mock + claude + index
    image-validators/         # tier1 + tier2
    email/resend.ts
  types/database.ts
```
