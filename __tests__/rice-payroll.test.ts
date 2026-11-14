import { describe, it, expect } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import { roundRiceTons } from '../lib/rice-payroll/rounding';
import { findAllSubsetsForTarget, reconcileDailyBatches } from '../lib/rice-payroll/subset-sum-matcher';
import { parseRiceMasterExcel, formatExcelDate } from '../lib/rice-payroll/excel-parser';
import { RiceBatch, DailyWorkReportInput } from '../lib/rice-payroll/types';

describe('Rice Payroll: Quy tắc làm tròn số tấn (rounding)', () => {
  it('làm tròn lên khi phần dư >= 333 kg (>= 0.333 tấn)', () => {
    // 50.333 kg -> 51 tấn
    expect(roundRiceTons(50333)).toBe(51);
    // 50.334 kg -> 51 tấn
    expect(roundRiceTons(50334)).toBe(51);
    // 112.670 kg -> 113 tấn (Thực tế từ file mẫu)
    expect(roundRiceTons(112670)).toBe(113);
    // 40.075 kg -> 40 tấn
    expect(roundRiceTons(40075)).toBe(40);
    // 33.110 kg -> 33 tấn
    expect(roundRiceTons(33110)).toBe(33);
  });

  it('làm tròn xuống khi phần dư < 333 kg (< 0.333 tấn)', () => {
    // 50.332 kg -> 50 tấn
    expect(roundRiceTons(50332)).toBe(50);
    // 75.125 kg -> 75 tấn (Thực tế từ file mẫu dòng 1)
    expect(roundRiceTons(75125)).toBe(75);
    // 110.278 kg -> 110 tấn (Thực tế từ file mẫu dòng 2)
    expect(roundRiceTons(110278)).toBe(110);
    // 72.234 kg -> 72 tấn
    expect(roundRiceTons(72234)).toBe(72);
  });

  it('xử lý an toàn các giá trị 0 hoặc không hợp lệ', () => {
    expect(roundRiceTons(0)).toBe(0);
    expect(roundRiceTons(-100)).toBe(0);
    expect(roundRiceTons(NaN)).toBe(0);
  });
});

describe('Rice Payroll: Đọc file Excel Master & trích xuất cột an toàn', () => {
  it('chuẩn hóa định dạng ngày từ Excel', () => {
    expect(formatExcelDate(46023)).toBe('01/01/2026');
    expect(formatExcelDate('2026-09-30')).toBe('30/09/2026');
    expect(formatExcelDate('30/09/2026')).toBe('30/09/2026');
    expect(formatExcelDate('')).toBe('');
    expect(formatExcelDate(null)).toBe('');
  });

  it('đọc thành công file Excel Master thực tế và trích xuất các mẻ lúa', () => {
    const filePath = path.join(__dirname, '../THỊNH_TỔNG SỐ LIỆU NHẬP LÚA TƯƠI 2026.xlsx');
    if (fs.existsSync(filePath)) {
      const buffer = fs.readFileSync(filePath);
      const parsed = parseRiceMasterExcel(buffer, { sheetRows: 50 });

      expect(parsed.batches.length).toBeGreaterThan(0);
      expect(parsed.facilities.length).toBeGreaterThan(0);

      // Kiểm tra 1 mẻ lúa có đầy đủ thông tin cần thiết
      const sample = parsed.batches[0];
      expect(sample.batchCode).toBeDefined();
      expect(sample.dryWeightKg).toBeGreaterThan(0);
      expect(sample.roundedTons).toBe(roundRiceTons(sample.dryWeightKg));
    }
  });
});

