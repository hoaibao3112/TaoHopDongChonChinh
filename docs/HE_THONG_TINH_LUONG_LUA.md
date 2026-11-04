# TÀI LIỆU TOÀN DIỆN HỆ THỐNG: HỢP ĐỒNG & TÍNH LƯƠNG NHÂN CÔNG NÔNG SẢN

> **Mục đích tài liệu:** Lưu giữ đầy đủ 100% bối cảnh dự án, lịch sử trao đổi nghiệp vụ, các quy tắc tính toán thực tế, kiến trúc code và giao diện giữa người dùng và AI. Mọi phiên làm việc tiếp theo của AI chỉ cần đọc file này là nắm bắt được toàn bộ ngữ cảnh và tiếp tục phát triển không bị gián đoạn.

---

## PHẦN 1: BỐI CẢNH DOANH NGHIỆP & CÁC PHÂN HỆ ĐÃ HOÀN THÀNH

### 1.1. Thông tin doanh nghiệp
- **Đơn vị chủ quản:** CÔNG TY TNHH XUẤT NHẬP KHẨU CHƠN CHÍNH (Bên Bán).
- **Lĩnh vực hoạt động:** Thu mua, sấy gia công, xay xát và xuất khẩu/thương mại lúa gạo tại Đồng Tháp và các tỉnh Đồng bằng Sông Cửu Long.
- **Trụ sở:** Đường ĐT 846, Ấp 5, Xã Đốc Binh Kiều, Tỉnh Đồng Tháp, Việt Nam.
- **Hệ thống kho/cơ sở:** Gồm nhiều khu/cơ sở (Cơ sở I, Thuận Thành, Nông sản Thương mại - NSX TM...).
- **Repository GitHub:** `https://github.com/hoaibao3112/TaoHopDongChonChinh.git` (nhánh `main`).
- **Production URL Vercel:** `https://tao-hop-dong-chon-chinh.vercel.app` (Đăng nhập mật khẩu: `matkhau123`).

---

### 1.2. Phân hệ 1: Tạo Hợp Đồng Mua Bán Hàng Hóa (.docx) [HOÀN THÀNH 100%]
- **Công nghệ:** Next.js App Router standalone, TypeScript, Zod, Docxtemplater, PizZip, Tailwind CSS, Vitest.
- **Template hợp đồng:** `templates/hop-dong-mua-ban.docx`.
- **Các tính năng & chuẩn hóa đã hoàn tất:**
  1. **Chuẩn thể thức văn bản hành chính:** Căn lề A4 theo Nghị định 30/2020/NĐ-CP (Top 20mm, Bottom 20mm, Left 30mm, Right 20mm).
  2. **Giãn dòng:** Thân hợp đồng giãn dòng 1.5 (`w:line="360"`), Quốc hiệu/Tiêu ngữ/Căn cứ giữ giãn dòng đơn 1.0 gọn gàng.
  3. **Bảng hàng hóa (Điều 1) thu gọn (Compact):** Ô bảng giãn dòng đơn 1.0, không dùng `tblHeader` để tránh lặp tiêu đề. Dòng `TỔNG` gộp 2 cột đầu (`gridSpan="2"`), in đậm canh giữa, vừa vặn trên Trang 1.
  4. **Số Hợp Đồng & Đại diện:** `Số: {contract_no}` in đậm. Tên người đại diện 2 bên tự động chuyển IN HOA và in đậm màu đen. Căn thẳng hàng bên trái 3 dòng Căn cứ pháp lý.
  5. **Hậu tố Bên Mua:** Tên Bên B tự động gắn thêm ` (BÊN MUA).` vào cuối tên công ty khi xuất file Word.
  6. **Vị trí ký tên:** ĐẠI DIỆN BÊN A bên trái, ĐẠI DIỆN BÊN B bên phải.
  7. **Combobox 3 Tài khoản Ngân hàng Bên A:** MB Bank (Mặc định), Bắc Á Bank, VietinBank.
  8. **Kiểm thử tự động:** Vitest 22 tests pass 100%, TypeScript 0 lỗi.

---

