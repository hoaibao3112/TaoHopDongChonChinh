export type VehicleType = 'Xe' | 'Ghe'

export type NoteType = 'HĐ' | 'Cơ Sở 1' | 'Cơ Sở 2' | string

export interface ShipmentEntry {
  id: string
  date: string // YYYY-MM-DD hoặc DD/MM/YYYY
  team: string // Đội xuất, ví dụ "ĐỨC"
  vehicleName: string // Biển số xe hoặc tên ghe
  type: VehicleType // 'Xe' hoặc 'Ghe'
  weightKg: number // Khối lượng kg
  customer: string // Tên khách hàng
  targetSheetName: string // Tên tab khách đích
  contractRow?: number // Dòng chứa HĐ trong tab khách
  contractLabel?: string // Tên / nhãn HĐ đã chọn
  note: NoteType // Ghi chú: HĐ, Cơ Sở 1, Cơ Sở 2...
}

export interface ContractInfo {
  row: number
  label: string
  slKg: number
  colSoLuong: string // 'E' | 'F' | 'EF' | 'J' | 'P'
  sumCell: string // vd 'F6'
  sumRange: string // vd 'E450:E471'
  dataRowStart: number
  dataRowEnd: number
  lastUsedRow?: number // Dòng cuối cùng thực sự có dữ liệu bên trong vùng HĐ
  currentReceivedKg?: number
  remainingKg?: number
}

export interface ParsedTabInfo {
  sheetName: string
  baseCustomerName: string
  dateRaw?: string // vd "121126"
  dateStr?: string // vd "12/11/2026"
  dateIso?: string // vd "2026-11-12"
  contractSeq?: number // vd 1, 2...
  contractSeqStr?: string // vd "01", "02"...
  hasMultipleContracts: boolean // true nếu có đuôi 2 số (vd 12112601), false nếu chỉ có 6 số (vd 121126)
  summaryDescription: string
}

export interface CustomerSheetMeta {
  sheetName: string
  customerName: string
  mainCustomerName?: string // Tên dùng khi ghi vào cột H của Sổ tổng Xuat Trấu Cty
  state: 'visible' | 'hidden'
  headerRow: number
  dataStartRow: number
  colDate: string
  colVehicle: string
  colNote?: string
  colXe?: string
  colGhe?: string
  contracts: ContractInfo[]
  warnings?: string[]
  // Thông tin trích xuất từ quy tắc đặt tên tab: <Tên KH> <Ngày ký: ddMMyy><Số thứ tự HĐ: 2 số>
  parsedContractDate?: string // "DD/MM/YYYY"
  parsedContractDateIso?: string // "YYYY-MM-DD"
  parsedContractSeq?: number // 1, 2...
  hasMultipleContracts?: boolean // true: có HĐ tiếp theo, false: chỉ 1 HĐ
  tabSummary?: string // Mô tả tóm tắt trạng thái HĐ
}

export interface WorkbookMetadata {
  fileName: string
  totalSheets: number
  mainSheetLastRow: number
  customers: string[]
  vehicles: {
    customerName: string
    vehicles: string[]
  }[]
  customerSheets: CustomerSheetMeta[]
  existingMainEntries: {
    date: string
    vehicleName: string
    customer: string
  }[]
}

export interface ValidationErrorItem {
  field: keyof ShipmentEntry | 'general'
  message: string
}

export interface ValidationWarningItem {
  field: keyof ShipmentEntry | 'general'
  message: string
}

export interface ValidationResult {
  isValid: boolean
  errors: ValidationErrorItem[]
  warnings: ValidationWarningItem[]
}

export interface BatchValidationResult {
  isValid: boolean
  entriesValidation: {
    index: number
    result: ValidationResult
  }[]
  hasErrors: boolean
  totalWarnings: number
}

export interface WriteResult {
  success: boolean
  updatedBuffer?: Uint8Array
  insertedMainCount: number
  insertedCustomerCount: number
  message: string
  reportSummary?: {
    dateDisplay: string
    dailyShipmentText: string
    contractBalanceText: string
    combinedText: string
  }
}

