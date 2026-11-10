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

export const DEFAULT_TEAM = 'ĐỘI ĐỨC (NSX)'

// Các sheet tuyệt đối không ghi vào
export const PROTECTED_SHEETS = [
  'Xuat Trấu Cty', // Sổ tổng (chỉ ghi theo flow riêng)
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
 * Cấu hình chuẩn xác cho từng sheet khách hàng đã xác minh trực tiếp trên file Excel mẫu
 */
export const PRECONFIGURED_CUSTOMER_SHEETS: Record<string, Partial<CustomerSheetMeta>> = {
  'CHỊ 7 (CTC)': {
    mainCustomerName: 'CHỊ 7 (CTC)',
    headerRow: 7,
    dataStartRow: 8,
    colDate: 'B',
    colVehicle: 'C',
    colNote: 'D',
    colXe: 'E',
    colGhe: 'F',
  },
  'TRANG BẾN TRE': {
    mainCustomerName: 'TRANG BẾN TRE',
    headerRow: 27,
    dataStartRow: 28,
    colDate: 'B',
    colVehicle: 'C',
    colNote: 'D',
    colXe: 'F',
    colGhe: 'L',
  },
  'A TIẾN  ( MỚI ) ': {
    mainCustomerName: 'PHAN TIẾN',
    headerRow: 5,
    dataStartRow: 6,
    colDate: 'B',
    colVehicle: 'C',
    colXe: 'F',
    colGhe: 'F',
  },
  'CÔ LIỄU MỚI ': {
    mainCustomerName: 'CÔ LIỄU',
    headerRow: 5,
    dataStartRow: 6,
    colDate: 'B',
    colVehicle: 'C',
    colXe: 'F',
    colGhe: 'F',
  },
  'ĐĂNG THÀNH PHÁT ': {
    mainCustomerName: 'ĐĂNG THÀNH PHÁT',
    headerRow: 5,
    dataStartRow: 6,
    colDate: 'B',
    colVehicle: 'C',
    colXe: 'F',
    colGhe: 'F',
  },
  'LÝ MINH ANH ': {
    mainCustomerName: 'CHỊ BÉ BA (LMA)',
    headerRow: 4,
    dataStartRow: 5,
    colDate: 'B',
    colVehicle: 'C',
    colXe: 'F',
    colGhe: 'F',
  },
  'CHỊ BÉ BA (TTM)': {
    mainCustomerName: 'CHỊ BÉ BA (TTM)',
    headerRow: 7,
    dataStartRow: 8,
    colDate: 'B',
    colVehicle: 'C',
    colXe: 'E',
    colGhe: 'F',
  },
  'GIANG THANH BÌNH ': {
    mainCustomerName: 'GIANG THANH BÌNH',
    headerRow: 12,
    dataStartRow: 13,
    colDate: 'A',
    colVehicle: 'B',
    colXe: 'F',
    colGhe: 'F',
  },
  'GIANG TB MỚI 2-11': {
    mainCustomerName: 'GIANG THANH BÌNH',
    headerRow: 5,
    dataStartRow: 6,
    colDate: 'A',
    colVehicle: 'B',
    colXe: 'E',
    colGhe: 'F',
  },
  'CHỊ MAI THÁI BẢO NGỌC': {
    mainCustomerName: 'CHỊ MAI (TBN)',
    headerRow: 18,
    dataStartRow: 19,
    colDate: 'B',
    colVehicle: 'C',
    colXe: 'E',
    colGhe: 'E',
  },
  'NAM HOÀNG OANH': {
    mainCustomerName: 'NAM HH',
    headerRow: 7,
    dataStartRow: 8,
    colDate: 'B',
    colVehicle: 'C',
    colXe: 'F',
    colGhe: 'F',
  },
  'TRÂM ANH': {
    mainCustomerName: 'TRÂM ANH',
    headerRow: 7,
    dataStartRow: 8,
    colDate: 'B',
    colVehicle: 'C',
    colXe: 'E',
    colGhe: 'E',
  },
  'CẨM (THANH XUÂN )': {
    mainCustomerName: 'CẨM THANH XUÂN',
    headerRow: 6,
    dataStartRow: 7,
    colDate: 'B',
    colVehicle: 'C',
    colNote: 'D',
    colXe: 'E',
    colGhe: 'F',
  },
  'ĐƯỢC PHƯỜNG': {
    mainCustomerName: 'ĐƯỢC PHƯỜNG',
    headerRow: 17,
    dataStartRow: 18,
    colDate: 'B',
    colVehicle: 'C',
    colXe: 'E',
    colGhe: 'E',
  },
  'MY TÂM (Giang TB)': {
    mainCustomerName: 'MY TÂM',
    headerRow: 4,
    dataStartRow: 5,
    colDate: 'B',
    colVehicle: 'C',
    colXe: 'F',
    colGhe: 'F',
  },
}