### 1.3. Phân hệ 2: Tính Lương Nhân Công Nông Sản [HOÀN THÀNH 100% ĐỘI CHÚ 6 THANH]
- **Đường dẫn truy cập:** `/tinh-luong`
- **Đối tượng áp dụng đầu tiên:** **ĐỘI CHÚ 6 THANH (Đội Xuất tại Cơ sở I)**.
- **Hình thức làm việc thực tế:**
  - Chú 6 Thanh quản lý đội bốc xếp xuất lúa khô sau sấy từ lò ra ghe/xe tại Cơ sở I.
  - Cứ 2 - 3 ngày chú gửi sổ tay ghi chép (hoặc ảnh chụp qua Zalo).
  - Có thể tính theo đợt (2–3 ngày), nửa tháng (15 ngày tạm ứng) hoặc trọn tháng (30–31 ngày).

---

## PHẦN 2: CÁC QUY TẮC NGHIỆP VỤ BẮT BUỘC ĐÃ KHÓA CHẶT TRONG CODE

### 2.1. Bộ ba điều kiện lọc cốt lõi từ File Excel Master
File nguồn: `THỊNH_TỔNG SỐ LIỆU NHẬP LÚA TƯƠI 2026.xlsx` (Sheet `LUA TUOI (2)`).
Khi đối soát công nhật cho Đội Chú 6 Thanh, hệ thống **bắt buộc áp dụng đúng 3 cột**:

| Tiêu chí | Tên cột trong File Excel gốc | Cột / Index | Xử lý nghiệp vụ |
| :--- | :--- | :--- | :--- |
| **1. Ngày làm việc** | **`NGÀY XUỐNG LÚA KHÔ (NHẬN XUẤT TRẢ)`** | Cột **AE** (index 30) | **Chỉ lọc theo cột này**. Tuyệt đối không lấy ngày cân tươi (Cột B) hay ngày nhập sấy (Cột Y). |
| **2. Cơ sở sấy** | **`CƠ SỞ SẤY`** / `ĐỊA ĐIỂM SẤY` | Cột **Z** (index 25) | **Bắt buộc lọc `CƠ SỞ I`** (hoặc `Cơ sở 1`, `CƠ SỞ I + CƠ SỞ II`). Bỏ qua Cơ sở II, Thuận Thành, NSX TM... |
| **3. Cân nhập sấy** | **`CÂN NHẬP SẤY (KG)`** | Cột **AB** (index 27) | Lấy trọng lượng kg của cột này để làm tròn thành số tấn tính lương. |

### 2.2. Quy tắc làm tròn số tấn (Rounding Rule)
- Đơn vị tính: `Số tấn = Cân nhập sấy (kg) / 1000`.
- **Quy tắc làm tròn:**
  - Nếu phần lẻ $\ge 333$ kg ($\ge 0.333$ tấn) $\rightarrow$ **Làm tròn lên 1 tấn** (Ví dụ: $50.334$ kg $\rightarrow 51$ tấn; $112.670$ kg $\rightarrow 113$ tấn).
  - Nếu phần lẻ $< 333$ kg ($< 0.333$ tấn) $\rightarrow$ **Làm tròn xuống** (Ví dụ: $75.125$ kg $\rightarrow 75$ tấn; $110.278$ kg $\rightarrow 110$ tấn).
- **Hàm xử lý:** `lib/rice-payroll/rounding.ts` -> `roundRiceTons(kg: number)`.

### 2.3. Quy tắc khớp mẻ lúa Chú 6 Thanh (Subset Sum Matcher)
- Sổ tay Chú 6 Thanh ghi tổng kết ngày dạng:
  - `Có trở xuất: 168 x 20 = 3360` (168 tấn $\times$ 20.000đ = 3.360.000đ)
  - `Xuất 0 trở: 253 x 16 = 4048` (253 tấn $\times$ 16.000đ = 4.048.000đ)
  - `Tổng cộng ngày: 7.408.000đ`
- Con số `168 tấn` là tổng của nhiều mẻ sấy trong ngày gộp lại (VD: $93 + 52 + 23 = 168$ tấn).
- **Thuật toán Backtracking:** `lib/rice-payroll/subset-sum-matcher.ts` tự động tìm tổ hợp mẻ lúa cộng lại bằng đúng số tấn chú báo, gán nhãn `Có trở` và `Không trở`.

---

## PHẦN 3: CÁC NÂNG CẤP GIAO DIỆN & TỐI ƯU UX (ĐÃ TRIỂN KHAI)

