import {
  DailyIntakePlan,
  DailyPlanRow,
  VehicleBoardState,
  VehicleColumnId,
  VehicleColumnMeta,
  VehicleItem,
} from './types';

export const VEHICLE_COLUMNS: VehicleColumnMeta[] = [
  {
    id: 'pt_trong',
    label: 'PT TRỐNG',
    shortLabel: 'Trống',
    description: 'Phương tiện đang trống, sẵn sàng điều động',
  },
  {
    id: 'pt_cho',
    label: 'PT CHỜ',
    shortLabel: 'Chờ',
    description: 'Phương tiện đang chờ lệnh hoặc nghỉ phép/bảo trì',
  },
  {
    id: 'pt_nhan_lua_kho',
    label: 'PT NHẬN LÚA KHÔ',
    shortLabel: 'Nhận Lúa Khô',
    description: 'Đang nhận / chở lúa khô',
  },
  {
    id: 'pt_nhan_lua_tuoi',
    label: 'PT NHẬN LÚA TƯƠI',
    shortLabel: 'Nhận Lúa Tươi',
    description: 'Đang nhận / chở lúa tươi',
  },
  {
    id: 'pt_tang_bo',
    label: 'PT TĂNG BO',
    shortLabel: 'Tăng Bo',
    description: 'Đang chạy tăng bo',
  },
  {
    id: 'pt_nhan_gao',
    label: 'PT NHẬN GẠO',
    shortLabel: 'Nhận Gạo',
    description: 'Đang nhận / chở gạo',
  },
];

export const VALID_COLUMN_IDS: readonly VehicleColumnId[] = VEHICLE_COLUMNS.map((c) => c.id);

export function normalizeVehicleName(name: string): string {
  return name.trim().replace(/\s+/g, ' ').toUpperCase();
}

/**
 * Sức chở thực tế của tàu: 80% đến 85% khối lượng tàu
 */
export function getEffectiveCapacityRange(capacityTons: number): { minTons: number; maxTons: number } {
  return {
    minTons: Math.round(capacityTons * 0.8),
    maxTons: Math.round(capacityTons * 0.85),
  };
}

export function getNguyenNguyenCapacity(num: number): number {
  if (num === 1) return 105;
  if (num === 4) return 195;
  if (num >= 16 && num <= 20) return 200;
  return 150;
}

