import { describe, it, expect } from 'vitest';
import ExcelJS from 'exceljs';
import { calculateHuskTons } from '../lib/husk/tonnage';
import { parseVehicle, formatWorkDescription } from '../lib/husk/plate';
import { groupSlipsIfEnabled } from '../lib/husk/merger';
import { validateSlipItem } from '../lib/husk/validator';
import { writeHuskRowsToExcel } from '../lib/excel/writer';
import { ScannedSlipItem } from '../lib/husk/types';

describe('1. Kiểm tra tính Tấn Trấu (Cắt xuống 1 số thập phân, không làm tròn)', () => {
  it('cắt xuống đúng 1 chữ số thập phân cho các trường hợp mẫu', () => {
    expect(calculateHuskTons(6840)).toBe(6.8);
    expect(calculateHuskTons(7670)).toBe(7.6);
    expect(calculateHuskTons(6510)).toBe(6.5);
    expect(calculateHuskTons(6590)).toBe(6.5);
    expect(calculateHuskTons(6599)).toBe(6.5);
    expect(calculateHuskTons(7000)).toBe(7.0);
    expect(calculateHuskTons(0)).toBe(0);
    expect(calculateHuskTons(-100)).toBe(0);
  });
});

describe('2. Kiểm tra chuẩn hóa Biển Số & Phân biệt Xe / Ghe', () => {
  it('nhận diện xe tải và chuẩn hóa biển số có khoảng trắng', () => {
    const xe1 = parseVehicle('63H-02309');
    expect(xe1.isTruck).toBe(true);
    expect(xe1.normalized).toBe('63H 02309');

    const xe2 = parseVehicle('63C23620');
    expect(xe2.isTruck).toBe(true);
    expect(xe2.normalized).toBe('63C 23620');
  });

  it('nhận diện tên ghe (không phải biển số)', () => {
    const ghe1 = parseVehicle('Được Phường');
    expect(ghe1.isTruck).toBe(false);
    expect(ghe1.normalized).toBe('Được Phường');

    const ghe2 = parseVehicle('Tàu Lợi');
    expect(ghe2.isTruck).toBe(false);
    expect(ghe2.normalized).toBe('Tàu Lợi');
  });

  it('tạo đúng câu mô tả công việc (Cột D)', () => {
    const descXe = formatWorkDescription('63H-02309', 'Chị 7');
    expect(descXe).toBe('Xuất một xe trấu 63H 02309 của chị 7');

    const descGhe = formatWorkDescription('Được Phường', 'Chị 7');
    expect(descGhe).toBe('Xuất một ghe trấu Được Phường của chị 7');

    const descGop = formatWorkDescription('63H-02309', 'Chị 7', 2);
    expect(descGop).toBe('Xuất 2 chuyến trấu 63H 02309 của chị 7');
  });
});

describe('3. Kiểm tra Validate & Cảnh Báo Phiếu Cân', () => {
  const validBase = {
    id: 'slip-1',
    fileName: 'phieu1.jpg',
    customer: 'Chị 7',
    vehicle: '63H-02309',
    productType: 'Trấu',
    direction: 'Xuất',
    date: '09/11/2026',
    weightGrossKg: 14400,
    weightTareKg: 7890,
    weightNetKg: 6510,
    tons: 6.5,
    unitPrice: 11000,
    amount: 71500,
    description: 'Xuất một xe trấu 63H 02309 của chị 7',
  };

  it('phiếu hợp lệ: không có cảnh báo và được tick sẵn Ghi', () => {
    const res = validateSlipItem(validBase);
    expect(res.warnings).toHaveLength(0);
    expect(res.selected).toBe(true);
  });

  it('cảnh báo khi cân lệch (xe+hàng - xe ≠ hàng)', () => {
    const lệch = { ...validBase, weightGrossKg: 14400, weightTareKg: 7890, weightNetKg: 6000 };
    const res = validateSlipItem(lệch);
    expect(res.warnings.some((w) => w.includes('Cân lệch'))).toBe(true);
    expect(res.selected).toBe(false);
  });

  it('cảnh báo khi loại hàng không phải Trấu', () => {
    const khacTrau = { ...validBase, productType: 'Gạo lứt' };
    const res = validateSlipItem(khacTrau);
    expect(res.warnings.some((w) => w.includes('không phải trấu'))).toBe(true);
    expect(res.selected).toBe(false);
  });

  it('cảnh báo khi hướng cân là Nhập', () => {
    const nhap = { ...validBase, direction: 'Nhập' };
    const res = validateSlipItem(nhap);
    expect(res.warnings.some((w) => w.includes('Không phải phiếu xuất'))).toBe(true);
    expect(res.selected).toBe(false);
  });

  it('cảnh báo khi trùng với dòng đã có trong Excel', () => {
    const existing = [
      {
        stt: 9,
        rowNumber: 15,
        dateStr: '09/11/2026',
        team: 'ĐỨC',
        description: 'Xuất một xe trấu 63H 02309 của chị 7',
        weightKg: 6510,
      },
    ];
    const res = validateSlipItem(validBase, existing);
    expect(res.isDuplicateExisting).toBe(true);
    expect(res.warnings.some((w) => w.includes('ĐÃ CÓ TRONG EXCEL'))).toBe(true);
    expect(res.selected).toBe(false);
  });
});