1. **Tự động nạp dữ liệu nền 100% (Zero-Upload Friction):**
   - Không bắt người dùng phải tự tạo file Excel hay bấm nút nạp file mỗi lần tính lương.
   - Vừa mở trang `/tinh-luong` lên là hệ thống tự động tải sẵn toàn bộ 2.902 mẻ lúa năm 2026 từ `data/sample-batches.json`.
   - Nút `⚙ Đổi file` được thu nhỏ gọn gàng, chỉ dùng khi sau này công ty có file Excel năm mới.

2. **Bộ lọc theo từng Tháng (Monthly Isolation):**
   - Dropdown chọn tháng: `Tháng 10/2026`, `Tháng 09/2026`...
   - Chọn tháng nào thì bảng và dropdown ngày chỉ hiển thị các ngày làm việc của tháng đó.

3. **Thứ tự ngày thuận chiều (01 ➔ 30/31):**
   - Sắp xếp tăng dần theo thời gian từ ngày 01 đến ngày 31.
   - Khi bấm **"＋ Thêm ngày"**, hệ thống tự động tăng thêm `+1 ngày` từ hàng trước (Ví dụ: `01/10` ➔ `02/10` ➔ `03/10`...).

4. **Hỗ trợ ngày vắt tháng (Cross-month Boundary):**
   - Ô chọn ngày cho phép **gõ tự do bất kỳ ngày nào** (ví dụ: ngày 31 tháng trước chưa kịp tính, gõ thẳng `31/09/2026` vào tháng 10).
   - Nút mũi tên **▼** phân nhóm rõ: *Tháng này*, *Cuối tháng trước*, *Đầu tháng sau*.

5. **Xóa bỏ mũi tên tăng giảm số & Khóa cuộn chuột:**
   - Ẩn hoàn toàn spinner arrows (hai nút tam giác lên/xuống) ở tất cả các ô nhập số.
   - Khóa sự kiện cuộn chuột `onWheel`, ngăn chặn tuyệt đối việc cuộn trang làm nhảy số.

6. **Cài đặt Đơn giá 1 lần (Master Unit Price Bar):**
   - Thanh cài đặt đơn giá trên đầu bảng: `Có trở: [20000] đ/tấn` | `Không trở: [16000] đ/tấn`.
   - Nhập 1 lần duy nhất tại đây, tự động điền đơn giá cho tất cả các dòng ngày công bên dưới.
   - Người dùng chỉ cần gõ đúng 2 con số: **Số tấn có trở** và **Số tấn không trở**.

7. **Xuất Excel ngay lập tức (Instant Export):**
   - Người dùng gõ số tấn xong là nút **[📥 Xuất Excel Tháng ...]** **SÁNG LÊN NGAY LẬP TỨC**.
   - Không bắt buộc phải bấm "Ghép Tất Cả" mới được xuất.
   - Hỗ trợ xuất nửa tháng (15 ngày), vài ngày, hoặc trọn tháng.
   - File Excel kết xuất ra (`Bang_Ke_Luong_Thang_...xlsx`) chuẩn chỉnh từng dòng, có phân loại mẻ, đơn giá và tổng tiền.

---

## PHẦN 4: CẤU TRÚC CODE & CÁC FILE TRỌNG YẾU

| Đường dẫn file | Vai trò / Chức năng |
| :--- | :--- |
| `components/RicePayrollView.tsx` | Component giao diện chính: Bảng nhập ngày công, bộ chọn tháng, thanh đơn giá master, panel chi tiết mẻ, bảng tổng hợp và nút xuất Excel. |
| `components/AppHeader.tsx` | Thanh điều hướng chung (Navigation Bar) có 2 tab: Tạo Hợp Đồng & Tính Lương Nông Sản. |
| `lib/rice-payroll/types.ts` | Khai báo Interface TypeScript: `RiceBatch`, `DailyWorkReportInput`, `DailyReconciliationResult`... |
| `lib/rice-payroll/rounding.ts` | Hàm làm tròn `roundRiceTons(kg)`: phần dư $\ge 333$ kg làm tròn lên. |
| `lib/rice-payroll/subset-sum-matcher.ts` | Thuật toán Subset Sum Backtracking tự động ghép các mẻ sấy thành số tấn có trở / không trở. |
| `lib/rice-payroll/excel-parser.ts` | Parser đọc file Excel Master, lọc chuẩn 3 cột nghiệp vụ, format ngày chuẩn `DD/MM/YYYY`. |
| `app/api/rice-payroll/parse/route.ts` | API nạp dữ liệu: ưu tiên đọc file JSON tĩnh `data/sample-batches.json` trên Vercel. |
| `app/api/rice-payroll/reconcile/route.ts` | API đối soát mẻ lúa trong ngày theo báo cáo của chú. |
| `app/api/rice-payroll/export-monthly/route.ts` | API xuất file Excel `.xlsx` bảng kê lương tháng có đầy đủ chi tiết hoặc tóm tắt. |
| `data/sample-batches.json` | Dữ liệu nền 2.902 mẻ lúa cả năm 2026 đã được trích xuất sẵn và bundle vào repo. |
| `__tests__/rice-payroll.test.ts` | Bộ kiểm thử tự động Vitest cho logic tính lương (8 tests pass). |