const EXTERNAL_CATALOG: {
  id: string;
  codeNumber: string;
  name: string;
  regNumber: string;
  capacityTons: number;
  defaultCol: VehicleColumnId;
}[] = [
  { id: 'ext-phuong-gam', codeNumber: '52', name: 'PHƯƠNG GẤM', regNumber: 'ĐT-21714', capacityTons: 50, defaultCol: 'pt_cho' },
  { id: 'ext-salan-dong', codeNumber: '54', name: 'SALAN ĐỒNG', regNumber: 'LA-08625', capacityTons: 120, defaultCol: 'pt_cho' },
  { id: 'ext-doi-tia', codeNumber: '57', name: 'ĐỜI TỈA', regNumber: 'BTr-6973', capacityTons: 65, defaultCol: 'pt_tang_bo' },
  { id: 'ext-ghe-trinh', codeNumber: '59', name: 'GHE TRÌNH', regNumber: 'ĐT-25275', capacityTons: 95, defaultCol: 'pt_cho' },
  { id: 'ext-ghe-6-than', codeNumber: '60', name: 'GHE 6 THÂN', regNumber: 'ĐT-23591', capacityTons: 130, defaultCol: 'pt_cho' },
  { id: 'ext-salan-trieu', codeNumber: '26', name: 'SALAN TRIỆU', regNumber: 'ĐT-26610', capacityTons: 110, defaultCol: 'pt_cho' },
  { id: 'ext-tau-loi', codeNumber: '27', name: 'TÀU LỢI', regNumber: 'ĐT-23215', capacityTons: 70, defaultCol: 'pt_nhan_lua_kho' },
  { id: 'ext-tau-toi', codeNumber: '28', name: 'TÀU TỚI', regNumber: 'AG-07450', capacityTons: 70, defaultCol: 'pt_nhan_lua_kho' },
  { id: 'ext-ghe-loc', codeNumber: '30', name: 'GHE LỘC', regNumber: 'ĐT-25517', capacityTons: 150, defaultCol: 'pt_trong' },
  { id: 'ext-ghe-tuyet', codeNumber: '33', name: 'GHE TUYẾT', regNumber: 'AG-21613', capacityTons: 60, defaultCol: 'pt_nhan_lua_tuoi' },
  { id: 'ext-ghe-kha', codeNumber: '34', name: 'GHE KHA', regNumber: 'TG-15250', capacityTons: 85, defaultCol: 'pt_nhan_lua_tuoi' },
  { id: 'ext-ghe-nhan', codeNumber: '35', name: 'GHE NHÂN', regNumber: 'LA-00938', capacityTons: 75, defaultCol: 'pt_nhan_lua_kho' },
  { id: 'ext-ghe-hoa', codeNumber: '36', name: 'GHE HÓA', regNumber: 'ĐT-26189', capacityTons: 130, defaultCol: 'pt_nhan_lua_tuoi' },
  { id: 'ext-tau-danh', codeNumber: '37', name: 'TÀU DANH', regNumber: 'TG-13470', capacityTons: 90, defaultCol: 'pt_trong' },
  { id: 'ext-ghe-nam', codeNumber: '45', name: 'GHE NAM', regNumber: 'AG-25870', capacityTons: 150, defaultCol: 'pt_trong' },
  { id: 'ext-salan-do', codeNumber: '46', name: 'SALAN ĐÔ', regNumber: 'LA-08249', capacityTons: 100, defaultCol: 'pt_cho' },
  { id: 'ext-ghe-do-48', codeNumber: '48', name: 'GHE ĐÔ 48', regNumber: 'LA-08249', capacityTons: 70, defaultCol: 'pt_trong' },
  { id: 'ext-tau-do-49', codeNumber: '49', name: 'TÀU ĐÔ 49', regNumber: 'TG-15177', capacityTons: 100, defaultCol: 'pt_cho' },
  { id: 'ext-ghe-hao', codeNumber: '50', name: 'GHE HẢO', regNumber: 'TG-14461', capacityTons: 130, defaultCol: 'pt_nhan_lua_tuoi' },
];

const EXTERNAL_BY_NAME = new Map(EXTERNAL_CATALOG.map((e) => [e.name, e]));

export function createDefaultVehicleBoardState(): VehicleBoardState {
  const nnDefaultColumn: Record<number, { col: VehicleColumnId; note?: string }> = {
    1: { col: 'pt_trong' },
    2: { col: 'pt_trong' },
    3: { col: 'pt_cho' },
    4: { col: 'pt_trong' },
    5: { col: 'pt_cho' },
    6: { col: 'pt_cho' },
    7: { col: 'pt_cho', note: 'Xin nghỉ phép đến hết 30/11/2026' },
    8: { col: 'pt_tang_bo' },
    9: { col: 'pt_nhan_lua_kho' },
    10: { col: 'pt_nhan_lua_tuoi' },
    11: { col: 'pt_nhan_lua_tuoi' },
    12: { col: 'pt_nhan_lua_tuoi' },
    13: { col: 'pt_trong' },
    14: { col: 'pt_nhan_lua_tuoi' },
    15: { col: 'pt_trong' },
    16: { col: 'pt_nhan_gao' },
    17: { col: 'pt_nhan_gao' },
    18: { col: 'pt_trong' },
    19: { col: 'pt_nhan_gao' },
    20: { col: 'pt_nhan_lua_tuoi' },
    21: { col: 'pt_cho' },
    22: { col: 'pt_cho' },
    23: { col: 'pt_cho' },
    24: { col: 'pt_tang_bo' },
    25: { col: 'pt_nhan_lua_kho' },
  };

  const nnList: VehicleItem[] = [];
  for (let i = 1; i <= 25; i++) {
    const num = String(i).padStart(2, '0');
    const cfg = nnDefaultColumn[i] || { col: 'pt_trong' as VehicleColumnId };
    nnList.push({
      id: `nn-${num}`,
      name: `NGUYÊN NGUYÊN ${num}`,
      group: 'nguyen_nguyen',
      columnId: cfg.col,
      order: i,
      capacityTons: getNguyenNguyenCapacity(i),
      ...(cfg.note ? { note: cfg.note } : {}),
    });
  }

  const externalList: VehicleItem[] = EXTERNAL_CATALOG.map((s, idx) => ({
    id: s.id,
    name: s.name,
    group: 'external',
    columnId: s.defaultCol,
    order: 100 + idx,
    capacityTons: s.capacityTons,
    regNumber: s.regNumber,
    codeNumber: s.codeNumber,
  }));

  return sanitizeBoardState({
    vehicles: [...nnList, ...externalList],
    updatedAt: new Date().toISOString(),
  });
}