describe('4. Kiểm tra Gộp Phiếu Cùng Ngày + Xe + Khách', () => {
  const slipA: ScannedSlipItem = {
    id: 's1',
    fileName: '1.jpg',
    selected: true,
    customer: 'Chị 7',
    vehicle: '63H-02309',
    productType: 'Trấu',
    direction: 'Xuất',
    date: '09/11/2026',
    weightGrossKg: 14400,
    weightTareKg: 7890,
    weightNetKg: 6510,
    tons: 6.5,
    unitPrice: 11000,
    amount: 71500,
    description: 'Xuất một xe trấu 63H 02309 của chị 7',
    warnings: [],
    isDuplicateExisting: false,
    isDuplicateInBatch: false,
  };

  const slipB: ScannedSlipItem = {
    ...slipA,
    id: 's2',
    fileName: '2.jpg',
    weightNetKg: 6840,
    tons: 6.8,
    amount: 74800,
  };

  it('khi tắt gộp: giữ nguyên 2 dòng riêng biệt', () => {
    const res = groupSlipsIfEnabled([slipA, slipB], false);
    expect(res).toHaveLength(2);
  });

  it('khi bật gộp: cộng dồn kg và tính lại tấn', () => {
    const res = groupSlipsIfEnabled([slipA, slipB], true, 11000);
    expect(res).toHaveLength(1);
    const gop = res[0];
    expect(gop.weightNetKg).toBe(6510 + 6840); // 13350 kg
    expect(gop.tons).toBe(13.3); // 13350/1000 cắt 1 số lẻ = 13.3
    expect(gop.description).toBe('Xuất 2 chuyến trấu 63H 02309 của chị 7');
  });
});