---

## PHẦN 5: KIỂM ĐỊNH CHẤT LƯỢNG & LỆNH BẢO TRÌ

- **Chạy kiểm thử unit test:**
  ```bash
  cd contract-generator
  pnpm test
  # Kết quả: 37/37 tests passed (6 test suites)
  ```
- **Kiểm tra TypeScript:**
  ```bash
  cd contract-generator
  pnpm exec tsc --noEmit
  # Kết quả: 0 errors
  ```
- **Build production Next.js:**
  ```bash
  cd contract-generator
  pnpm run build
  # Kết quả: Compiled successfully, 12/12 static/dynamic routes
  ```
- **Đẩy code lên Production:**
  ```bash
  git add .
  git commit -m "..."
  git push origin main
  # Vercel tự động deploy từ nhánh main
  ```

---

## PHẦN 6: BẢO MẬT & PHÂN QUYỀN ĐĂNG NHẬP THEO MẬT KHẨU (ROLE-BASED ACCESS)

Hệ thống hỗ trợ 2 vai trò phân quyền độc lập thông qua mật khẩu đăng nhập, bảo vệ bởi Middleware và HttpOnly Cookies:

| Mật khẩu | Phân hệ truy cập | Quyền hạn & Điều hướng | Huy hiệu người dùng |
|---|---|---|---|
| **`hoaibao`** | **Tính Lương Nông Sản** (`/tinh-luong`) | - Tự động chuyển hướng ngay đến `/tinh-luong`.<br>- Bị chặn truy cập trang tạo hợp đồng (tự động điều hướng về `/tinh-luong`).<br>- Ẩn tab Tạo Hợp Đồng trên thanh điều hướng. | `👤 Hoài Bảo (Tính Lương)` |
| **`chonchinh`** | **Tạo Hợp Đồng Mua Bán** (`/`) | - Tự động chuyển hướng ngay đến `/`.<br>- Bị chặn truy cập trang tính lương (tự động điều hướng về `/`).<br>- Ẩn tab Tính Lương trên thanh điều hướng. | `👤 Chơn Chính (Hợp Đồng)` |
| **`matkhau123`** | **Toàn quyền Quản Trị** | - Toàn quyền truy cập cả hai phân hệ.<br>- Hiển thị đầy đủ cả hai tab chuyển đổi qua lại linh hoạt. | `👑 Quản Trị Viên` |

- **Cơ chế kỹ thuật:**
  - `lib/auth.ts`: Hàm `checkPassword(password)` kiểm tra mật khẩu, gán vai trò (`UserRole: 'payroll' | 'contracts' | 'admin'`), trả về `redirectUrl` và lưu cookie phiên `auth_contract_session` (httpOnly) cùng cookie vai trò `auth_user_role`.
  - `middleware.ts`: Ngăn chặn người dùng trái phép truy cập chéo phân hệ (kiểm tra `getRequestUserRole(request)` và redirect tương ứng).
  - `components/AppHeader.tsx`: Hiển thị huy hiệu vai trò và kiểm soát hiển thị các tab điều hướng theo vai trò thực tế.
  - `__tests__/auth-roles.test.ts`: 7 bài kiểm thử tự động xác thực phân quyền mật khẩu.

---

*Tài liệu được cập nhật ngày 04/11/2026. Mọi AI tiếp nhận phiên làm việc tiếp theo hãy tuân thủ nghiêm ngặt các quy tắc trên để bảo đảm hệ thống hoạt động ổn định và chính xác.*