describe('Rice Payroll: Thuật toán Subset Sum Ghép Mẻ Lúa', () => {
  const mockBatches: RiceBatch[] = [
    {
      id: 'batch-1',
      batchCode: 'L01',
      customerName: 'Hải Hân',
      vehicleName: 'Ghe 01',
      riceType: 'Japonica',
      dryFacility: 'Cơ sở 1',
      dryDate: '30/09/2026',
      dischargeDate: '30/09/2026',
      dryVehicle: 'NN25',
      dryWeightKg: 68000,
      roundedTons: 68,
    },
    {
      id: 'batch-2',
      batchCode: 'L02',
      customerName: 'Quân Vy',
      vehicleName: 'Ghe 02',
      riceType: 'OM18',
      dryFacility: 'Cơ sở 1',
      dryDate: '30/09/2026',
      dischargeDate: '30/09/2026',
      dryVehicle: 'NN11',
      dryWeightKg: 30000,
      roundedTons: 30,
    },
    {
      id: 'batch-3',
      batchCode: 'L03',
      customerName: 'Út NĐ',
      vehicleName: 'Ghe 03',
      riceType: 'ST25',
      dryFacility: 'Cơ sở 1',
      dryDate: '30/09/2026',
      dischargeDate: '30/09/2026',
      dryVehicle: 'NN06',
      dryWeightKg: 70000,
      roundedTons: 70,
    },
    {
      id: 'batch-4',
      batchCode: 'L04',
      customerName: 'Hải Hân Luyện',
      vehicleName: 'Ghe 04',
      riceType: 'Japonica',
      dryFacility: 'Cơ sở 1',
      dryDate: '30/09/2026',
      dischargeDate: '30/09/2026',
      dryVehicle: 'NN08',
      dryWeightKg: 153000,
      roundedTons: 153,
    },
    {
      id: 'batch-5',
      batchCode: 'L05',
      customerName: 'Hải Hân Luyện',
      vehicleName: 'Ghe 05',
      riceType: 'Japonica',
      dryFacility: 'Cơ sở 1',
      dryDate: '30/09/2026',
      dischargeDate: '30/09/2026',
      dryVehicle: 'NN08',
      dryWeightKg: 100000,
      roundedTons: 100,
    },
  ];

  it('tìm được các tổ hợp mẻ lúa cộng lại bằng đúng 168 tấn', () => {
    const results = findAllSubsetsForTarget(mockBatches, 168);
    expect(results.length).toBeGreaterThan(0);
    for (const subset of results) {
      const sumTons = subset.reduce((s, b) => s + b.roundedTons, 0);
      expect(sumTons).toBe(168);
    }
  });

  it('đối soát hoàn hảo ngày 30/9: Có trở 168 tấn (20k) + Không trở 253 tấn (16k) = 7.408.000đ', () => {
    const report: DailyWorkReportInput = {
      date: '30/09/2026',
      tonsCoTro: 168,
      unitPriceCoTro: 20000,
      tonsKhongTro: 253,
      unitPriceKhongTro: 16000,
    };

    const reconciliation = reconcileDailyBatches(mockBatches, report);

    expect(reconciliation.isMatched).toBe(true);
    expect(reconciliation.amountCoTro).toBe(3360000); // 168 * 20.000
    expect(reconciliation.amountKhongTro).toBe(4048000); // 253 * 16.000
    expect(reconciliation.totalAmount).toBe(7408000); // 7.408.000đ y hệt sổ tay Chú 6 Thanh
    expect(reconciliation.batchesCoTro.reduce((s, b) => s + b.roundedTons, 0)).toBe(168);
    expect(reconciliation.batchesKhongTro.reduce((s, b) => s + b.roundedTons, 0)).toBe(253);
  });

  it('báo lỗi khi số liệu báo lệch so với thực tế các mẻ sấy', () => {
    const invalidReport: DailyWorkReportInput = {
      date: '30/09/2026',
      tonsCoTro: 999, // Không có tổ hợp nào bằng 999 tấn
      unitPriceCoTro: 20000,
      tonsKhongTro: 100,
      unitPriceKhongTro: 16000,
    };

    const reconciliation = reconcileDailyBatches(mockBatches, invalidReport);
    expect(reconciliation.isMatched).toBe(false);
    expect(reconciliation.batchesCoTro).toHaveLength(0);
  });

  it('ở chế độ Cả hai, khi sửa số lượng 1 bên (kể cả xóa tạm về 0), bên còn lại vẫn được bảo toàn nguyên vẹn', () => {
    // Mô phỏng logic handleTonsChange với mode: 'caHai'
    let row = {
      tonsCoTro: 168,
      tonsKhongTro: 253,
      mode: 'caHai' as 'coTro' | 'khongTro' | 'caHai',
    };

    // User sửa số tấn Có trở thành 0 (hoặc xóa để gõ số mới)
    const updateTons = (field: 'coTro' | 'khongTro', val: number) => {
      const currentMode = row.mode ?? 'caHai';
      let newCo = row.tonsCoTro;
      let newKhong = row.tonsKhongTro;

      if (currentMode === 'coTro') {
        newCo = val;
        newKhong = 0;
      } else if (currentMode === 'khongTro') {
        newKhong = val;
        newCo = 0;
      } else {
        // caHai: sửa độc lập
        if (field === 'coTro') newCo = val;
        else newKhong = val;
      }

      row = {
        ...row,
        tonsCoTro: newCo,
        tonsKhongTro: newKhong,
        mode: currentMode,
      };
    };

    // Sửa Có trở về 0
    updateTons('coTro', 0);
    expect(row.tonsCoTro).toBe(0);
    expect(row.tonsKhongTro).toBe(253); // Không bao giờ bị mất!
    expect(row.mode).toBe('caHai');

    // Sau đó gõ số mới vào Có trở
    updateTons('coTro', 150);
    expect(row.tonsCoTro).toBe(150);
    expect(row.tonsKhongTro).toBe(253); // Vẫn giữ nguyên!

    // Sửa Không trở
    updateTons('khongTro', 300);
    expect(row.tonsCoTro).toBe(150);
    expect(row.tonsKhongTro).toBe(300);
  });
});
