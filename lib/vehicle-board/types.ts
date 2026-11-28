export type VehicleColumnId =
  | 'pt_trong'
  | 'pt_cho'
  | 'pt_nhan_lua_kho'
  | 'pt_nhan_lua_tuoi'
  | 'pt_tang_bo'
  | 'pt_nhan_gao';

export type VehicleGroup = 'nguyen_nguyen' | 'external';

export interface VehicleColumnMeta {
  id: VehicleColumnId;
  label: string;
  shortLabel: string;
  description: string;
}

export interface VehicleItem {
  id: string;
  name: string;
  group: VehicleGroup;
  columnId: VehicleColumnId;
  order: number;
  capacityTons: number; // Khối lượng chở tối đa của tàu (tấn)
  regNumber?: string;   // Số đăng ký (vd: ĐT-21714)
  codeNumber?: string;  // Số hiệu (vd: 52)
  note?: string;
}

export interface VehicleBoardState {
  vehicles: VehicleItem[];
  updatedAt: string;
}

export interface DailyPlanRow {
  id: string;
  kcs: string;
  supplier: string;
  contractNo: string;
  riceType: string;
  quantityKg: number;
  pricePerKg: number;
  location: string;
  note: string;
  vehicleIds: string[]; // Danh sách ID phương tiện được gán (mỗi phương tiện chỉ gán 1 nơi trong ngày)
}

export interface DailyIntakePlan {
  date: string; // YYYY-MM-DD
  rows: DailyPlanRow[];
  updatedAt: string;
}
