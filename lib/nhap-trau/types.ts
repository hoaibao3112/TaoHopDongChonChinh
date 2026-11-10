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
  currentReceivedKg?: number
  remainingKg?: number
}

export interface CustomerSheetMeta {
  sheetName: string
  customerName: string
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
}

