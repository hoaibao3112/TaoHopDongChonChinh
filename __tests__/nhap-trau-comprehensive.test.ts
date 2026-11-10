import { describe, it, expect } from 'vitest';
import ExcelJS from 'exceljs';
import {
  expandSumFormulaRange,
  shiftFormulaRows,
  updateSubtotalLastRow,
  updateAutoFilterRange,
  extractRangesFromFormula,
} from '@/lib/nhap-trau/formulaUpdater';
import {
  validateShipmentEntry,
  validateBatchEntries,
  normalizeVehicleName,
  normalizeDate,
} from '@/lib/nhap-trau/validator';
import { writeShipments } from '@/lib/nhap-trau/excelWriter';
import { extractWorkbookMetadata } from '@/lib/nhap-trau/excelReader';
import type { ShipmentEntry, WorkbookMetadata } from '@/lib/nhap-trau/types';

describe('1. Kiểm tra Công thức & Phạm vi Excel (Formula Updater)', () => {
  it('Trích xuất dải ô chính xác từ công thức SUM đơn, kép và có prefix', () => {
    // Đơn
    const r1 = extractRangesFromFormula('SUM(E450:E471)');
    expect(r1).toHaveLength(1);
    expect(r1[0].parsed).toEqual({
      sheetPrefix: undefined,
      colStart: 'E',
      rowStart: 450,
      colEnd: 'E',
      rowEnd: 471,
    });

    // Kép (như CẨM THANH XUÂN)
    const r2 = extractRangesFromFormula('SUM(E23:E41)+SUM(F23:F41)');
    expect(r2).toHaveLength(2);
    expect(r2[0].parsed.rowEnd).toBe(41);
    expect(r2[1].parsed.rowEnd).toBe(41);

    // Có Sheet Prefix (như GIANG THANH BÌNH)
    const r3 = extractRangesFromFormula("SUM('GIANG THANH BÌNH '!F102:F112)");
    expect(r3).toHaveLength(1);
    expect(r3[0].parsed.colStart).toBe('F');
    expect(r3[0].parsed.rowStart).toBe(102);
    expect(r3[0].parsed.rowEnd).toBe(112);
  });

  it('Mở rộng SUM đơn khi chèn 1 dòng hoặc nhiều dòng', () => {
    expect(expandSumFormulaRange('SUM(E450:E471)', 471, 1)).toBe('SUM(E450:E472)');
    expect(expandSumFormulaRange('SUM(E450:E471)', 471, 5)).toBe('SUM(E450:E476)');
  });

  it('Mở rộng công thức SUM kép (như CẨM THANH XUÂN)', () => {
    const formula = 'SUM(E23:E41)+SUM(F23:F41)';
    const updated = expandSumFormulaRange(formula, 41, 2);
    expect(updated).toBe('SUM(E23:E43)+SUM(F23:F43)');
  });

  it('Mở rộng công thức SUM có sheet prefix (như GIANG THANH BÌNH)', () => {
    const formula = "SUM('GIANG THANH BÌNH '!F102:F112)";
    const updated = expandSumFormulaRange(formula, 112, 1);
    expect(updated).toBe("SUM('GIANG THANH BÌNH '!F102:F113)");
  });

  it('Dời dòng (Shift) các công thức SUM của hợp đồng nằm bên dưới', () => {
    // HĐ dưới bắt đầu từ dòng 302 đến 449, khi chèn 2 dòng tại dòng 250 -> dời thành 304 đến 451
    expect(shiftFormulaRows('SUM(E302:E449)', 250, 2)).toBe('SUM(E304:E451)');
    // Nếu vị trí chèn sau đó (vd 500) -> không đổi
    expect(shiftFormulaRows('SUM(E302:E449)', 500, 2)).toBe('SUM(E302:E449)');
  });

  it('Mở rộng SUBTOTAL trong Xuat Trấu Cty khi dữ liệu vượt dải ban đầu', () => {
    const formula = 'SUBTOTAL(109,D4:D3679)';
    expect(updateSubtotalLastRow(formula, 3698)).toBe('SUBTOTAL(109,D4:D3698)');
    // Không thu hẹp nếu nhỏ hơn
    expect(updateSubtotalLastRow(formula, 3500)).toBe('SUBTOTAL(109,D4:D3679)');
  });

  it('Mở rộng AutoFilter khi dòng dữ liệu vượt quá', () => {
    expect(updateAutoFilterRange('A3:K3680', 3698)).toBe('A3:K3698');
    expect(updateAutoFilterRange('A3:K3680', 3600)).toBe('A3:K3680');
  });
});

