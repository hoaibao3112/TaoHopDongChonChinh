import { CS1Worker } from './team-cs1-workers';
import { NhapTrauItem } from './nhap-types';

export type CS1TeamKey = 'NGHỊ' | 'NGUYÊN';
export type CS1ViewMode = 'ALL' | 'NGHỊ' | 'NGUYÊN';

export interface CS1Batch {
  id: string;
  contractNo?: string;     // Cột A: SỐ HĐ
  weighDate?: string;       // Cột B: NGÀY CÂN (DD/MM/YYYY)
  doiNhap: CS1TeamKey;      // Cột C: ĐỘI NHẬP ('NGHỊ' hoặc 'NGUYÊN')
  customerName: string;     // Cột D: KHÁCH HÀNG
  vehicleName: string;      // Cột E: PHƯƠNG TIỆN
  riceType: string;         // Cột F: LOẠI LÚA
  freshWeightKg?: number;   // Cột G: SỐ LƯỢNG (KG)
  freshBoVehicle?: string;  // Cột H: PHƯƠNG TIỆN TĂNG BO LÚA TƯƠI
  dryDate: string;          // Cột I: NGÀY NHẬP SẤY (DD/MM/YYYY)
  dryFacility: string;      // Cột J: ĐỊA ĐIỂM SẤY (CƠ SỞ I)
  dryWeightKg: number;      // Cột K: CÂN NHẬP SẤY (KG)
  roundedTons: number;      // Cột L: CÂN NHẬP SẤY (TẤN)
  pricePerTon: number;      // Cột M: ĐƠN GIÁ SẤY (VNĐ)
  thanhTien: number;        // Cột N: THÀNH TIỀN (VNĐ)
}

export interface CS1TeamPayrollSummary {
  teamName: string;
  totalBatches: number;
  totalKg: number;
  totalTons: number;
  totalThanhTienLua: number;
  // Trấu
  totalTrauTons: number;
  totalThanhTienTrau: number;
  // Nước đá
  workingDays: number;
  tienNuocDa: number;
  // Tổng & Ứng
  tongThanhTien: number;
  totalAdvance: number;
  netRemaining: number;
}

export interface CS1ExportPayload {
  month: number;
  year: number;
  targetTeam: CS1ViewMode; // 'NGHỊ' | 'NGUYÊN' | 'ALL'
  batches: CS1Batch[];
  workersNghi: CS1Worker[];
  workersNguyen: CS1Worker[];
  trauNghi: NhapTrauItem[];
  trauNguyen: NhapTrauItem[];
  waterDaysNghi?: number;
  waterDaysNguyen?: number;
  preparerName?: string;
  approverName?: string;
}

