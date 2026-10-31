# Ứng Dụng Tạo Hợp Đồng Mua Bán Hàng Hóa (Next.js App Router)

Dự án chuyên biệt xuất hợp đồng mua bán hàng hóa định dạng **.docx** (Microsoft Word) dựa trên mẫu template chuẩn pháp lý của **Công ty TNHH XNK Chơn Chính**.

---

## 🛠 Công Nghệ & Thư Viện

- **Framework**: Next.js 16 (App Router, Standalone mode, TypeScript Strict)
- **Styling**: Tailwind CSS v4
- **Form & Validation**: React Hook Form, Zod v4
- **Xử lý Word (.docx)**: Docxtemplater, PizZip (100% in-memory Buffer, tối ưu Serverless Read-Only File System)
- **Testing**: Vitest (Unit & Integration tests)
- **Bảo mật**: Authentication qua mật khẩu chung `APP_PASSWORD`, lưu phiên cookie `httpOnly`, `secure`, `sameSite=lax`

---

## 🚀 Hướng Dẫn Chạy Môi Trường Cục Bộ (Local)

### 1. Cài đặt dependencies
```bash
pnpm install
```

### 2. Cấu hình biến môi trường
Tạo file `.env.local` dựa trên `.env.example`:
```env
APP_PASSWORD=matkhau123
```

### 3. Chạy kiểm thử (Unit Test)
```bash
pnpm test
```
*Tất cả 19 tests kiểm tra đọc số tiền tiếng Việt, Zod schema validation, và render file .docx.*

### 4. Khởi chạy Development Server
```bash
pnpm dev
```
Truy cập: `http://localhost:3000`

---

## 🌐 Hướng Dẫn Deploy Lên Vercel

### Bước 1: Khởi tạo Git & Đẩy lên GitHub
```bash
git init
git add .
git commit -m "feat: complete contract generator app"
git branch -M main
git remote add origin https://github.com/<tai-khoan>/<ten-repo>.git
git push -u origin main
```

### Bước 2: Tạo Project trên Vercel
1. Đăng nhập vào [Vercel Dashboard](https://vercel.com).
2. Bấm **Add New...** -> **Project**.
3. Chọn Git Repository vừa đẩy lên.
4. **Root Directory**: Để trống nếu repo là thư mục `contract-generator`, hoặc chọn `contract-generator` nếu toàn bộ workspace nằm trong monorepo.
5. **Framework Preset**: Next.js (tự động nhận diện).

### Bước 3: Cấu hình Biến Môi Trường (Environment Variables)
Trong mục **Environment Variables** trên Vercel:
- `Key`: `APP_PASSWORD`
- `Value`: *(Nhập mật khẩu an toàn dùng chung cho nhân viên nội bộ)*
- Chọn áp dụng cho: `Production`, `Preview`, `Development`.

### Bước 4: Deploy & Xác minh
1. Bấm **Deploy**.
2. Sau khi Vercel build xong:
   - Truy cập trang chủ `/` -> Hệ thống sẽ tự động chuyển hướng đến `/login`.
   - Nhập `APP_PASSWORD` đã cấu hình để vào màn hình chính.
   - Thử nhập hợp đồng mẫu với 2 mặt hàng và bấm **Xuất Hợp Đồng (.docx)** để kiểm tra file tải về.

> ⚠️ **Lưu ý Vercel Serverless File Tracing**: File mẫu `templates/hop-dong-mua-ban.docx` đã được khai báo chính xác trong `next.config.ts` qua `outputFileTracingIncludes: { '/api/contracts/export': ['./templates/**/*'] }` giúp Vercel tự động đóng gói template vào Serverless Function.
