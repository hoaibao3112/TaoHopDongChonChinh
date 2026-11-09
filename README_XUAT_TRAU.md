# Hướng Dẫn Sử Dụng & Cài Đặt Hệ Thống Quét Phiếu Cân & Tính Lương Xuất Trấu

Ứng dụng web dành riêng cho kế toán / quản lý tính lương đội bốc xếp tại nhà máy xay xát lúa gạo Chơn Chính (Đồng Tháp).
Hệ thống cho phép chụp ảnh phiếu cân bằng điện thoại hoặc tải ảnh lên máy tính, AI (Google Gemini) tự động nhận diện dữ liệu, kiểm tra đối soát và ghi trực tiếp vào file Excel bảng kê tính lương (sheet **QUÝ**), giữ nguyên 100% công thức, liên kết ngoài và định dạng viền/font/chữ ký.

---

## 1. Yêu Cầu Cần Chuẩn Bị
1. **Node.js**: Phiên bản 18 trở lên (khuyên dùng Node.js 20 hoặc 22).
2. **Google Gemini API Key**:
   - Truy cập: https://aistudio.google.com/
   - Bấm **Create API Key** (hoàn toàn miễn phí).
   - Sao chép key (dạng `AIzaSy...`).

---

## 2. Hướng Dẫn Chạy Trên Máy Tính (Localhost)

### Bước 1: Cấu hình biến môi trường
Tạo file `.env.local` trong thư mục `contract-generator` (hoặc sửa file `.env.local` hiện có) với nội dung:
```env
GEMINI_API_KEY="AIzaSy...Điền_API_Key_Vào_Đây..."
GEMINI_MODEL="gemini-2.5-flash"
APP_PASSWORD="matkhau_hopdong_2026"
```

### Bước 2: Khởi động ứng dụng
Mở Terminal / PowerShell trong thư mục `contract-generator` và chạy lệnh:
```bash
npm run dev
# hoặc: pnpm dev
```
Mở trình duyệt truy cập: `http://localhost:3000/xuat-trau` hoặc bấm vào tab **"🚛 Quét Phiếu Trấu"** trên thanh menu điều hướng.

---

## 3. Hướng Dẫn Triển Khai Lên Vercel (Dành Cho Người Không Rành Kỹ Thuật)

1. Đẩy code lên GitHub repository.
2. Đăng nhập vào [Vercel](https://vercel.com) bằng tài khoản GitHub.
3. Bấm **"Add New..."** &rarr; **"Project"** &rarr; Chọn repository `TaoHopDongChonChinh`.
4. Trong phần **Root Directory**, chọn thư mục `contract-generator`.
5. Trong mục **Environment Variables**, thêm 2 biến:
   - `GEMINI_API_KEY`: Dán mã API key lấy từ Google AI Studio.
   - `GEMINI_MODEL`: `gemini-2.5-flash`
   - `APP_PASSWORD`: Mật khẩu đăng nhập hệ thống nội bộ của bạn.
6. Bấm **Deploy**. Sau 1-2 phút, bạn sẽ có đường link web (dạng `https://ten-du-an.vercel.app`) để mở trên điện thoại chụp phiếu cân mọi lúc mọi nơi.

---

## 4. Quy Trình Sử Dụng Hằng Ngày
1. **Bước 1**: Bấm chọn file Excel bảng kê lương hiện tại của bạn (file chứa sheet **QUÝ**).
2. **Bước 2**: Bấm vào khung camera để chụp trực tiếp các phiếu cân bằng điện thoại (hoặc chọn nhiều ảnh từ máy tính, tối đa 30 ảnh/lần).
3. **Bước 3**: Bấm nút **"⚡ Quét phiếu cân"**. Hệ thống gửi ảnh qua AI đọc tự động.
4. **Bước 4**: Kiểm tra bảng dữ liệu:
   - Các dòng hợp lệ sẽ tự động được chọn (Ghi?).
   - Các dòng nghi ngờ (cân lệch, loại hàng không phải trấu, phiếu nhập, trùng lặp...) sẽ được tô viền cảnh báo màu cam và không tick sẵn.
   - Bạn có thể nhấp chuột trực tiếp vào từng ô để sửa nếu muốn.
   - Tùy chọn: Bật tick *"Gộp phiếu cùng ngày + xe + khách thành 1 dòng"* nếu muốn gom các chuyến trùng xe trong ngày.
5. **Bước 5**: Xem tổng khối lượng và thành tiền đợt quét &rarr; Bấm **"📥 Ghi vào Excel & Tải file về"**. File mới tải về sẽ mang tên `[Tên_gốc]_cap_nhat.xlsx`.

---

## 5. Các Quy Tắc Kỹ Thuật Được Đảm Bảo
- **Số tấn**: $Kg / 1000$ cắt xuống đúng 1 chữ số thập phân (ví dụ: $6510 \rightarrow 6.5$; $6840 \rightarrow 6.8$).
- **Mô tả công việc**: Xe tải format `"Xuất một xe trấu 63H 02309 của chị 7"`; Ghe format `"Xuất một ghe trấu Được Phường của chị 7"`.
- **Giữ nguyên liên kết**: Ô công thức ngoài (ví dụ `= [1]QUÝ!$L$9`) được bảo toàn trọn vẹn, không bị lỗi `#REF!`.
- **Tự động dời chữ ký**: Phần chữ ký Người lập bảng & Xác nhận tự động dời xuống dưới các dòng mới được thêm, giữ nguyên các ô gộp.
- **Tự động tính toán**: Đặt cờ `fullCalcOnLoad` để Excel tự động tính lại công thức SUBTOTAL và thành tiền khi mở file.

