import { z } from 'zod';

/**
 * Schema kết quả OCR từ ảnh phiếu cân (Structured Output Gemini)
 */
export const WeighingSlipOcrSchema = z.object({
  so_phieu: z.string().nullable().optional(),
  khach_hang: z.string().nullable().optional(),
  loai_hang: z.string().nullable().optional(),
  so_xe: z.string().nullable().optional(),
  xuat_nhap: z.string().nullable().optional(), // "Xuất" | "Nhập"
  ngay_can: z.string().nullable().optional(),  // DD/MM/YYYY
  tl_xe_hang_kg: z.number().int().nullable().optional(),
  tl_xe_kg: z.number().int().nullable().optional(),
  tl_hang_kg: z.number().int().nullable().optional(),
  ghi_chu_viet_tay: z.string().nullable().optional(),
});

export type WeighingSlipOcr = z.infer<typeof WeighingSlipOcrSchema>;

/**
 * Phiếu cân sau khi chuẩn hóa và kiểm tra cảnh báo
 */
export interface ScannedSlipItem {
  id: string; // UUID định danh
  fileName: string;
  thumbnailBase64?: string;
  selected: boolean; // "Ghi?" checkbox

  // Dữ liệu đọc từ phiếu
  ticketNumber?: string;
  customer: string;
  vehicle: string;
  productType: string;
  direction: string; // "Xuất" | "Nhập"
  date: string; // DD/MM/YYYY

  weightGrossKg: number; // Xe + hàng
  weightTareKg: number;  // Xe
  weightNetKg: number;   // Hàng

  handwrittenNote?: string;

  // Tính toán
  tons: number;       // kg / 1000 cắt 1 số lẻ
  unitPrice: number;  // Đơn giá xuất trấu (mặc định 11000)
  amount: number;     // tons * unitPrice
  description: string;// Cột D format
  targetTeam?: 'ĐỨC' | 'QUÝ'; // Đội được phân công: ĐỨC hoặc QUÝ

  // Cảnh báo & Trạng thái
  warnings: string[];
  isDuplicateExisting: boolean;
  isDuplicateInBatch: boolean;
}

/**
 * Cấu hình hệ thống xuất trấu
 */
export interface HuskSettings {
  unitPrice: number; // Đơn giá (mặc định 11000)
  defaultTeam: string; // Tên đội (mặc định "ĐỨC")
  sheetName: string; // Tên sheet (mặc định "QUÝ")
  mergeTrips: boolean; // Gộp chuyến cùng ngày + xe + khách
}

export const DEFAULT_HUSK_SETTINGS: HuskSettings = {
  unitPrice: 11000,
  defaultTeam: 'ĐỨC',
  sheetName: 'QUÝ',
  mergeTrips: false,
};

/**
 * Dòng đã tồn tại trong Excel để check trùng
 */
export interface ExistingExcelRow {
  stt: number;
  rowNumber: number;
  dateStr: string;
  team: string;
  description: string;
  weightKg: number;
}