describe('5. Kiểm tra Ghi Dòng Trấu Vào File Excel', () => {
  it('ghi nối tiếp STT, đặt đúng công thức R và dời chữ ký', async () => {
    // Tạo 1 workbook mẫu có cấu trúc giống file thực tế
    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet('QUÝ');

    // Dòng 5: SUBTOTAL
    ws.getCell('E5').value = { formula: 'SUBTOTAL(109, E8:E50)', result: 10000 };
    // Dòng 7: Tiêu đề cột
    ws.getCell('A7').value = 'STT';
    ws.getCell('B7').value = 'NGÀY';
    ws.getCell('C7').value = 'ĐỘI';
    ws.getCell('D7').value = 'CÔNG VIỆC';
    ws.getCell('E7').value = 'SỐ LƯỢNG KG';
    ws.getCell('F7').value = 'SỐ LƯỢNG TẤN';
    ws.getCell('J8').value = { formula: '[1]QUÝ!$L$9', result: 500 }; // Công thức liên kết

    // Dòng 8: Dòng dữ liệu mẫu hiện có (STT = 44)
    ws.getCell('A8').value = 44;
    ws.getCell('B8').value = new Date('2026-11-08');
    ws.getCell('C8').value = 'ĐỨC';
    ws.getCell('D8').value = 'Xuất một xe trấu 63C 11111 của anh ba';
    ws.getCell('E8').value = 6500;
    ws.getCell('F8').value = 6.5;
    ws.getCell('Q8').value = 11000;
    ws.getCell('R8').value = { formula: 'Q8*F8', result: 71500 };
    ws.getCell('S8').value = { formula: 'R8', result: 71500 };

    // Dòng 10: Phần chữ ký
    ws.getCell('E10').value = 'Người lập bảng';
    ws.getCell('L10').value = 'Xác nhận';

    const templateBuf = (await wb.xlsx.writeBuffer()) as any;

    // Chuẩn bị 2 phiếu trấu mới cần ghi
    const slips: ScannedSlipItem[] = [
      {
        id: 'new-1',
        fileName: 'p1.jpg',
        selected: true,
        customer: 'Chị 7',
        vehicle: '63H-02309',
        productType: 'Trấu',
        direction: 'Xuất',
        date: '09/11/2026',
        weightGrossKg: 14400,
        weightTareKg: 7890,
        weightNetKg: 6510,
        tons: 6.5,
        unitPrice: 11000,
        amount: 71500,
        description: 'Xuất một xe trấu 63H 02309 của chị 7',
        warnings: [],
        isDuplicateExisting: false,
        isDuplicateInBatch: false,
      },
      {
        id: 'new-2',
        fileName: 'p2.jpg',
        selected: true,
        customer: 'Thái Bảo Ngọc',
        vehicle: '63C 23620',
        productType: 'Trấu',
        direction: 'Xuất',
        date: '09/11/2026',
        weightGrossKg: 14000,
        weightTareKg: 7410,
        weightNetKg: 6590,
        tons: 6.5,
        unitPrice: 11000,
        amount: 71500,
        description: 'Xuất một xe trấu 63C 23620 của thái bảo ngọc',
        warnings: [],
        isDuplicateExisting: false,
        isDuplicateInBatch: false,
      },
    ];

    const writeResult = await writeHuskRowsToExcel(templateBuf, slips, {
      unitPrice: 11000,
      defaultTeam: 'ĐỨC',
      sheetName: 'QUÝ',
      mergeTrips: false,
    });

    expect(writeResult.insertedCount).toBe(2);
    expect(writeResult.startStt).toBe(45);
    expect(writeResult.endStt).toBe(46);

    // Đọc lại file sau khi ghi để xác thực
    const checkWb = new ExcelJS.Workbook();
    await checkWb.xlsx.load(writeResult.updatedBuffer as any);
    const checkWs = checkWb.getWorksheet('QUÝ');
    expect(checkWs).toBeDefined();

    // Dòng 9 (STT = 45)
    const row9 = checkWs!.getRow(9);
    expect(row9.getCell(1).value).toBe(45);
    expect(row9.getCell(3).value).toBe('ĐỨC');
    expect(row9.getCell(4).value).toBe('Xuất một xe trấu 63H 02309 của chị 7');
    expect(row9.getCell(5).value).toBe(6510);
    expect(row9.getCell(6).value).toBe(6.5);
    expect(row9.getCell(17).value).toBe(11000);
    expect((row9.getCell(18).value as { formula: string }).formula).toBe('Q9*F9');

    // Dòng 10 (STT = 46)
    const row10 = checkWs!.getRow(10);
    expect(row10.getCell(1).value).toBe(46);
    expect(row10.getCell(5).value).toBe(6590);
    expect(row10.getCell(6).value).toBe(6.5);
    expect((row10.getCell(18).value as { formula: string }).formula).toBe('Q10*F10');

    // Kiểm tra công thức liên kết J8 vẫn còn nguyên
    expect((checkWs!.getCell('J8').value as { formula: string }).formula).toBe('[1]QUÝ!$L$9');

    // Kiểm tra phần chữ ký đã được dời xuống hàng dưới
    let foundSignature = false;
    checkWs!.eachRow((r, num) => {
      if (num > 10 && String(r.values).includes('Người lập bảng')) {
        foundSignature = true;
      }
    });
    expect(foundSignature).toBe(true);

    // Kiểm tra cờ fullCalcOnLoad được ghi vào workbook.xml của file zip
    const PizZip = (await import('pizzip')).default;
    const zip = new PizZip(writeResult.updatedBuffer);
    const wbXml = zip.file('xl/workbook.xml')?.asText() || '';
    expect(wbXml).toContain('fullCalcOnLoad="1"');
  });
});
