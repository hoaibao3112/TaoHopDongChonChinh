import type { CustomerSheetMeta } from './types'

export const UNIT_PRICE_XE = 11 // 11 đ/kg
export const UNIT_PRICE_GHE = 7 // 7 đ/kg

export const SHEET_NAMES = {
  MAIN: 'Xuat Trấu Cty',
  SUMMARY: 'Tổng HĐ',
  CUSTOMERS: 'THÔNG TIN KH',
  VEHICLES: 'DS PHƯƠNG TIỆN',
} as const

export const NOTE_OPTIONS = ['HĐ', 'Cơ Sở 1', 'Cơ Sở 2'] as const

export const DEFAULT_TEAM = 'ĐỨC'

// Các sheet tuyệt đối không ghi vào
export const PROTECTED_SHEETS = [
  'Xuat Trấu Cty', // Sổ tổng (chỉ append dòng theo flow riêng)
  'Tổng HĐ',
  'THÔNG TIN KH',
  'DS PHƯƠNG TIỆN',
  'in bảng kê',
  'làm bảng kê',
  'Nhập Trấu Kho Anh Duy',
  'sắp tài ',
  'A CẨM PLTH ',
  'TRANG THÀNH PHÁT',
]

/**
 * Cấu hình mặc định cho các sheet khách hàng đã được trích xuất từ tab-map.json
 */
export const PRECONFIGURED_CUSTOMER_SHEETS: Record<string, Partial<CustomerSheetMeta>> = {
  'CHỊ 7 (CTC)': {
    headerRow: 7,
    dataStartRow: 8,
    colDate: 'B',
    colVehicle: 'C',
    colNote: 'D',
    colXe: 'E',
    colGhe: 'F',
  },
  'A TIẾN  ( MỚI ) ': {
    headerRow: 5,
    dataStartRow: 6,
    colDate: 'B',
    colVehicle: 'C',
    colXe: 'F', // Dùng F cho số lượng
    colGhe: 'F',
  },
  'CÔ LIỄU MỚI ': {
    headerRow: 5,
    dataStartRow: 6,
    colDate: 'B',
    colVehicle: 'C',
    colGhe: 'F',
  },
  'ĐĂNG THÀNH PHÁT ': {
    headerRow: 5,
    dataStartRow: 6,
    colDate: 'B',
    colVehicle: 'C',
    colXe: 'F',
    colGhe: 'F',
  },
  'LÝ MINH ANH ': {
    headerRow: 4,
    dataStartRow: 5,
    colDate: 'B',
    colVehicle: 'C',
    colGhe: 'F',
  },
  'CHỊ BÉ BA (TTM)': {
    headerRow: 7,
    dataStartRow: 8,
    colDate: 'B',
    colVehicle: 'C',
    colXe: 'E',
    colGhe: 'F',
  },
  'GIANG THANH BÌNH ': {
    headerRow: 12,
    dataStartRow: 13,
    colDate: 'A',
    colVehicle: 'B',
    colGhe: 'F',
  },
  'GIANG TB MỚI 2-11': {
    headerRow: 5,
    dataStartRow: 6,
    colDate: 'A',
    colVehicle: 'B',
    colXe: 'E',
    colGhe: 'F',
  },
  'CHỊ MAI THÁI BẢO NGỌC': {
    headerRow: 7,
    dataStartRow: 8,
    colDate: 'B',
    colVehicle: 'C',
    colXe: 'E',
  },
  'NAM HOÀNG OANH': {
    headerRow: 7,
    dataStartRow: 8,
    colDate: 'B',
    colVehicle: 'C',
    colXe: 'E',
  },
  'TRÂM ANH': {
    headerRow: 7,
    dataStartRow: 8,
    colDate: 'B',
    colVehicle: 'C',
    colXe: 'E',
  },
  'CẨM (THANH XUÂN )': {
    headerRow: 6,
    dataStartRow: 7,
    colDate: 'B',
    colVehicle: 'C',
    colXe: 'E',
    colGhe: 'F',
  },
  'ĐƯỢC PHƯỜNG': {
    headerRow: 17,
    dataStartRow: 18,
    colDate: 'B',
    colVehicle: 'C',
    colGhe: 'E', // ĐƯỢC PHƯỜNG dùng cột E cho số lượng ghe
  },
  'MY TÂM (Giang TB)': {
    headerRow: 4,
    dataStartRow: 5,
    colDate: 'B',
    colVehicle: 'C',
    colGhe: 'F',
  },
}

