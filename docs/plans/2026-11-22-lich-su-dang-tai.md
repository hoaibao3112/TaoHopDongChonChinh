# Plan: Tính năng Xem Lịch Sử Đăng Tài & Ảnh Phiếu Cân theo Ngày

## Context

Trang `/dang-tai` hiện tại **đã hỗ trợ chọn ngày** (`selectedDate`) và load dữ liệu ngày cũ qua `GET /api/dang-tai?date=YYYY-MM-DD`. Ảnh phiếu cân cũng **đã được lưu** dạng base64 data URI trong field `anhPhieuCan` của `XeDangTai` (nằm trong JSONB column `items` của table `dang_tai_records`).

**Vấn đề:** Giao diện hiện tại thiếu:
1. Khả năng xem ảnh phiếu cân dễ dàng khi lướt qua danh sách xe ngày cũ (phải bấm vào từng xe).
2. Chế độ "xem lịch sử" chỉ-đọc (read-only) để tránh vô tình sửa/xóa dữ liệu ngày cũ.
3. Gallery ảnh phiếu cân tổng hợp theo ngày để đối soát nhanh.

**Mục tiêu:** Cho phép user bấm vào ngày bất kỳ trên date picker, thấy toàn bộ danh sách xe + ảnh phiếu cân đã quét của ngày đó, với giao diện trực quan và an toàn (read-only cho ngày cũ).

## Approach

Tận dụng 100% cơ sở hạ tầng hiện có (API `GET /api/dang-tai?date=`, storage layer, `DangTaiView` component). Không cần tạo trang mới hay API mới. Chỉ cần **bổ sung UI** trên trang `/dang-tai` hiện tại.

### Step 1: Thêm nút "Lịch sử" nhanh + Chế độ Read-Only cho ngày cũ
- **File:** `components/DangTaiView.tsx`
- **Thay đổi:**
  - Khu vực chọn ngày (`selectedDate`): Thêm một dãy nút ngày nhanh (7 ngày gần nhất) bên cạnh date picker hiện có, giúp bấm 1 chạm để chuyển sang ngày cũ.
  - Khi `selectedDate !== getTodayString()` (tức đang xem ngày cũ):
    - Hiện banner nổi bật: `📋 Đang xem lịch sử ngày DD/MM/YYYY (Chỉ đọc)` + nút `[Quay về hôm nay]`.
    - **Ẩn toàn bộ các nút** thêm/sửa/xóa xe, quét phiếu cân, thêm nhanh, ghép NCC (đặt biến `isReadOnly = selectedDate !== getTodayString()`).
    - Các nút hành động khác (xuất Excel, báo cáo Zalo) vẫn hoạt động bình thường.

### Step 2: Hiển thị ảnh phiếu cân trong bảng danh sách xe
- **File:** `components/DangTaiView.tsx`
- **Thay đổi:**
  - Trong mỗi row của bảng xe, nếu `item.anhPhieuCan` tồn tại (là base64 data URI), hiển thị một **thumbnail nhỏ** (40×56px, border rounded) ở cột cuối hoặc cột phiếu cân.
  - Bấm vào thumbnail → Mở modal xem ảnh phóng to (tận dụng lại modal `viewingImage` đã có sẵn trong component, kèm nút zoom + rotate đã được code sẵn).
  - Xe nào chưa có ảnh phiếu (`anhPhieuCan` undefined) thì hiện icon placeholder xám nhạt `📄`.

### Step 3: Gallery ảnh tổng hợp theo ngày
- **File:** `components/DangTaiView.tsx`
- **Thay đổi:**
  - Thêm 1 nút `[🖼️ Xem tất cả ảnh phiếu]` ở khu vực summary/thống kê.
  - Bấm vào → Mở modal gallery hiển thị lưới (grid) toàn bộ ảnh phiếu cân trong ngày đó, mỗi ảnh có caption: `STT {stt} - {bienSoXe} - {tlHangKg} Kg`.
  - Bấm vào ảnh bất kỳ trong grid → Phóng to full-screen (reuse modal xem ảnh hiện có).

## Key decisions

