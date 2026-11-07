/**
 * Types cho hệ thống Nhập Sấy - Đội Dương Cơ Sở II
 *
 * Logic khác với Xuất:
 * - Lọc theo dryDate (NGÀY NHẬP SẤY), không phải dischargeDate
 * - Tính tiền theo loại lúa (đơn giá/tấn), không phải Có trở / Không trở
 * - Có thêm cột CHỤM LÒ (11,000đ/tấn, cố định cho mọi loại lúa)
 * - Output xuất ra gồm đúng 4 Sheets (4 tasks/tabs):
 *     1. Nhap lua CS2
 *     2. Nhập Trấu
 *     3. ỨL ĐỘI DƯƠNG-CS2-T{mm}.{yy}
 *     4. CL ĐỘI DƯƠNG-CS2-{mm}.{yy}
 */

/** Cấu hình giá theo loại lúa */
export interface RiceTypePrice {
  riceType: string;    // Tên loại lúa, ví dụ: "ST25 KDM", "OM18"
  pricePerTon: number; // Đơn giá nhập sấy (VNĐ/tấn), ví dụ: 23000, 20000
}

/** Một mẻ nhập sấy đã tính tiền */
export interface NhapBatch {
  id: string;
  doiNhap: string;          // Luôn là "DƯƠNG" cho CS2
  customerName: string;     // Khách hàng
  riceType: string;         // Loại lúa
  freshBoVehicle: string;   // Phương tiện tăng bổ lúa tươi nhập sấy
  dryDate: string;          // NGÀY NHẬP SẤY (dd/MM/yyyy)  ← dùng dryDate, không phải dischargeDate
  dryFacility: string;      // Địa điểm sấy (CƠ SỞ II)
  dryWeightKg: number;      // Cân nhập sấy (KG)
  roundedTons: number;      // Cân nhập sấy (TẤN) - làm tròn theo quy tắc >=333
  pricePerTon: number;      // Đơn giá nhập sấy (VNĐ/tấn) — tra từ riceType
  thanhTienNhap: number;    // Thành tiền nhập sấy = roundedTons × pricePerTon
  chumLoUnitPrice: number;  // Đơn giá chụm lò (mặc định 11,000đ/tấn)
  thanhTienChumLo: number;  // Thành tiền chụm lò = roundedTons × chumLoUnitPrice
  tongThanhTien?: number;   // TỔNG CỘNG THÀNH TIỀN = thanhTienNhap + thanhTienChumLo
}

/** Dữ liệu một chuyến nhập trấu */
export interface NhapTrauItem {
  id: string;
  date: string;         // Ngày nhập trấu (dd/MM/yyyy)
  doiNhap: string;      // "DƯƠNG"
  phuongTien: string;   // Ví dụ "ÔNG 5", "NGUYÊN NGUYÊN 18"
  soLuong: number;      // Số lượng (tấn)
  donGia: number;       // Đơn giá (đ/tấn, ví dụ 27273, 27000)
  thanhTien: number;    // Thành tiền (VNĐ)
}

/** Payload gửi lên API xuất Excel nhập sấy 4 sheets */
export interface NhapExportPayload {
  month: number;
  year: number;
  batches: NhapBatch[];
  chumLoUnitPrice?: number;   // Đơn giá chụm lò áp dụng (thường 11,000)
  trauItems?: NhapTrauItem[];  // Danh sách các chuyến nhập trấu
  managementSalary?: number;  // Lương quản lý (Dương) - mặc định 6.000.000
  iceUnitPricePerDay?: number;// Đơn giá nước đá/ngày - mặc định 10.000
  workDaysCount?: number;     // Số ngày làm việc tính nước đá (mặc định số ngày nhập sấy)
}

/** Tổng kết bảng nhập sấy */
export interface NhapSummary {
  totalKg: number;
  totalTons: number;
  totalThanhTienNhap: number;
  totalThanhTienChumLo: number;
  grandTotal: number; // TỔNG CỘNG THÀNH TIỀN = totalThanhTienNhap + totalThanhTienChumLo
}
