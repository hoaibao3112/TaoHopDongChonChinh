import { ChumLoWorker } from './team-chum-lo-workers';

export interface ChumLoBatch {
  id: string;
  contractNo?: string;     // Cột A: SỐ HĐ
  weighDate?: string;       // Cột B: NGÀY CÂN (DD/MM/YYYY)
  doiNhap?: string;         // Cột C: ĐỘI NHẬP (NGHỊ, NGUYÊN...)
  customerName: string;     // Cột D: KHÁCH HÀNG
  vehicleName: string;      // Cột E: PHƯƠNG TIỆN
  riceType: string;         // Cột F: LOẠI LÚA
  freshWeightKg?: number;   // Cột G: SỐ LƯỢNG (KG)
  freshBoVehicle?: string;  // Cột H: PHƯƠNG TIỆN TĂNG BO LÚA TƯƠI NHẬP SẤY
  dryDate: string;          // Cột I: NGÀY NHẬP SẤY (DD/MM/YYYY) - Cột quan trọng nhất tính theo tháng
  dryFacility: string;      // Cột J: ĐỊA ĐIỂM SẤY (CƠ SỞ SẤY) -> CƠ SỞ I
  dryWeightKg: number;      // Cột K: CÂN NHẬP SẤY (KG)
  roundedTons: number;      // Cột L: CÂN NHẬP SẤY (TẤN)
  unitPrice: number;        // Cột M: ĐƠN GIÁ CHỤM LÒ (5,000Đ/TẤN)
  thanhTien: number;        // Cột N: THÀNH TIỀN CHỤM LÒ (L * M)
}

export interface ChumLoSummary {
  totalBatches: number;
  totalDryWeightKg: number;
  totalRoundedTons: number;
  unitPrice: number;
  totalThanhTien: number;
  totalAdvance: number;
  netRemaining: number;
}

export interface ChumLoExportPayload {
  month: number;
  year: number;
  batches: ChumLoBatch[];
  workers: ChumLoWorker[];
  unitPrice: number;
  preparerName?: string; // Người lập bảng (mặc định Võ Hoàng Cẩm Tiên)
  approverName?: string; // Người xác nhận (mặc định Huỳnh Hải Long Hồ)
}

