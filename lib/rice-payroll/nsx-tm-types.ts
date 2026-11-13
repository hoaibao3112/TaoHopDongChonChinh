/**
 * Types cho hệ thống Nhập Sấy NSX TM (Nhà Máy Xay Tân Mỹ / ĐTM)
 * Phân chia và tính lương cho 2 đội: Đội Đức & Đội Quý
 *
 * Input:
 * 1. File Lúa Tươi (THỊNH_TỔNG SỐ LIỆU NHẬP LÚA TƯƠI 2026.xlsx):
 *    - Lọc các mẻ sấy tại NSX TM / NSX ĐTM / CCĐTM
 *    - Cột Ngày: Cột Y (NGÀY NHẬP SẤY)
 *    - Cột Số lượng: Cột AB (CÂN NHẬP SẤY KG)
 *    - Công việc: Nhập {1 xe / ghe} {phương tiện} {loại lúa} của {khách hàng}
 *    - Đơn giá sấy: Xe = 25.000đ/tấn, Ghe = 15.000đ/tấn
 *
 * 2. File Lúa Khô (THỊNH_TỔNG NHẬP LÚA KHÔ NĂM 2026.xlsx):
 *    - Lọc các mẻ nhập tại NSX TM: Cột AD (NHẬP NSX TM) hoặc Cột AE (CÂN CTY/NSX) > 0
 *    - Cột Ngày: Cột AD (hoặc cột B)
 *    - Cột Số lượng: Cột AE (hoặc cột H)
 *    - Công việc: Nhập {phương tiện} Lúa khô {loại lúa} của {nhà cung cấp}
 *    - Đơn giá lúa khô: 20.000đ/tấn
 *
 * Output: 2 File Excel đầu ra:
 * 1. LƯƠNG ĐỘI ĐỨC-T{mm}.{yyyy}.xlsx
 * 2. LƯƠNG ĐỘI QUÝ-T{mm}.{yyyy}.xlsx
 */

export type NSXTMTeamKey = 'ĐỨC' | 'QUÝ';
export type NSXTMViewMode = 'ALL' | 'ĐỨC' | 'QUÝ';
export type NSXTMSource = 'LUA_TUOI' | 'LUA_KHO' | 'MANUAL';
export type NSXTMVehicleType = 'XE' | 'GHE';

export interface NSXTMEntry {
  id: string;
  source: NSXTMSource;
  date: string;              // DD/MM/YYYY
  team: NSXTMTeamKey;        // 'ĐỨC' | 'QUÝ'
  customerName: string;      // Khách hàng / Nhà cung cấp
  riceType: string;          // Loại lúa (OM18, NẾP, ST25 ĐL, JAPO...)
  vehicleName: string;       // Tên phương tiện (Xe 62H 00596, Ghe NN02, Tàu Danh...)
  vehicleType: NSXTMVehicleType; // 'XE' | 'GHE'
  jobDescription: string;    // Câu mô tả công việc hiển thị trên bảng lương
  weightKg: number;          // Số lượng cân (Kg)
  roundedTons: number;       // Số lượng làm tròn (Tấn)
  bagCount?: number;         // Số bao (cho xuất gạo lức nếu có)

  // Đơn giá & Thành tiền
  unitPriceSayXe?: number;   // 25.000 nếu là Xe
  unitPriceSayGhe?: number;  // 15.000 nếu là Ghe
  thanhTienSay: number;      // Tấn × Đơn giá sấy

  unitPriceLuaKho?: number;  // 20.000 nếu là Lúa khô
  thanhTienLuaKho: number;   // Tấn × 20.000

  unitPriceVoBon?: number;   // 50.000 (lúa nền vô bồn)
  thanhTienVoBon?: number;

  unitPriceXuatGao?: number; // 1.650 (xuất gạo lức / bao)
  thanhTienXuatGao?: number;

  unitPriceXuatTrau?: number;// 11.000 (xuất trấu / tấn)
  thanhTienXuatTrau?: number;

  tongThanhTien: number;     // Tổng cộng các khoản tiền
  note?: string;
}

export interface NSXTMPayload {
  month: number;
  year: number;
  targetTeam: NSXTMViewMode; // 'ALL' | 'ĐỨC' | 'QUÝ'
  entries: NSXTMEntry[];
  preparerName?: string;     // Võ Hoàng Cẩm Tiên
  approverName?: string;     // Huỳnh Anh Phát Thịnh
}

export interface NSXTMTeamSummary {
  team: NSXTMTeamKey;
  totalEntries: number;
  totalKg: number;
  totalTons: number;
  totalSayKg: number;
  totalSayTons: number;
  totalSayMoney: number;
  totalKhoKg: number;
  totalKhoTons: number;
  totalKhoMoney: number;
  totalTrauMoney: number;
  totalGaoMoney: number;
  totalVoBonMoney: number;
  grandTotalMoney: number;
}