1. **Không tạo trang/route mới:** Toàn bộ tính năng lịch sử được tích hợp trực tiếp vào trang `/dang-tai` hiện tại vì API đã hỗ trợ query theo ngày. Tránh phân tán UI và tránh phải duy trì thêm route.
2. **Read-only bằng UI-level guard:** Dùng biến `isReadOnly` để ẩn nút thêm/sửa/xóa khi xem ngày cũ. Không cần thêm guard ở API vì API đã yêu cầu auth và action `save_all` cần gửi explicit body.
3. **Giữ nguyên storage base64:** User xác nhận giữ cách lưu hiện tại (base64 trong JSONB). Không chuyển sang cloud storage trong scope này.
4. **Quick navigation 7 ngày:** Thay vì trang lịch sử riêng, chỉ cần dãy nút ngày nhanh (hôm nay, hôm qua, 2 ngày trước...) là đủ cho nghiệp vụ trạm cân hàng ngày.

## Files to modify

### UI Components (mục đích: thêm chế độ read-only + thumbnail + gallery)
- **`components/DangTaiView.tsx`** — Thay đổi chính:
  - Thêm biến `isReadOnly` và dãy nút chọn ngày nhanh *(khu vực date picker, ~line 43-50)*
  - Banner "Đang xem lịch sử" khi `isReadOnly === true`
  - Ẩn tất cả nút thêm/sửa/xóa/quét khi `isReadOnly`
  - Thêm thumbnail ảnh phiếu cân trong mỗi row *(khu vực render bảng)*
  - Thêm modal Gallery ảnh tổng hợp *(cuối component)*

### Không cần thay đổi
- `app/dang-tai/page.tsx` — Không đổi (server component, chỉ render `DangTaiView`)
- `app/api/dang-tai/route.ts` — Không đổi (API đã hỗ trợ query theo ngày)
- `lib/dang-tai/storage.ts` — Không đổi (đọc/ghi theo date key đã sẵn)
- `lib/dang-tai/types.ts` — Không đổi (`anhPhieuCan` field đã có trong type)
- `lib/db.ts` — Không đổi

## Out of scope

- **Chuyển ảnh sang cloud storage** — Giữ base64 theo yêu cầu user. Có thể làm sau nếu DB quá nặng.
- **Trang lịch sử riêng biệt** — Không cần route `/dang-tai/lich-su` vì tích hợp trực tiếp vào trang hiện có.
- **Tìm kiếm xe xuyên ngày** (search biển số xe xem tất cả ngày đã cân) — Feature riêng, không trong scope này.
- **Pagination/lazy loading cho ngày có quá nhiều xe** — Hiện tại mỗi ngày ~50-100 xe, chưa cần.

## Verification & Completion Status

- [x] **Step 1: Dãy nút chọn ngày nhanh + Chế độ Read-Only cho ngày cũ**
  - Đã thêm `isReadOnly = selectedDate !== getTodayString()`.
  - Đã thêm dãy 7 nút ngày nhanh (Hôm nay, Hôm qua, 2-6 ngày trước).
  - Đã thêm banner "Đang xem dữ liệu lịch sử ngày DD/MM/YYYY (Chỉ đọc)" kèm nút "Quay về ngày hôm nay".
  - Đã ẩn toàn bộ nút thêm xe mới, dán từ Zalo, quét AI sổ, quét AI phiếu cân, chấp nhận tất cả STT, ghép NCC khi `isReadOnly`.
  - Trong bảng: ẩn nút đổi thứ tự STT, khóa nút sửa tên NCC, ẩn các nút thao tác sửa/xóa/đảo vị trí khi `isReadOnly`.

- [x] **Step 2: Hiển thị thumbnail ảnh phiếu cân trong bảng xe**
  - Đã thêm cột `<th>Ảnh Phiếu</th>` và `<td>` thumbnail kích thước 40×56px có bo góc.
  - Xe có ảnh (`item.anhPhieuCan`) hiển thị ảnh thumbnail, click vào mở modal phóng to ảnh xem chi tiết.
  - Xe chưa có ảnh hiển thị icon `📄` nhạt.
  - Đã nâng `colSpan` từ 16 lên 17 ở dòng loading và dòng danh sách rỗng.

- [x] **Step 3: Gallery kho ảnh tổng hợp theo ngày**
  - Đã thêm nút `[🖼️ Kho Ảnh Phiếu ({count})]` trên thanh công cụ trên đầu (tự động hiện khi có ảnh trong ngày).
  - Modal Thư viện ảnh dạng grid hiển thị toàn bộ phiếu cân trong ngày với thông tin STT, Biển số xe, Trọng lượng hàng kg, Giờ cân, Nhà cung cấp.
  - Bấm vào ảnh bất kỳ trong grid để xem phóng to với đầy đủ công cụ xoay, zoom, reset.
