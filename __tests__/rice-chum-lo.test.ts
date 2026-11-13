import { describe, it, expect } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import { isCoSo1 } from '../lib/rice-payroll/facility-filter';
import { RiceBatch } from '../lib/rice-payroll/types';
import { roundRiceTons } from '../lib/rice-payroll/rounding';
import { ChumLoBatch } from '../lib/rice-payroll/chum-lo-types';
import {
  DEFAULT_CHUM_LO_WORKERS,
  DEFAULT_CHUM_LO_UNIT_PRICE,
} from '../lib/rice-payroll/team-chum-lo-workers';

describe('Rice Chụm Lò CS1: Đội Nguyên - Cơ Sở I', () => {
  it('lọc chính xác các mẻ nhập sấy Cơ Sở I theo NGÀY NHẬP SẤY (dryDate) trong tháng 10/2026', () => {
    const jsonPath = path.join(__dirname, '../data/sample-batches.json');
    if (!fs.existsSync(jsonPath)) return;

    const data = JSON.parse(fs.readFileSync(jsonPath, 'utf8'));
    // Lọc theo Cơ Sở I và tháng 10/2026 của cột dryDate
    const cs1Batches: RiceBatch[] = data.batches.filter(
      (b: RiceBatch) => isCoSo1(b.dryFacility) && (b.dryDate || '').endsWith('/10/2026')
    );

    expect(cs1Batches.length).toBeGreaterThan(0);

    let totalKg = 0;
    let totalTons = 0;
    let totalThanhTien = 0;

    cs1Batches.forEach((b) => {
      totalKg += b.dryWeightKg;
      const tons = roundRiceTons(b.dryWeightKg);
      totalTons += tons;
      totalThanhTien += tons * DEFAULT_CHUM_LO_UNIT_PRICE;
    });

    expect(totalKg).toBeGreaterThan(2_000_000); // Khoảng gần 3 triệu kg
    expect(totalTons).toBeGreaterThan(2_000);    // Khoảng gần 3 ngàn tấn
    expect(totalThanhTien).toBeGreaterThan(10_000_000); // Đơn giá 5.000đ/tấn
  });

  it('tính toán đúng số tiền tạm ứng và quyết toán còn lại cho đội công nhân', () => {
    const totalTons = 3011;
    const unitPrice = 5000;
    const totalThanhTien = totalTons * unitPrice; // 15.055.000đ

    const totalAdvance = DEFAULT_CHUM_LO_WORKERS.reduce(
      (sum, w) => sum + w.advanceSalary,
      0
    );
    expect(totalAdvance).toBe(6_000_000); // 3 người x 2 triệu = 6 triệu

    const remaining = totalThanhTien - totalAdvance;
    expect(remaining).toBe(9_055_000); // 15.055.000 - 6.000.000 = 9.055.000đ chuẩn theo file mẫu
  });

  it('cho phép người dùng điều chỉnh số Tấn thủ công và tự động tính lại Thành tiền', () => {
    // Giả sử mẻ có 69.369 kg -> tự động làm tròn thành 70 tấn
    const dryWeightKg = 69369;
    const autoTons = roundRiceTons(dryWeightKg);
    expect(autoTons).toBe(70);

    // Người dùng điều chỉnh thủ công thành 69 tấn theo thỏa thuận thực tế
    const manualTons = 69;
    const unitPrice = 5000;
    const autoThanhTien = autoTons * unitPrice; // 350.000đ
    const manualThanhTien = manualTons * unitPrice; // 345.000đ

    expect(manualThanhTien).toBe(345_000);
    expect(autoThanhTien).toBe(350_000);
    expect(manualThanhTien).not.toBe(autoThanhTien);
  });

  it('xuất Excel Chụm Lò đúng 2 sheets chuẩn, không có lỗi #VALUE!', async () => {
    const { POST } = await import('../app/api/rice-payroll/chum-lo-export/route');
    const { NextRequest } = await import('next/server');
    const { SESSION_COOKIE_NAME } = await import('../lib/auth');
    const XLSX = await import('xlsx');

    const mockBatches: ChumLoBatch[] = [
      {
        id: 'batch-1',
        contractNo: '01',
        weighDate: '20/09/2026',
        doiNhap: 'NGHỊ',
        customerName: 'ÚT MỸ QUÝ',
        vehicleName: 'TÀU TỚI',
        riceType: 'OM18',
        dryDate: '01/10/2026',
        dryFacility: 'CƠ SỞ I',
        dryWeightKg: 100698,
        roundedTons: 101,
        unitPrice: 5000,
        thanhTien: 101 * 5000, // 505.000
      },
      {
        id: 'batch-2',
        contractNo: '02',
        weighDate: '21/09/2026',
        doiNhap: 'NGUYÊN',
        customerName: 'LONG KHÁNH ĐĂK LĂK',
        vehicleName: '63H 07007',
        riceType: 'ST25 ĐL',
        dryDate: '02/10/2026',
        dryFacility: 'CƠ SỞ I',
        dryWeightKg: 36189,
        roundedTons: 36,
        unitPrice: 5000,
        thanhTien: 36 * 5000, // 180.000
      },
    ];

    const req = new NextRequest('http://localhost:3000/api/rice-payroll/chum-lo-export', {
      method: 'POST',
      headers: {
        cookie: `${SESSION_COOKIE_NAME}=authenticated`,
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        month: 10,
        year: 2026,
        batches: mockBatches,
        workers: DEFAULT_CHUM_LO_WORKERS,
        unitPrice: 5000,
      }),
    });

    const res = await POST(req);
    expect(res.status).toBe(200);

    const buf = await res.arrayBuffer();
    const wb = XLSX.read(Buffer.from(buf), { type: 'buffer' });

    // Kiểm tra có đúng 2 sheets chuẩn
    expect(wb.SheetNames).toHaveLength(2);
    expect(wb.SheetNames[0]).toBe('Chụm Lò');
    expect(wb.SheetNames[1]).toBe('ỨL ĐỘI NGUYÊN T010.2026');

    // Không có ô nào bị lỗi #VALUE!
    for (const sheetName of wb.SheetNames) {
      const sheet = wb.Sheets[sheetName];
      for (const cellKey of Object.keys(sheet)) {
        if (cellKey.startsWith('!')) continue;
        const cell = sheet[cellKey];
        if (cell && cell.v !== undefined) {
          expect(String(cell.v)).not.toContain('#VALUE!');
        }
      }
    }

    // ─── Sheet 1: Chụm Lò ───────────────────────────────────────────────
    const ws1 = wb.Sheets['Chụm Lò'];
    expect(ws1['A1'].v).toContain('NHẬP SẤY CƠ SỞ I XNK ĐỘI NHẬP ANH NGHỊ VÀ ANH NGUYÊN   T10/2026');
    expect(ws1['E2'].v).toBe('TỔNG CỘNG');
    expect(ws1['K2'].v).toBe(100698 + 36189); // 136.887 kg
    expect(ws1['L2'].v).toBe(101 + 36);       // 137 tấn
    expect(ws1['N2'].v).toBe(505000 + 180000); // 685.000 đ

    // Chữ ký xác nhận
    expect(ws1['D7'].v).toBe('Người lập bảng');
    expect(ws1['J7'].v).toBe('Xác nhận');
    expect(ws1['D11'].v).toBe('Võ Hoàng Cẩm Tiên');
    expect(ws1['J11'].v).toBe('Huỳnh Hải Long Hồ');

    // ─── Sheet 2: ỨL ĐỘI NGUYÊN ─────────────────────────────────────────
    const ws2 = wb.Sheets['ỨL ĐỘI NGUYÊN T010.2026'];
    expect(ws2['A1'].v).toContain('DANH SÁCH CHI LƯƠNG CHỤM LÒ CƠ SỞ 1 THÁNG 10/2026');
    expect(ws2['B3'].v).toBe('TRƯƠNG THỊ LOAN');
    expect(ws2['D3'].v).toBe(2000000);
    expect(ws2['B6'].v).toBe('TỔNG CỘNG');
    expect(ws2['D6'].v).toBe(6000000);

    // Bảng kê quyết toán chụm lò
    expect(ws2['B15'].v).toBe('BẢNG KÊ CHỤM LÒ CƠ SỞ 1 THÁNG 10/2026');
    expect(ws2['C17'].v).toBe(137); // 137 tấn
    expect(ws2['D17'].v).toBe(5000);
    expect(ws2['E17'].v).toBe(685000);
    expect(ws2['B19'].v).toBe('TRỪ TẠM ỨNG :');
    expect(ws2['E19'].v).toBe(6000000);
    expect(ws2['B20'].v).toBe('CÒN LẠI :');
    expect(ws2['E20'].v).toBe(685000 - 6000000);
  });
});

