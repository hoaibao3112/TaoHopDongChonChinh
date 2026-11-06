import { describe, it, expect } from 'vitest';
import { allocateSmartRiceTons } from '@/lib/rice-payroll/smart-round-allocation';
import { RiceBatch } from '@/lib/rice-payroll/types';

describe('Thuật toán phân bổ làm tròn thông minh theo số dư kg thực tế', () => {
  const mockBatches: RiceBatch[] = [
    {
      id: 'batch-1',
      batchCode: 'L01',
      weighDate: '01/09/2026',
      dryDate: '01/09/2026',
      dischargeDate: '01/09/2026',
      dryFacility: 'CƠ SỞ I',
      dryWeightKg: 53324, // Dư 324kg (<333 -> gốc 53t)
      roundedTons: 53,
      customerName: 'KH A',
      vehicleName: 'Ghe 1',
      dryVehicle: 'Ghe 1',
      riceType: 'OM18',
    },
    {
      id: 'batch-2',
      batchCode: 'L02',
      weighDate: '01/09/2026',
      dryDate: '01/09/2026',
      dischargeDate: '01/09/2026',
      dryFacility: 'CƠ SỞ I',
      dryWeightKg: 54542, // Dư 542kg (>=333 -> gốc 55t)
      roundedTons: 55,
      customerName: 'KH B',
      vehicleName: 'Ghe 2',
      dryVehicle: 'Ghe 2',
      riceType: 'OM18',
    },
    {
      id: 'batch-3',
      batchCode: 'L03',
      weighDate: '01/09/2026',
      dryDate: '01/09/2026',
      dischargeDate: '01/09/2026',
      dryFacility: 'CƠ SỞ I',
      dryWeightKg: 55200, // Dư 200kg (<333 -> gốc 55t)
      roundedTons: 55,
      customerName: 'KH C',
      vehicleName: 'Ghe 3',
      dryVehicle: 'Ghe 3',
      riceType: 'OM18',
    },
    {
      id: 'batch-4',
      batchCode: 'L04',
      weighDate: '01/09/2026',
      dryDate: '01/09/2026',
      dischargeDate: '01/09/2026',
      dryFacility: 'CƠ SỞ I',
      dryWeightKg: 60600, // Dư 600kg (>=333 -> gốc 61t)
      roundedTons: 61,
      customerName: 'KH D',
      vehicleName: 'Ghe 4',
      dryVehicle: 'Ghe 4',
      riceType: 'OM18',
    },
  ];

  it('Tổng gốc chuẩn là 224 tấn', () => {
    const res = allocateSmartRiceTons(mockBatches, 224);
    expect(res.originalTotalTons).toBe(224);
    expect(res.delta).toBe(0);
    expect(res.batchAdjustments['batch-1'].adjustedTons).toBe(53);
    expect(res.batchAdjustments['batch-2'].adjustedTons).toBe(55);
    expect(res.batchAdjustments['batch-3'].adjustedTons).toBe(55);
    expect(res.batchAdjustments['batch-4'].adjustedTons).toBe(61);
  });

  it('Điều chỉnh TĂNG +1 tấn (từ 224 lên 225t): Chọn đúng mẻ 53.324kg (dư 324kg cao nhất gần ngưỡng)', () => {
    const res = allocateSmartRiceTons(mockBatches, 225);
    expect(res.delta).toBe(1);

    // Mẻ 1 (53.324kg, dư 324kg) gần ngưỡng 333kg nhất nên được làm tròn lên trước
    expect(res.batchAdjustments['batch-1'].adjustedTons).toBe(54);
    expect(res.batchAdjustments['batch-1'].diff).toBe(1);

    // Các mẻ khác giữ nguyên
    expect(res.batchAdjustments['batch-2'].adjustedTons).toBe(55);
    expect(res.batchAdjustments['batch-3'].adjustedTons).toBe(55);
    expect(res.batchAdjustments['batch-4'].adjustedTons).toBe(61);

    const sum = Object.values(res.batchAdjustments).reduce((s, it) => s + it.adjustedTons, 0);
    expect(sum).toBe(225);
  });

  it('Điều chỉnh TĂNG +2 tấn (từ 224 lên 226t): Chọn lần lượt mẻ 53.324kg rồi đến mẻ 55.200kg', () => {
    const res = allocateSmartRiceTons(mockBatches, 226);
    expect(res.delta).toBe(2);

    expect(res.batchAdjustments['batch-1'].adjustedTons).toBe(54); // +1t
    expect(res.batchAdjustments['batch-3'].adjustedTons).toBe(56); // +1t
    expect(res.batchAdjustments['batch-2'].adjustedTons).toBe(55);
    expect(res.batchAdjustments['batch-4'].adjustedTons).toBe(61);

    const sum = Object.values(res.batchAdjustments).reduce((s, it) => s + it.adjustedTons, 0);
    expect(sum).toBe(226);
  });

  it('Điều chỉnh GIẢM -1 tấn (từ 224 xuống 223t): Chọn mẻ 54.542kg (dư 542kg thấp nhất trong nhóm làm tròn lên)', () => {
    const res = allocateSmartRiceTons(mockBatches, 223);
    expect(res.delta).toBe(-1);

    // Mẻ 2 (54.542kg, dư 542kg) có số dư thấp hơn mẻ 4 (60.600kg, dư 600kg)
    // Đúng như yêu cầu người dùng: "tim cai nao thap vd 54.542 la cai thap nhat cua phan ma ban lam tron len thi cai nay ddc lam tron xuong 54"
    expect(res.batchAdjustments['batch-2'].adjustedTons).toBe(54);
    expect(res.batchAdjustments['batch-2'].diff).toBe(-1);

    expect(res.batchAdjustments['batch-1'].adjustedTons).toBe(53);
    expect(res.batchAdjustments['batch-3'].adjustedTons).toBe(55);
    expect(res.batchAdjustments['batch-4'].adjustedTons).toBe(61);

    const sum = Object.values(res.batchAdjustments).reduce((s, it) => s + it.adjustedTons, 0);
    expect(sum).toBe(223);
  });

  it('Điều chỉnh GIẢM -2 tấn (từ 224 xuống 222t): Chọn lần lượt mẻ 54.542kg rồi đến mẻ 60.600kg', () => {
    const res = allocateSmartRiceTons(mockBatches, 222);
    expect(res.delta).toBe(-2);

    expect(res.batchAdjustments['batch-2'].adjustedTons).toBe(54); // 55 -> 54
    expect(res.batchAdjustments['batch-4'].adjustedTons).toBe(60); // 61 -> 60
    expect(res.batchAdjustments['batch-1'].adjustedTons).toBe(53);
    expect(res.batchAdjustments['batch-3'].adjustedTons).toBe(55);

    const sum = Object.values(res.batchAdjustments).reduce((s, it) => s + it.adjustedTons, 0);
    expect(sum).toBe(222);
  });
});