describe('2. Kiểm tra Xác thực & Cảnh báo (Validator Edge Cases)', () => {
  const mockMeta: WorkbookMetadata = {
    fileName: 'test.xlsx',
    totalSheets: 3,
    mainSheetLastRow: 100,
    customers: ['CHỊ BÉ BẢY'],
    vehicles: [],
    customerSheets: [
      {
        sheetName: 'CHỊ 7 (CTC)',
        customerName: 'CHỊ BÉ BẢY',
        state: 'visible',
        headerRow: 7,
        dataStartRow: 8,
        colDate: 'B',
        colVehicle: 'C',
        colXe: 'E',
        colGhe: 'F',
        contracts: [
          {
            row: 6,
            label: 'HĐ Nhận xe 15/09/2026',
            slKg: 500000,
            colSoLuong: 'E',
            sumCell: 'F6',
            sumRange: 'E450:E471',
            dataRowStart: 450,
            dataRowEnd: 471,
            remainingKg: 20000,
          },
        ],
      },
    ],
    existingMainEntries: [
      {
        date: '2026-11-09',
        vehicleName: '63H-02309',
        customer: 'CHỊ BÉ BẢY',
      },
    ],
  };

  const validSample: ShipmentEntry = {
    id: 'e1',
    date: '2026-11-10',
    team: 'ĐỨC',
    vehicleName: '63C-12345',
    type: 'Xe',
    weightKg: 6500,
    customer: 'CHỊ BÉ BẢY',
    targetSheetName: 'CHỊ 7 (CTC)',
    contractRow: 6,
    note: 'HĐ',
  };

  it('Chặn: Thiếu hoặc sai định dạng ngày', () => {
    const resEmpty = validateShipmentEntry({ ...validSample, date: '' }, 0, [validSample], mockMeta);
    expect(resEmpty.isValid).toBe(false);
    expect(resEmpty.errors.some((e) => e.field === 'date')).toBe(true);

    const resInvalid = validateShipmentEntry({ ...validSample, date: 'ngay-khong-dung' }, 0, [validSample], mockMeta);
    expect(resInvalid.isValid).toBe(false);
  });

  it('Chặn: Số kg <= 0 hoặc không hợp lệ', () => {
    const resZero = validateShipmentEntry({ ...validSample, weightKg: 0 }, 0, [validSample], mockMeta);
    expect(resZero.isValid).toBe(false);

    const resNeg = validateShipmentEntry({ ...validSample, weightKg: -500 }, 0, [validSample], mockMeta);
    expect(resNeg.isValid).toBe(false);
  });

  it('Chặn: Thiếu đội xuất hoặc tên phương tiện', () => {
    const resNoTeam = validateShipmentEntry({ ...validSample, team: '  ' }, 0, [validSample], mockMeta);
    expect(resNoTeam.isValid).toBe(false);

    const resNoVeh = validateShipmentEntry({ ...validSample, vehicleName: '' }, 0, [validSample], mockMeta);
    expect(resNoVeh.isValid).toBe(false);
  });

  it('Chặn: Tab khách không tồn tại trong workbook', () => {
    const resNoTab = validateShipmentEntry(
      { ...validSample, targetSheetName: 'TAB_AO_123' },
      0,
      [validSample],
      mockMeta
    );
    expect(resNoTab.isValid).toBe(false);
    expect(resNoTab.errors.some((e) => e.field === 'targetSheetName')).toBe(true);
  });

  it('Chặn: Chưa chọn hợp đồng khi tab có danh sách HĐ', () => {
    const resNoContract = validateShipmentEntry(
      { ...validSample, contractRow: undefined },
      0,
      [validSample],
      mockMeta
    );
    expect(resNoContract.isValid).toBe(false);
    expect(resNoContract.errors.some((e) => e.field === 'contractRow')).toBe(true);
  });

  it('Cảnh báo: Trùng số xe trong cùng một ngày (trong cùng batch nhập)', () => {
    const e1 = { ...validSample, id: '1', vehicleName: '63C-99999', date: '2026-11-10' };
    const e2 = { ...validSample, id: '2', vehicleName: '63C 99999', date: '2026-11-10' }; // Trùng xe khác định dạng space
    const res = validateShipmentEntry(e2, 1, [e1, e2], mockMeta);
    expect(res.isValid).toBe(true); // Không chặn
    expect(res.warnings.some((w) => w.field === 'vehicleName')).toBe(true);
  });

  it('Cảnh báo: Trùng số xe với dữ liệu lịch sử trong Sổ tổng', () => {
    // Sổ tổng ngày 2026-11-09 đã có xe 63H-02309
    const eHistoryDup = { ...validSample, date: '2026-11-09', vehicleName: '63H02309' };
    const res = validateShipmentEntry(eHistoryDup, 0, [eHistoryDup], mockMeta);
    expect(res.isValid).toBe(true);
    expect(res.warnings.some((w) => w.field === 'vehicleName')).toBe(true);
  });

  it('Cảnh báo: Số kg vượt quá tồn còn lại của HĐ', () => {
    // HĐ chỉ còn tồn 20.000 kg, nhập 25.000 kg
    const eOver = { ...validSample, weightKg: 25000 };
    const res = validateShipmentEntry(eOver, 0, [eOver], mockMeta);
    expect(res.isValid).toBe(true);
    expect(res.warnings.some((w) => w.field === 'weightKg')).toBe(true);
  });

  it('Cảnh báo: Khối lượng quá nhỏ (< 500kg) hoặc quá lớn (> 60.000kg)', () => {
    const eSmall = { ...validSample, weightKg: 200 };
    const resSmall = validateShipmentEntry(eSmall, 0, [eSmall], mockMeta);
    expect(resSmall.isValid).toBe(true);
    expect(resSmall.warnings.some((w) => w.field === 'weightKg')).toBe(true);

    const eBig = { ...validSample, weightKg: 75000 };
    const resBig = validateShipmentEntry(eBig, 0, [eBig], mockMeta);
    expect(resBig.isValid).toBe(true);
    expect(resBig.warnings.some((w) => w.field === 'weightKg')).toBe(true);
  });
});

