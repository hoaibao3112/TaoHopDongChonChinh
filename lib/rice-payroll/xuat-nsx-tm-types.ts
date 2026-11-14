/**
 * xuat-nsx-tm-types.ts
 * Kiểu dữ liệu cho Hệ thống Quản lý & Tính Lương Xuất Lúa NSX Tân Mỹ (Đội Nam)
 * Chuẩn mẫu theo: LƯƠNG_ĐỘI_NAM-XUẤT_NSX_ĐTM_T10_2026_IN_CHUANMAU.xlsx
 */

export interface XuatNSXTMEntry {
  id: string;
  soHD?: string;                // Cột A: SỐ HĐ
  ngayCan?: string;             // Cột B: NGÀY CÂN (DD/MM/YYYY)
  nhanVienThuMua?: string;      // Cột C: NHÂN VIÊN THU MUA
  khachHang: string;            // Cột D: KHÁCH HÀNG
  loaiLua: string;              // Cột E: LOẠI LÚA (JAPONICA-DS1, NẾP CPC, NẾP, ST25...)
  maLo?: string;                // Cột F: MÃ LÔ
  soLuongKg?: number;           // Cột G: SỐ LƯỢNG (KG)
  phuongTienTangBo?: string;    // Cột H: PHƯƠNG TIỆN TĂNG BO LÚA TƯƠI NHẬP SẤY
  ngayNhapSay?: string;         // Cột I: NGÀY NHẬP SẤY (DD/MM/YYYY)
  diaDiemSay?: string;          // Cột J: ĐỊA ĐIỂM SẤY ("NSX TM")
  ghiChuCanNhap?: string;       // Cột K: GHI CHÚ CÂN NHẬP (TÌNH TRẠNG CÂN)
  canNhapSayKg: number;         // Cột L: CÂN NHẬP SẤY (KG)
  ngayXuongLuaKho: string;      // Cột M: NGÀY XUỐNG LÚA KHÔ (NHẬN XUẤT TRẢ) (DD/MM/YYYY)
  soLieuLuaKhoKg?: number;      // Cột N: SỐ LIỆU LÚA KHÔ SAU SẤY (CÂN LÒ SẤY) (KG)
  phuongTienChoLuaKho?: string; // Cột O: PHƯƠNG TIỆN CHỞ LÚA KHÔ (mặc định "VÔ BỒN")
  soLuongTan: number;           // Cột P: SỐ LƯỢNG LÚA TƯƠI (TẤN) (Làm tròn từ Cột L)
  donGiaCoTro: number;          // Cột Q: ĐƠN GIÁ XUẤT CÓ TRỞ (17.000Đ/Tấn)
  thanhTienCoTro: number;       // Cột R: THÀNH TIỀN GIÁ XUẤT CÓ TRỞ
  donGiaKhongTro: number;       // Cột S: ĐƠN GIÁ XUẤT KHÔNG TRỞ (11.000Đ/Tấn)
  thanhTienKhongTro: number;    // Cột T: THÀNH TIỀN XUẤT KHÔNG TRỞ
  donGiaChumLua: number;        // Cột U: ĐƠN GIÁ CHỤM LÒ 8.000Đ/Tấn (Lúa)
  donGiaChumNep: number;        // Cột V: ĐƠN GIÁ CHỤM LÒ 11.000Đ/Tấn (Nếp)
  thanhTienChum: number;        // Cột W: THÀNH TIỀN CHỤM LÒ
  donGiaVoBon: number;          // Cột X: ĐƠN GIÁ VÔ BỒN (3.000Đ/Tấn)
  thanhTienVoBon: number;       // Cột Y: THÀNH TIỀN VÔ BỒN
  ghiChu?: string;              // Cột Z: GHI CHÚ
  tongThanhTien: number;        // = thanhTienCoTro + thanhTienKhongTro + thanhTienChum + thanhTienVoBon
}

export interface XuatNSXTMSummary {
  monthKey: string;             // "10/2026"
  totalRows: number;
  totalKg: number;
  totalTons: number;
  // Xuất lúa khô
  tonsCoTro: number;            // Japonica
  priceCoTro: number;           // 17.000
  thanhTienCoTro: number;
  tonsKhongTro: number;         // Nếp / Nếp CPC, ST25...
  priceKhongTro: number;        // 11.000
  thanhTienKhongTro: number;
  // Chụm lò
  tonsChumLua: number;          // Lúa (gồm Japonica + ST25...)
  priceChumLua: number;         // 8.000
  thanhTienChumLua: number;
  tonsChumNep: number;          // Nếp / Nếp CPC
  priceChumNep: number;         // 11.000
  thanhTienChumNep: number;
  // Vô bồn
  tonsVoBon: number;
  priceVoBon: number;           // 3.000
  thanhTienVoBon: number;
  // Tổng & Tạm ứng
  tongCong: number;
  tamUng: number;
  conLai: number;
}

export interface XuatNSXTMExportPayload {
  monthKey: string;
  entries: XuatNSXTMEntry[];
  summary: XuatNSXTMSummary;
  nguoiLapBang?: string;        // Mặc định "Võ Hoàng Cẩm Tiên"
  nguoiXacNhan?: string;        // Mặc định "Huỳnh Anh Phát Thịnh"
  tamUng?: number;
}
