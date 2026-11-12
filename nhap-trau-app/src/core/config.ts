import type { CustomerSheetMeta, ParsedTabInfo } from './types'

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
  'Tổng HĐ',
  'THÔNG TIN KH',
  'DS PHƯƠNG TIỆN',
  'in bảng kê',
  'làm bảng kê',
  'Nhập Trấu Kho Anh Duy',
  'sắp tài ',
  'sắp tài',
  'A CẨM PLTH ',
  'A CẨM PLTH',
  'TRANG THÀNH PHÁT',
]

/**
 * Phân tích tên tab khách hàng theo quy ước:
 * <Tên khách hàng> <Ngày ký: ddMMyy><Số thứ tự HĐ (tuỳ chọn): 2 số>
 * - Nếu có 8 chữ số (ddMMyyNN, vd 12112601): HĐ ký ngày dd/MM/20yy, số thứ tự NN, "có nghĩa là sẽ có hợp đồng thứ 2 nữa chưa tạo tab thôi"
 * - Nếu có 6 chữ số (ddMMyy, vd 121126): HĐ ký ngày dd/MM/20yy, "có nghĩa là chỉ có 1 hợp đồng"
 */
export function parseTabName(rawName: string): ParsedTabInfo {
  const clean = (rawName || '').normalize('NFC').trim()
  // Pattern: tùy chọn tên khách hàng ở trước, sau đó là 6 chữ số (ddMMyy) và tuỳ chọn 2 chữ số tiếp theo (NN)
  const match = clean.match(/^(?:(.*?)[\s_\-]+)?(\d{2})(\d{2})(\d{2})(?:(\d{2}))?$/)
  if (!match) {
    return {
      sheetName: rawName,
      baseCustomerName: clean,
      hasMultipleContracts: false,
      summaryDescription: 'Tab hợp đồng thông thường',
    }
  }

  const [_, custPart, dd, mm, yy, seqPart] = match
  const day = parseInt(dd, 10)
  const month = parseInt(mm, 10)
  const year = 2000 + parseInt(yy, 10)

  // Kiểm tra tính hợp lệ của ngày tháng
  if (day < 1 || day > 31 || month < 1 || month > 12) {
    return {
      sheetName: rawName,
      baseCustomerName: clean,
      hasMultipleContracts: false,
      summaryDescription: 'Tab hợp đồng thông thường',
    }
  }

  const dateStr = `${dd}/${mm}/${year}`
  const dateIso = `${year}-${mm}-${dd}`
  const dateRaw = `${dd}${mm}${yy}`
  const baseCustomerName = custPart ? custPart.trim() : ''

  if (seqPart !== undefined) {
    const contractSeq = parseInt(seqPart, 10)
    return {
      sheetName: rawName,
      baseCustomerName,
      dateRaw,
      dateStr,
      dateIso,
      contractSeq,
      contractSeqStr: seqPart,
      hasMultipleContracts: true,
      summaryDescription: `HĐ ngày ${dateStr} (HĐ #${seqPart} - Có thể có thêm HĐ)`,
    }
  } else {
    return {
      sheetName: rawName,
      baseCustomerName,
      dateRaw,
      dateStr,
      dateIso,
      contractSeq: undefined,
      hasMultipleContracts: false,
      summaryDescription: `HĐ ngày ${dateStr} (Chỉ có 1 hợp đồng)`,
    }
  }
}

/**
 * Cấu hình chuẩn xác cho từng sheet khách hàng đã xác minh trực tiếp trên file Excel mẫu
 */
