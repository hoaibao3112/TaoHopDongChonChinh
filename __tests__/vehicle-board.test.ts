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

describe('Vehicle Dispatch Board (Xếp Phương Tiện & Kế Hoạch Nhận Hàng)', () => {
  it('authenticates DIEUPHOI password into dieuphoi role', () => {
    const res = checkPassword('DIEUPHOI');
    expect(res.isAuthenticated).toBe(true);
    expect(res.role).toBe('dieuphoi');
    expect(res.redirectUrl).toBe('/dieu-phoi-pt');
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
          },
        ],
        updatedAt: new Date().toISOString(),
      },
      state.vehicles
    );
    expect(planBuf.byteLength).toBeGreaterThan(2000);
  });
});
