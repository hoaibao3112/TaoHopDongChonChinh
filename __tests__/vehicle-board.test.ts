import { describe, it, expect } from 'vitest';
import { checkPassword } from '../lib/auth';
import {
  createDefaultVehicleBoardState,
  getEffectiveCapacityRange,
  sanitizeBoardState,
  VEHICLE_COLUMNS,
} from '../lib/vehicle-board/defaults';
import { buildVehicleBoardExcelBuffer } from '../lib/vehicle-board/export-excel';
import { buildDailyPlanExcelBuffer } from '../lib/vehicle-board/export-plan-excel';
import { parseDailyPlanFromExcelPaste } from '../lib/vehicle-board/parse-plan-tsv';

describe('Vehicle Dispatch Board (Xếp Phương Tiện & Kế Hoạch Nhận Hàng)', () => {
  it('authenticates chonchinh password into dangtai role and hoaibao into full admin role', () => {
    const res = checkPassword('chonchinh');
    expect(res.isAuthenticated).toBe(true);
    expect(res.role).toBe('dangtai');

    const adminRes = checkPassword('hoaibao');
    expect(adminRes.isAuthenticated).toBe(true);
    expect(adminRes.role).toBe('admin');
  });

  it('seeds 25 Nguyen Nguyen + 19 external vehicles with exact capacities and zero duplicates', () => {
    const state = createDefaultVehicleBoardState();
    expect(VEHICLE_COLUMNS).toHaveLength(6);

    const nn = state.vehicles.filter((v) => v.group === 'nguyen_nguyen');
    const ext = state.vehicles.filter((v) => v.group === 'external');
    expect(nn).toHaveLength(25);
    expect(ext).toHaveLength(19);
    expect(state.vehicles).toHaveLength(44);

    const byName = new Map(state.vehicles.map((v) => [v.name, v]));
    expect(byName.get('NGUYÊN NGUYÊN 01')?.capacityTons).toBe(105);
    expect(byName.get('NGUYÊN NGUYÊN 04')?.capacityTons).toBe(195);
    expect(byName.get('NGUYÊN NGUYÊN 16')?.capacityTons).toBe(200);
    expect(byName.get('NGUYÊN NGUYÊN 20')?.capacityTons).toBe(200);
    expect(byName.get('NGUYÊN NGUYÊN 18')?.capacityTons).toBe(200);
    expect(byName.get('NGUYÊN NGUYÊN 15')?.capacityTons).toBe(150);

    expect(byName.get('PHƯƠNG GẤM')?.capacityTons).toBe(50);
    expect(byName.get('GHE LỘC')?.capacityTons).toBe(150);
    expect(byName.get('GHE HẢO')?.capacityTons).toBe(130);

    const eff150 = getEffectiveCapacityRange(150);
    expect(eff150.minTons).toBe(120);
    expect(eff150.maxTons).toBe(128);

    const uniqueNames = new Set(state.vehicles.map((v) => v.name));
    expect(uniqueNames.size).toBe(44);
  });

  it('enforces single-location constraint when duplicate vehicles are provided', () => {
    const sanitized = sanitizeBoardState({
      vehicles: [
        { id: 'nn-01', name: 'NGUYÊN NGUYÊN 01', group: 'nguyen_nguyen', columnId: 'pt_trong', order: 0 },
        { id: 'nn-01-dup', name: 'NGUYÊN NGUYÊN 01', group: 'nguyen_nguyen', columnId: 'pt_cho', order: 0 },
        { id: 'ext-1', name: 'TÀU LỢI', group: 'external', columnId: 'pt_nhan_lua_kho', order: 0 },
      ],
    });
    expect(sanitized.vehicles).toHaveLength(2);
    expect(sanitized.vehicles.find((v) => v.name === 'NGUYÊN NGUYÊN 01')?.columnId).toBe('pt_trong');
  });

  it('exports valid Excel buffers for both 6-column board and daily plan', async () => {
    const state = createDefaultVehicleBoardState();
    const boardBuf = await buildVehicleBoardExcelBuffer(state);
    expect(boardBuf.byteLength).toBeGreaterThan(2000);

    const planBuf = await buildDailyPlanExcelBuffer(
      {
        date: '2026-11-27',
        rows: [
          {
            id: 'r1',
            kcs: 'THỨC',
            supplier: 'HẰNG MỸ PHƯỚC TÂY',
            contractNo: '03 Vụ Hè Thu',
            riceType: 'NẾP KHÔ',
            quantityKg: 180000,
            pricePerKg: 7720,
            location: 'KÊNH NGUYỄN VĂN TIẾP',
            note: '',
            vehicleIds: ['nn-18'],
            receiveNote: 'Chờ lấy mẫu KCS',
          },
        ],
        updatedAt: new Date().toISOString(),
      },
      state.vehicles
    );
    expect(planBuf.byteLength).toBeGreaterThan(2000);
  });

  it('parses multiline Excel TSV paste data accurately', () => {
    const sampleTsv = [
      'STT\tKCS\tNHÀ CUNG CẤP\tSỐ HĐ\tLOẠI LÚA\t SỐ LƯỢNG (KG)\t GIÁ HẾT PHÍ \t THÀNH TIỀN\tĐỊA ĐIỂM\tGHI CHÚ',
      '1\tTHỨC\tĐÔN MỸ PHƯỚC TÂY\t" 03+04\n Vụ Hè Thu"\tNẾP KHÔ\t  220.000   \t  7.770   \t  1.709.400.000   \tKÊNH 12, MỸ PHƯỚC TÂY, ĐỒNG THÁP\t',
      '3\tNHÂN \tNGA MỸ PHƯỚC TÂY\t" 01\n Vụ Hè Thu"\tOM18 KHÔ\t  125.000   \t  8.720   \t  1.090.000.000   \t"KÊNH NGUYỄN VĂN TIẾP, TÂN HỘI MỸ PHƯỚC TÂY,\n ĐỒNG THÁP"\t',
      '9\tMINH\t\t\t\t\t\t\t\tTRỰC CÔNG TY',
      'TỔNG CỘNG:\t\t\t\t\t  345.000   \t\t  2.799.400.000   \t\t',
    ].join('\n');

    const rows = parseDailyPlanFromExcelPaste(sampleTsv, '2026-11-28');
    expect(rows).toHaveLength(3);
    expect(rows[0].kcs).toBe('THỨC');
    expect(rows[0].contractNo).toBe('03+04 Vụ Hè Thu');
    expect(rows[0].quantityKg).toBe(220000);
    expect(rows[0].pricePerKg).toBe(7770);
    expect(rows[1].location).toBe('KÊNH NGUYỄN VĂN TIẾP, TÂN HỘI MỸ PHƯỚC TÂY, ĐỒNG THÁP');
    expect(rows[2].kcs).toBe('MINH');
    expect(rows[2].note).toBe('TRỰC CÔNG TY');
  });

  it('inherits previous date board and plan for next day without mutating previous day', async () => {
    const fs = await import('fs');
    const path = await import('path');
    const {
      getVehicleBoardState,
      saveVehicleBoardState,
      getDailyIntakePlan,
      saveDailyIntakePlan,
    } = await import('../lib/vehicle-board/store');

    const d1 = '2099-01-10';
    const d2 = '2099-01-11';
    const boardF1 = path.join(process.cwd(), 'data', 'vehicle-board', `board-${d1}.json`);
    const boardF2 = path.join(process.cwd(), 'data', 'vehicle-board', `board-${d2}.json`);
    const planF1 = path.join(process.cwd(), 'data', 'vehicle-board', 'plans', `${d1}.json`);
    const planF2 = path.join(process.cwd(), 'data', 'vehicle-board', 'plans', `${d2}.json`);

    try {
      const base = createDefaultVehicleBoardState();
      const movedBase = {
        ...base,
        vehicles: base.vehicles.map((v) =>
          v.id === 'nn-01' ? { ...v, columnId: 'pt_nhan_lua_kho' as const } : v
        ),
      };
      await saveVehicleBoardState(movedBase, d1);

      // Ngày sau d2 chưa có dữ liệu -> tự động lấy từ d1
      const loadedD2 = await getVehicleBoardState(d2);
      expect(loadedD2.inheritedFromDate).toBe(d1);
      expect(loadedD2.vehicles.find((v) => v.id === 'nn-01')?.columnId).toBe('pt_nhan_lua_kho');

      // Sửa d2 sang pt_tang_bo -> d1 vẫn giữ nguyên pt_nhan_lua_kho
      await saveVehicleBoardState(
        {
          ...loadedD2,
          vehicles: loadedD2.vehicles.map((v) =>
            v.id === 'nn-01' ? { ...v, columnId: 'pt_tang_bo' as const } : v
          ),
        },
        d2
      );
      const checkD1 = await getVehicleBoardState(d1);
      const checkD2 = await getVehicleBoardState(d2);
      expect(checkD1.vehicles.find((v) => v.id === 'nn-01')?.columnId).toBe('pt_nhan_lua_kho');
      expect(checkD2.vehicles.find((v) => v.id === 'nn-01')?.columnId).toBe('pt_tang_bo');

      // Tương tự cho Kế Hoạch Nhận Hàng
      await saveDailyIntakePlan({
        date: d1,
        rows: [
          {
            id: 'r1',
            kcs: 'THỨC',
            supplier: 'NCC CŨ',
            contractNo: '01',
            riceType: 'NẾP KHÔ',
            quantityKg: 100000,
            pricePerKg: 7500,
            location: 'ĐỒNG THÁP',
            note: '',
            vehicleIds: ['nn-01'],
          },
        ],
        updatedAt: new Date().toISOString(),
      });

      const planD2 = await getDailyIntakePlan(d2);
      expect(planD2.inheritedFromDate).toBe(d1);
      expect(planD2.plan.rows[0].supplier).toBe('NCC CŨ');
    } finally {
      [boardF1, boardF2, planF1, planF2].forEach((f) => {
        if (fs.existsSync(f)) fs.unlinkSync(f);
      });
    }
  });
});
