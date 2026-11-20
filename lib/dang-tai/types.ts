export type TrangThaiDangTai = 'cho_can' | 'da_can' | 'sai_stt';

export interface XeDangTai {
  id: string; // Unique ID (uuid/timestamp-random)
  stt: number; // Số thứ tự tài xe (1, 2, 3...)
  ngayDangTai: string; // Định dạng DD/MM/YYYY hoặc YYYY-MM-DD
  gioDangTai: string; // Định dạng HH:mm
  bienSoXe: string; // Biển số xe (ví dụ: "70H-03268")
  nhaCungCap?: string; // Nhà cung cấp / Khách hàng (ví dụ: "A LAM TAY NINH")
  loaiLua: string; // Loại lúa (ví dụ: "5451", "OM18", "Đài Thơm 8"...)
  soLuongUocTinh: number; // Số lượng ước tính từ tài (kg)
  tenTaiXe?: string; // Tên tài xế
  sdtTaiXe?: string; // SĐT tài xế
  ghiChu?: string; // Ghi chú ban đầu hoặc viết tay

  // Dữ liệu sau khi cân (tự động điền từ phiếu cân):
  trangThai: TrangThaiDangTai; // 'cho_can' | 'da_can' | 'sai_stt'
  soPhieuCan?: string; // Số phiếu in trên phiếu (ví dụ: "5")
  ngayCan?: string; // Ngày cân thực tế (lấy từ hàng ngày cân bên dưới trên phiếu, ví dụ: "20/11/2026")
  gioCan?: string; // Giờ cân thực tế (phiếu đó cân vào lúc mấy giờ - lấy từ hàng bên dưới, ví dụ: "11:41:23")
  ngayGioCan?: string; // Ngày giờ cân thực tế (ví dụ: "20/11/2026 11:41:23")
  khachHangCan?: string; // Tên khách hàng (ví dụ: "A LAM TAY NINH")
  loaiHangCan?: string; // Loại hàng trên phiếu cân (ví dụ: "LUA TUOI 5451")
  tlXeHangKg?: number; // Trọng lượng xe và hàng (kg) (ví dụ: 47710)
  tlXeKg?: number; // Trọng lượng xe (kg) (ví dụ: 14800)
  tlHangKg?: number; // Trọng lượng hàng của xe (kg) (ví dụ: 32910)
  chenhLechKg?: number; // Trọng lượng hàng - Số lượng ước tính (ví dụ: 32910 - 32000 = +910)
  anhPhieuCan?: string; // URL hoặc data URI ảnh phiếu cân

  // Thông tin kiểm tra tính hợp lệ của thứ tự cân STT:
  canHopLeSTT?: boolean; // true nếu cân đúng thứ tự STT, false nếu cân trước lượt xe khác
  canhBaoSTT?: string; // Lời cảnh báo nếu cân sai thứ tự
  daChapNhanHopLe?: boolean; // Được người điều phối xác nhận chấp nhận hợp lệ (bỏ cảnh báo đỏ lệch STT)
  daCanLuc?: string; // ISO timestamp thời điểm cập nhật cân

  createdAt: string;
  updatedAt: string;
}

export interface OcrPhieuCanResult {
  soPhieu?: string;
  soXe?: string;
  khachHang?: string;
  loaiHang?: string;
  xuatNhap?: string;
  ngayCan?: string;
  gioCan?: string;
  ngayGioCan?: string;
  tlXeHangKg?: number;
  tlXeKg?: number;
  tlHangKg?: number;
  ghiChu?: string;
  rawText?: string;
}

export interface MatchPhieuCanResult {
  phieu: OcrPhieuCanResult;
  matched: boolean;
  xeMatched?: XeDangTai;
  isValidOrder: boolean;
  warningMessage?: string;
  sttExpected?: number;
  plateExpected?: string;
}

export interface DangTaiSummary {
  ngay: string;
  tongXe: number;
  daCan: number;
  choCan: number;
  saiStt: number;
  tongKgUocTinh: number;
  tongKgThucTe: number;
  tongChenhLechKg: number;
}

export interface OcrBangDangTaiItem {
  tempId: string;
  stt: number;
  gioDangTai: string;
  bienSoXe: string;
  nhaCungCap?: string; // Nhà cung cấp / Khách hàng
  loaiLua: string;
  soLuongUocTinh: number;
  tenTaiXe?: string;
  sdtTaiXe?: string;
  ghiChu?: string;
  confidence: 'high' | 'medium' | 'low';
  uncertainFields: string[]; // ['bienSoXe', 'soLuongUocTinh', ...]
  canhBao?: string;
  isValidPlate: boolean;
}