function inferCapacityAndMeta(item: Partial<VehicleItem>, cleanName: string, group: 'nguyen_nguyen' | 'external') {
  if (group === 'nguyen_nguyen') {
    const m = cleanName.match(/(\d{1,2})$/);
    const num = m ? parseInt(m[1], 10) : 0;
    const cap =
      typeof item.capacityTons === 'number' && item.capacityTons > 0
        ? item.capacityTons
        : getNguyenNguyenCapacity(num);
    return { capacityTons: cap };
  }

  const known = EXTERNAL_BY_NAME.get(cleanName);
  const cap =
    typeof item.capacityTons === 'number' && item.capacityTons > 0
      ? item.capacityTons
      : known?.capacityTons ?? 100;
  return {
    capacityTons: cap,
    regNumber: item.regNumber || known?.regNumber,
    codeNumber: item.codeNumber || known?.codeNumber,
  };
}

/**
 * Ràng buộc bất biến:
 * 1. Mỗi phương tiện (theo id và theo tên chuẩn hóa) chỉ tồn tại DUY NHẤT ở 1 cột.
 * 2. Order trong từng cột được đánh lại liên tục 0, 1, 2...
 */
export function sanitizeBoardState(raw: Partial<VehicleBoardState> | null | undefined): VehicleBoardState {
  if (!raw || !Array.isArray(raw.vehicles)) {
    return {
      vehicles: [],
      updatedAt: new Date().toISOString(),
    };
  }

  const seenIds = new Set<string>();
  const seenNames = new Set<string>();
  const validCols = new Set<string>(VALID_COLUMN_IDS);

  const unique: VehicleItem[] = [];
  for (const item of raw.vehicles) {
    if (!item || typeof item.id !== 'string' || typeof item.name !== 'string') continue;
    const cleanId = item.id.trim();
    const cleanName = normalizeVehicleName(item.name);
    if (!cleanId || !cleanName) continue;
    if (seenIds.has(cleanId) || seenNames.has(cleanName)) continue;

    seenIds.add(cleanId);
    seenNames.add(cleanName);

    const colId: VehicleColumnId = validCols.has(item.columnId as string)
      ? (item.columnId as VehicleColumnId)
      : 'pt_trong';
    const group = item.group === 'nguyen_nguyen' ? 'nguyen_nguyen' : 'external';
    const note = typeof item.note === 'string' && item.note.trim() ? item.note.trim() : undefined;
    const meta = inferCapacityAndMeta(item, cleanName, group);

    unique.push({
      id: cleanId,
      name: cleanName,
      group,
      columnId: colId,
      order: typeof item.order === 'number' && Number.isFinite(item.order) ? item.order : 9999,
      capacityTons: meta.capacityTons,
      ...(meta.regNumber ? { regNumber: meta.regNumber } : {}),
      ...(meta.codeNumber ? { codeNumber: meta.codeNumber } : {}),
      ...(note ? { note } : {}),
    });
  }

  // Đánh lại order liên tục theo từng cột
  const reordered: VehicleItem[] = [];
  for (const col of VALID_COLUMN_IDS) {
    const colItems = unique
      .filter((v) => v.columnId === col)
      .sort((a, b) => a.order - b.order);
    colItems.forEach((v, idx) => {
      reordered.push({ ...v, order: idx });
    });
  }

  return {
    vehicles: reordered,
    updatedAt: typeof raw.updatedAt === 'string' ? raw.updatedAt : new Date().toISOString(),
  };
}

export function createEmptyDailyPlan(date: string): DailyIntakePlan {
  const defaultRows: DailyPlanRow[] = [
    {
      id: `plan-${date}-1`,
      kcs: '',
      supplier: '',
      contractNo: '',
      riceType: '',
      quantityKg: 0,
      pricePerKg: 0,
      location: '',
      note: '',
      vehicleIds: [],
      receiveNote: '',
    },
  ];
  return {
    date,
    rows: defaultRows,
    updatedAt: new Date().toISOString(),
  };
}