describe('3. Kiểm tra Ghi Excel Toàn Diện (Excel Engine End-to-End)', () => {
  async function buildTestWorkbook(): Promise<ExcelJS.Workbook> {
    const wb = new ExcelJS.Workbook();

    // Sheet 1: Xuat Trấu Cty (Sổ tổng)
    const mainWs = wb.addWorksheet('Xuat Trấu Cty');
    mainWs.getCell('D2').value = { formula: 'SUBTOTAL(109,D4:D10)' };
    mainWs.getCell('E2').value = { formula: 'SUBTOTAL(109,E4:E10)' };
    mainWs.getCell('F2').value = { formula: 'SUBTOTAL(109,F4:F10)' };
    mainWs.getCell('G2').value = { formula: 'SUBTOTAL(109,G4:G10)' };
    mainWs.autoFilter = 'A3:K10';

    // Header row 3
    mainWs.getRow(3).values = [
      null, 'Ngày', 'Đội', 'Phương tiện', 'Xuất Xe', 'Xuất Ghe', 'Tổng', 'Tiền công', 'Khách hàng', 'Ghi chú',
    ];

    // Dòng dữ liệu mẫu row 4
    const r4 = mainWs.getRow(4);
    r4.getCell('A').value = new Date('2026-11-08');
    r4.getCell('B').value = 'ĐỨC';
    r4.getCell('C').value = '63C-11111';
    r4.getCell('D').value = 5000;
    r4.getCell('E').value = 0;
    r4.getCell('F').value = { formula: 'E4+D4' };
    r4.getCell('G').value = { formula: '(D4*11)+(E4*7)' };
    r4.getCell('H').value = 'CHỊ BÉ BẢY';
    r4.getCell('I').value = 'HĐ';
    r4.commit();

    // Sheet 2: CHỊ 7 (CTC) có 2 hợp đồng phân tầng
    const custWs = wb.addWorksheet('CHỊ 7 (CTC)');
    // HĐ 1 (row 3): data từ 10 đến 12
    custWs.getCell('B3').value = 'HĐ 01/10/2026';
    custWs.getCell('D3').value = 500000;
    custWs.getCell('F3').value = { formula: 'SUM(E10:E12)' };

    // HĐ 2 (row 4): data từ 13 đến 15
    custWs.getCell('B4').value = 'HĐ 15/10/2026';
    custWs.getCell('D4').value = 300000;
    custWs.getCell('F4').value = { formula: 'SUM(E13:E15)' };

    for (let r = 10; r <= 12; r++) {
      const row = custWs.getRow(r);
      row.getCell('A').value = r - 9;
      row.getCell('B').value = new Date('2026-10-01');
      row.getCell('C').value = `63C-000${r}`;
      row.getCell('D').value = 'HĐ';
      row.getCell('E').value = 5000;
      row.commit();
    }

    for (let r = 13; r <= 15; r++) {
      const row = custWs.getRow(r);
      row.getCell('A').value = r - 12;
      row.getCell('B').value = new Date('2026-10-15');
      row.getCell('C').value = `63C-000${r}`;
      row.getCell('D').value = 'HĐ';
      row.getCell('E').value = 6000;
      row.commit();
    }

    // Sheet 3: A TIẾN (MỚI) dùng cột F cho số lượng
    const tienWs = wb.addWorksheet('A TIẾN  ( MỚI ) ');
    tienWs.getCell('B3').value = 'HĐ TIẾN 09/10/2026';
    tienWs.getCell('D3').value = 200000;
    tienWs.getCell('F3').value = { formula: 'SUM(F6:F8)' };

    for (let r = 6; r <= 8; r++) {
      const row = tienWs.getRow(r);
      row.getCell('B').value = new Date('2026-10-09');
      row.getCell('C').value = `63C-222${r}`;
      row.getCell('F').value = 7000; // Cột F
      row.commit();
    }

    return wb;
  }

  it('Ghi Xe (11đ) và Ghe (7đ) vào Sổ tổng: đúng cột, đúng công thức F & G', async () => {
    const wb = await buildTestWorkbook();
    const meta = extractWorkbookMetadata(wb);

    const batch: ShipmentEntry[] = [
      {
        id: '1',
        date: '2026-11-10',
        team: 'ĐỨC',
        vehicleName: '63H-02309',
        type: 'Xe',
        weightKg: 6510,
        customer: 'CHỊ BÉ BẢY',
        targetSheetName: 'CHỊ 7 (CTC)',
        contractRow: 3,
        note: 'HĐ',
      },
      {
        id: '2',
        date: '2026-11-10',
        team: 'ĐỨC',
        vehicleName: 'Ghe Được Phường',
        type: 'Ghe',
        weightKg: 14400,
        customer: 'CHỊ BÉ BẢY',
        targetSheetName: 'CHỊ 7 (CTC)',
        contractRow: 3,
        note: 'Cơ Sở 1',
      },
    ];

    const res = await writeShipments(wb, batch, meta);
    expect(res.success).toBe(true);

    const mainWs = wb.getWorksheet('Xuat Trấu Cty')!;
    // Dòng 5: Xe 6510kg
    const r5 = mainWs.getRow(5);
    expect(r5.getCell('D').value).toBe(6510);
    expect(r5.getCell('E').value).toBe(0);
    expect((r5.getCell('F').value as { formula: string }).formula).toBe('E5+D5');
    expect((r5.getCell('G').value as { formula: string }).formula).toBe('(D5*11)+(E5*7)');
    expect(r5.getCell('H').value).toBe('CHỊ BÉ BẢY');

    // Dòng 6: Ghe 14400kg
    const r6 = mainWs.getRow(6);
    expect(r6.getCell('D').value).toBe(0);
    expect(r6.getCell('E').value).toBe(14400);
    expect((r6.getCell('F').value as { formula: string }).formula).toBe('E6+D6');
    expect((r6.getCell('G').value as { formula: string }).formula).toBe('(D6*11)+(E6*7)');
    expect(r6.getCell('I').value).toBe('Cơ Sở 1');
  });

  it('Ghi vào Tab dùng cột F (như A TIẾN): số kg phải ghi đúng cột F', async () => {
    const wb = await buildTestWorkbook();
    const meta = extractWorkbookMetadata(wb);

    const batch: ShipmentEntry[] = [
      {
        id: '1',
        date: '2026-11-10',
        team: 'ĐỨC',
        vehicleName: '63C-99999',
        type: 'Xe',
        weightKg: 8000,
        customer: 'TIẾN CÁI BÈ (mới)',
        targetSheetName: 'A TIẾN  ( MỚI ) ',
        contractRow: 3,
        note: 'HĐ',
      },
    ];

    await writeShipments(wb, batch, meta);

    const tienWs = wb.getWorksheet('A TIẾN  ( MỚI ) ')!;
    // Dòng mới chèn vào vị trí 9
    const r9 = tienWs.getRow(9);
    expect(r9.getCell('C').value).toBe('63C-99999');
    expect(r9.getCell('F').value).toBe(8000); // Ghi đúng cột F
    // Công thức F3 ban đầu SUM(F6:F8) -> mở rộng thành SUM(F6:F9)
    const f3 = (tienWs.getCell('F3').value as { formula: string }).formula;
    expect(f3).toBe('SUM(F6:F9)');
  });

  it('Chèn đồng thời vào 2 hợp đồng khác nhau trong cùng 1 sheet: không bị lệch dòng', async () => {
    const wb = await buildTestWorkbook();
    const meta = extractWorkbookMetadata(wb);

    // Thêm 1 phiếu vào HĐ 1 (row 3, dải gốc E10:E12)
    // Và 1 phiếu vào HĐ 2 (row 4, dải gốc E13:E15)
    const batch: ShipmentEntry[] = [
      {
        id: '1',
        date: '2026-11-10',
        team: 'ĐỨC',
        vehicleName: 'Xe HĐ 1',
        type: 'Xe',
        weightKg: 5000,
        customer: 'CHỊ BÉ BẢY',
        targetSheetName: 'CHỊ 7 (CTC)',
        contractRow: 3,
        note: 'HĐ',
      },
      {
        id: '2',
        date: '2026-11-10',
        team: 'ĐỨC',
        vehicleName: 'Xe HĐ 2',
        type: 'Xe',
        weightKg: 6000,
        customer: 'CHỊ BÉ BẢY',
        targetSheetName: 'CHỊ 7 (CTC)',
        contractRow: 4,
        note: 'HĐ',
      },
    ];

    await writeShipments(wb, batch, meta);

    const custWs = wb.getWorksheet('CHỊ 7 (CTC)')!;

    // HĐ 1: Ban đầu E10:E12 -> thêm 1 dòng -> E10:E13
    const f3 = (custWs.getCell('F3').value as { formula: string }).formula;
    expect(f3).toBe('SUM(E10:E13)');

    // HĐ 2: Nằm dưới HĐ 1 nên bị đẩy 1 dòng (E13:E15 -> E14:E16), đồng thời HĐ 2 cũng được thêm 1 dòng -> E14:E17
    const f4 = (custWs.getCell('F4').value as { formula: string }).formula;
    expect(f4).toBe('SUM(E14:E17)');
  });

  it('Tính nguyên tử (All or Nothing): 1 phiếu lỗi -> ném Error và không ghi bất kỳ dòng nào', async () => {
    const wb = await buildTestWorkbook();
    const meta = extractWorkbookMetadata(wb);

    const batchWithBadEntry: ShipmentEntry[] = [
      {
        id: '1',
        date: '2026-11-10',
        team: 'ĐỨC',
        vehicleName: '63H-02309',
        type: 'Xe',
        weightKg: 6510,
        customer: 'CHỊ BÉ BẢY',
        targetSheetName: 'CHỊ 7 (CTC)',
        contractRow: 3,
        note: 'HĐ',
      },
      {
        id: '2',
        date: '2026-11-10',
        team: 'ĐỨC',
        vehicleName: 'Xe Sai',
        type: 'Xe',
        weightKg: -500, // LỖI
        customer: 'CHỊ BÉ BẢY',
        targetSheetName: 'CHỊ 7 (CTC)',
        contractRow: 3,
        note: 'HĐ',
      },
    ];

    await expect(writeShipments(wb, batchWithBadEntry, meta)).rejects.toThrow(/Phiếu số 2 lỗi/);

    // Xác nhận không có dòng 5 nào được ghi vào Sổ tổng
    const mainWs = wb.getWorksheet('Xuat Trấu Cty')!;
    expect(mainWs.getRow(5).getCell('A').value).toBeNull();
  });
});