export const PRECONFIGURED_CUSTOMER_SHEETS: Record<string, Partial<CustomerSheetMeta>> = {
  // ─── CÁC TAB ĐÃ ĐỔI TÊN MỚI TRÊN FILE "THÙY (MỚI)I_BÁO CÁO TRẤU.xlsx" ───
  'CHỊ 7 150926': {
    mainCustomerName: 'CHỊ 7 (CTC)',
    headerRow: 7,
    dataStartRow: 8,
    colDate: 'B',
    colVehicle: 'C',
    colNote: 'D',
    colXe: 'E',
    colGhe: 'F',
  },
  'A TIẾN  091026': {
    mainCustomerName: 'PHAN TIẾN',
    headerRow: 5,
    dataStartRow: 6,
    colDate: 'B',
    colVehicle: 'C',
    colXe: 'F',
    colGhe: 'F',
  },
  'TRANG BẾN TRE 021026': {
    mainCustomerName: 'TRANG BẾN TRE',
    headerRow: 27,
    dataStartRow: 28,
    colDate: 'B',
    colVehicle: 'C',
    colNote: 'D',
    colXe: 'F',
    colGhe: 'L',
  },
  'CÔ LIỄU MỚI 280926': {
    mainCustomerName: 'CÔ LIỄU',
    headerRow: 5,
    dataStartRow: 6,
    colDate: 'B',
    colVehicle: 'C',
    colXe: 'F',
    colGhe: 'F',
  },
  'ĐĂNG THÀNH PHÁT 051126': {
    mainCustomerName: 'ĐĂNG THÀNH PHÁT',
    headerRow: 5,
    dataStartRow: 6,
    colDate: 'B',
    colVehicle: 'C',
    colXe: 'F',
    colGhe: 'F',
  },
  'LÝ MINH ANH 300726': {
    mainCustomerName: 'CHỊ BÉ BA (LMA)',
    headerRow: 4,
    dataStartRow: 5,
    colDate: 'B',
    colVehicle: 'C',
    colXe: 'F',
    colGhe: 'F',
  },
  'CHỊ BÉ BA 27052601': {
    mainCustomerName: 'CHỊ BÉ BA (TTM)',
    headerRow: 7,
    dataStartRow: 8,
    colDate: 'B',
    colVehicle: 'C',
    colXe: 'E',
    colGhe: 'F',
  },
  'GIANG THANH BÌNH 27072602': {
    mainCustomerName: 'GIANG THANH BÌNH',
    headerRow: 12,
    dataStartRow: 13,
    colDate: 'A',
    colVehicle: 'B',
    colXe: 'F',
    colGhe: 'F',
  },
  'GIANG THANH BÌNH 02112603': {
    mainCustomerName: 'GIANG THANH BÌNH',
    headerRow: 5,
    dataStartRow: 6,
    colDate: 'A',
    colVehicle: 'B',
    colXe: 'E',
    colGhe: 'F',
  },
  'CHỊ MAI THÁI BẢO NGỌC 091026': {
    mainCustomerName: 'CHỊ MAI (TBN)',
    headerRow: 18,
    dataStartRow: 19,
    colDate: 'B',
    colVehicle: 'C',
    colXe: 'E',
    colGhe: 'E',
  },
  'NAM HOÀNG HOANH 021126': {
    mainCustomerName: 'NAM HH',
    headerRow: 7,
    dataStartRow: 8,
    colDate: 'B',
    colVehicle: 'C',
    colXe: 'F',
    colGhe: 'F',
  },
  'TRÂM ANH 300926': {
    mainCustomerName: 'TRÂM ANH',
    headerRow: 7,
    dataStartRow: 8,
    colDate: 'B',
    colVehicle: 'C',
    colXe: 'E',
    colGhe: 'E',
  },
  'CẨM THANH XUÂN 170826': {
    mainCustomerName: 'CẨM THANH XUÂN',
    headerRow: 6,
    dataStartRow: 7,
    colDate: 'B',
    colVehicle: 'C',
    colNote: 'D',
    colXe: 'E',
    colGhe: 'F',
  },
  'ĐƯỢC PHƯỜNG 28082601': {
    mainCustomerName: 'ĐƯỢC PHƯỜNG',
    headerRow: 17,
    dataStartRow: 18,
    colDate: 'B',
    colVehicle: 'C',
    colXe: 'E',
    colGhe: 'E',
  },
  'MY TÂM 091026': {
    mainCustomerName: 'MY TÂM',
    headerRow: 4,
    dataStartRow: 5,
    colDate: 'B',
    colVehicle: 'C',
    colXe: 'F',
    colGhe: 'F',
  },

  // ─── CẤU HÌNH LEGACY CHO TÊN TAB CŨ (ĐẢM BẢO TƯƠNG THÍCH 100%) ───
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

/**
 * Lấy cấu hình cho một tab khách hàng:
 * 1. Khớp trực tiếp theo tên tab trong PRECONFIGURED_CUSTOMER_SHEETS
 * 2. Khớp sau khi chuẩn hóa Unicode NFC và trim
 * 3. Phân tích tên tab và khớp thông minh theo tên khách cơ bản và số thứ tự HĐ (giúp tự động hỗ trợ khi người dùng tạo tab HĐ tiếp theo)
 */
export function getCustomerSheetConfig(sheetName: string): Partial<CustomerSheetMeta> | undefined {
  if (!sheetName) return undefined

  // 1. Khớp trực tiếp
  if (PRECONFIGURED_CUSTOMER_SHEETS[sheetName]) {
    return PRECONFIGURED_CUSTOMER_SHEETS[sheetName]
  }

  // 2. Khớp chuẩn hóa NFC + trim
  const normTarget = sheetName.normalize('NFC').trim().toUpperCase()
  for (const [key, cfg] of Object.entries(PRECONFIGURED_CUSTOMER_SHEETS)) {
    if (key.normalize('NFC').trim().toUpperCase() === normTarget) {
      return cfg
    }
  }

  // 3. Phân tích tên tab
  const parsed = parseTabName(sheetName)
  const baseCust = (parsed.baseCustomerName || sheetName).normalize('NFC').trim().toUpperCase()

  // Xử lý các khách hàng đặc biệt có nhiều tab HĐ khác cấu trúc (vd GIANG THANH BÌNH)
  if (baseCust.includes('GIANG THANH BÌNH') || baseCust.includes('GIANG TB')) {
    if (parsed.contractSeq === 3 || parsed.dateRaw === '021126') {
      return PRECONFIGURED_CUSTOMER_SHEETS['GIANG THANH BÌNH 02112603']
    }
    return PRECONFIGURED_CUSTOMER_SHEETS['GIANG THANH BÌNH 27072602']
  }

  // Khớp theo từ khóa khách hàng
  if (baseCust.includes('CHỊ 7') || baseCust.includes('BÉ BẢY')) {
    return PRECONFIGURED_CUSTOMER_SHEETS['CHỊ 7 150926']
  }
  if (baseCust.includes('TRANG BẾN TRE') || baseCust.includes('TRANG BT')) {
    return PRECONFIGURED_CUSTOMER_SHEETS['TRANG BẾN TRE 021026']
  }
  if (baseCust.includes('A TIẾN') || baseCust.includes('PHAN TIẾN')) {
    return PRECONFIGURED_CUSTOMER_SHEETS['A TIẾN  091026']
  }
  if (baseCust.includes('CÔ LIỄU') || baseCust.includes('LIỄU MỚI')) {
    return PRECONFIGURED_CUSTOMER_SHEETS['CÔ LIỄU MỚI 280926']
  }
  if (baseCust.includes('ĐĂNG THÀNH PHÁT')) {
    return PRECONFIGURED_CUSTOMER_SHEETS['ĐĂNG THÀNH PHÁT 051126']
  }
  if (baseCust.includes('LÝ MINH ANH') || baseCust.includes('LMA')) {
    return PRECONFIGURED_CUSTOMER_SHEETS['LÝ MINH ANH 300726']
  }
  if (baseCust.includes('CHỊ BÉ BA') || baseCust.includes('BÉ BA')) {
    return PRECONFIGURED_CUSTOMER_SHEETS['CHỊ BÉ BA 27052601']
  }
  if (baseCust.includes('MAI') || baseCust.includes('THÁI BẢO NGỌC')) {
    return PRECONFIGURED_CUSTOMER_SHEETS['CHỊ MAI THÁI BẢO NGỌC 091026']
  }
  if (baseCust.includes('NAM HOÀNG') || baseCust.includes('NAM HH')) {
    return PRECONFIGURED_CUSTOMER_SHEETS['NAM HOÀNG HOANH 021126']
  }
  if (baseCust.includes('TRÂM ANH')) {
    return PRECONFIGURED_CUSTOMER_SHEETS['TRÂM ANH 300926']
  }
  if (baseCust.includes('CẨM') || baseCust.includes('THANH XUÂN')) {
    return PRECONFIGURED_CUSTOMER_SHEETS['CẨM THANH XUÂN 170826']
  }
  if (baseCust.includes('ĐƯỢC PHƯỜNG')) {
    return PRECONFIGURED_CUSTOMER_SHEETS['ĐƯỢC PHƯỜNG 28082601']
  }
  if (baseCust.includes('MY TÂM')) {
    return PRECONFIGURED_CUSTOMER_SHEETS['MY TÂM 091026']
  }

  // Fallback: tìm theo mainCustomerName trùng khớp
  for (const cfg of Object.values(PRECONFIGURED_CUSTOMER_SHEETS)) {
    if (cfg.mainCustomerName && cfg.mainCustomerName.normalize('NFC').trim().toUpperCase() === baseCust) {
      return cfg
    }
  }

  return undefined
}
