export interface RawRiceRow {
  weighDate?: string;       // Cột B: Ngày cân
  customerName?: string;    // Cột D: Khách hàng
  vehicleName?: string;     // Cột E: Phương tiện chở lúa tươi
  riceType?: string;        // Cột F: Loại lúa
  batchCode?: string;       // Cột G: Mã lô
  dryDate?: string;         // Cột Y: Ngày nhập sấy
  dryFacility?: string;     // Cột Z: Cơ sở sấy (Địa điểm sấy)
  dryWeightKg?: number;     // Cột AB: Cân nhập sấy (kg)
  dischargeDate?: string;   // Cột AE: Ngày xuống lúa khô
  dryVehicle?: string;      // Cột AG: Phương tiện chở lúa khô (vô bồn / ghe...)
}

export interface RiceBatch {
  id: string;
  batchCode: string;
  customerName: string;
  vehicleName: string;
  riceType: string;
  dryFacility: string;
  dryDate: string;
  dischargeDate: string;
  dryVehicle: string;
  dryWeightKg: number;
  roundedTons: number;      // Tấn sau khi làm tròn theo quy tắc >=0.333
  workType?: 'co_tro' | 'khong_tro'; // Được thuật toán hoặc người dùng gán
}

export interface DailyWorkReportInput {
  date: string;
  tonsCoTro: number;
  unitPriceCoTro: number;
  tonsKhongTro: number;
  unitPriceKhongTro: number;
}

export interface DailyReconciliationResult {
  date: string;
  expectedTonsCoTro: number;
  expectedTonsKhongTro: number;
  unitPriceCoTro: number;
  unitPriceKhongTro: number;
  amountCoTro: number;
  amountKhongTro: number;
  totalAmount: number;
  isMatched: boolean;
  batchesCoTro: RiceBatch[];
  batchesKhongTro: RiceBatch[];
  unmatchedBatches: RiceBatch[];
  message: string;
}
