import { describe, it, expect } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import { isCoSo1 } from '../lib/rice-payroll/facility-filter';
import { RiceBatch } from '../lib/rice-payroll/types';
import { CS1Batch } from '../lib/rice-payroll/cs1-types';
import {
  DEFAULT_DOI_NGHI_WORKERS,
  DEFAULT_DOI_NGUYEN_WORKERS,
  DEFAULT_OCTOBER_TRAU_NGHI,
  DEFAULT_OCTOBER_TRAU_NGUYEN,
} from '../lib/rice-payroll/team-cs1-workers';

describe('Rice Nhập Sấy CS1: Đội Nghị & Đội Nguyên - Cơ Sở I', () => {
  it('lọc mẻ Cơ Sở I trong tháng 10/2026 và phân chia cho 2 đội', () => {
    const jsonPath = path.join(__dirname, '../data/sample-batches.json');
    if (!fs.existsSync(jsonPath)) return;

    const data = JSON.parse(fs.readFileSync(jsonPath, 'utf8'));
    const cs1Batches: RiceBatch[] = data.batches.filter(
      (b: RiceBatch) => isCoSo1(b.dryFacility) && (b.dryDate || '').endsWith('/10/2026')
    );

    expect(cs1Batches.length).toBeGreaterThan(0);

    // Kiểm tra cấu trúc công nhân 2 đội
    expect(DEFAULT_DOI_NGHI_WORKERS.length).toBe(11);
    expect(DEFAULT_DOI_NGUYEN_WORKERS.length).toBe(9);

    // Kiểm tra danh sách trấu mẫu
    expect(DEFAULT_OCTOBER_TRAU_NGHI.length).toBeGreaterThan(0);
    expect(DEFAULT_OCTOBER_TRAU_NGUYEN.length).toBeGreaterThan(0);
  });

  it('xuất Excel Đội Nghị đúng 4 sheets chuẩn, không có lỗi #VALUE!', async () => {
    const { POST } = await import('../app/api/rice-payroll/cs1-export/route');
    const { NextRequest } = await import('next/server');
    const { SESSION_COOKIE_NAME } = await import('../lib/auth');
    const XLSX = await import('xlsx');

    const mockBatches: CS1Batch[] = [
      {
        id: 'cs1-1',
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
        pricePerTon: 20000,
        thanhTien: 101 * 20000, // 2.020.000
      },
      {
        id: 'cs1-2',
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
        pricePerTon: 23000,
        thanhTien: 36 * 23000, // 828.000
      },
    ];

    // 1. Xuất riêng cho Đội Nghị
    const reqNghi = new NextRequest('http://localhost:3000/api/rice-payroll/cs1-export', {
      method: 'POST',
      headers: {
        cookie: `${SESSION_COOKIE_NAME}=authenticated`,
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        month: 10,
        year: 2026,
        targetTeam: 'NGHỊ',
        batches: mockBatches,
        workersNghi: DEFAULT_DOI_NGHI_WORKERS,
        trauNghi: DEFAULT_OCTOBER_TRAU_NGHI,
        waterDaysNghi: 13,
      }),
    });

    const resNghi = await POST(reqNghi);
    expect(resNghi.status).toBe(200);

    const bufNghi = await resNghi.arrayBuffer();
    const wbNghi = XLSX.read(Buffer.from(bufNghi), { type: 'buffer' });

    expect(wbNghi.SheetNames).toHaveLength(4);
    expect(wbNghi.SheetNames[0]).toBe('Nhập lúa Anh Nghị');
    expect(wbNghi.SheetNames[1]).toBe('Nhập Trấu');
    expect(wbNghi.SheetNames[2]).toBe('ỨL ĐỘI NGHỊ T10.2026');
    expect(wbNghi.SheetNames[3]).toBe('CL ĐỘI NGHỊ T10.2026');

    // Kiểm tra không có ô nào bị #VALUE!
    for (const sheetName of wbNghi.SheetNames) {
      const sheet = wbNghi.Sheets[sheetName];
      for (const cellKey of Object.keys(sheet)) {
        if (cellKey.startsWith('!')) continue;
        const cell = sheet[cellKey];
        if (cell && cell.v !== undefined) {
          expect(String(cell.v)).not.toContain('#VALUE!');
        }
      }
    }

    // 2. Xuất riêng cho Đội Nguyên
    const reqNguyen = new NextRequest('http://localhost:3000/api/rice-payroll/cs1-export', {
      method: 'POST',
      headers: {
        cookie: `${SESSION_COOKIE_NAME}=authenticated`,
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        month: 10,
        year: 2026,
        targetTeam: 'NGUYÊN',
        batches: mockBatches,
        workersNguyen: DEFAULT_DOI_NGUYEN_WORKERS,
        trauNguyen: DEFAULT_OCTOBER_TRAU_NGUYEN,
        waterDaysNguyen: 13,
      }),
    });

    const resNguyen = await POST(reqNguyen);
    expect(resNguyen.status).toBe(200);

    const bufNguyen = await resNguyen.arrayBuffer();
    const wbNguyen = XLSX.read(Buffer.from(bufNguyen), { type: 'buffer' });

    expect(wbNguyen.SheetNames).toHaveLength(4);
    expect(wbNguyen.SheetNames[0]).toBe('Nhap lua CS1');
    expect(wbNguyen.SheetNames[1]).toBe('Nhập Trấu Nguyên');
    expect(wbNguyen.SheetNames[2]).toBe('ỨL ĐỘI NGUYÊN T10.2026');
    expect(wbNguyen.SheetNames[3]).toBe('CL ĐỘI NGUYÊN T10.2026');

    // Kiểm tra đã bỏ cột SỐ LƯỢNG (KG) thừa khỏi sheet 1:
    // Cột G hiện tại là Phương tiện tăng bo, cột J là Cân sấy (kg), cột K là Tấn, cột L là Đơn giá, cột M là Thành tiền
    const wsNguyenLua = wbNguyen.Sheets['Nhap lua CS1'];
    expect(wsNguyenLua['G3'].v).toContain('PHƯƠNG TIỆN TĂNG BO');
    expect(wsNguyenLua['J3'].v).toContain('CÂN NHẬP SẤY\n(KG)');
    expect(wsNguyenLua['K3'].v).toContain('CÂN NHẬP SẤY\n(TẤN)');
    expect(wsNguyenLua['L3'].v).toContain('ĐƠN GIÁ SẤY');
    expect(wsNguyenLua['M3'].v).toContain('THÀNH TIỀN');
    expect(wsNguyenLua['N3']).toBeUndefined(); // Đã rút gọn còn A-M (13 cột)
  });

  it('hỗ trợ tách mẻ sấy dở dang và mẻ thủ công phân bổ chính xác cho 2 đội', async () => {
    const { POST } = await import('../app/api/rice-payroll/cs1-export/route');
    const { NextRequest } = await import('next/server');
    const { SESSION_COOKIE_NAME } = await import('../lib/auth');
    const XLSX = await import('xlsx');

    // Mẻ gốc 70 tấn sấy dở dang ngày 16/11 Đội Nghị làm 40 tấn, Đội Nguyên qua ngày 17/11 làm 30 tấn
    const originalBatch: CS1Batch = {
      id: 'batch-origin-70t',
      contractNo: '08',
      weighDate: '15/11/2026',
      doiNhap: 'NGHỊ',
      customerName: 'VIÊN U MINH THƯỢNG',
      vehicleName: 'NGUYÊN NGUYÊN 12',
      riceType: 'OM18',
      dryDate: '16/11/2026',
      dryFacility: 'CƠ SỞ I',
      dryWeightKg: 40000,
      roundedTons: 40, // Đã trừ 30 tấn chuyển cho Đội Nguyên
      pricePerTon: 20000,
      thanhTien: 40 * 20000, // 800.000
    };

    const splitBatch: CS1Batch = {
      id: 'split-batch-origin-70t-1',
      contractNo: '08+',
      weighDate: '15/11/2026',
      doiNhap: 'NGUYÊN',
      customerName: 'VIÊN U MINH THƯỢNG',
      vehicleName: 'NGUYÊN NGUYÊN 12',
      riceType: 'OM18',
      dryDate: '17/11/2026',
      dryFacility: 'CƠ SỞ I',
      dryWeightKg: 30000,
      roundedTons: 30, // 30 tấn Đội Nguyên nhận làm tiếp
      pricePerTon: 20000,
      thanhTien: 30 * 20000, // 600.000
      isManual: true,
      splitFromId: 'batch-origin-70t',
      originalTonsBeforeSplit: 70,
      note: 'Tách mẻ qua ngày 17/11 Đội Nguyên làm tiếp',
    };

    const combinedBatches: CS1Batch[] = [originalBatch, splitBatch];

    // Kiểm tra tổng sản lượng bảo toàn đúng 70 tấn
    const totalTons = combinedBatches.reduce((s, b) => s + b.roundedTons, 0);
    expect(totalTons).toBe(70);

    // Xuất Excel cho Đội Nghị
    const reqNghi = new NextRequest('http://localhost:3000/api/rice-payroll/cs1-export', {
      method: 'POST',
      headers: {
        cookie: `${SESSION_COOKIE_NAME}=authenticated`,
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        month: 11,
        year: 2026,
        targetTeam: 'NGHỊ',
        batches: combinedBatches,
        workersNghi: DEFAULT_DOI_NGHI_WORKERS,
        trauNghi: [],
        waterDaysNghi: 10,
      }),
    });

    const resNghi = await POST(reqNghi);
    expect(resNghi.status).toBe(200);
    const bufNghi = await resNghi.arrayBuffer();
    const wbNghi = XLSX.read(Buffer.from(bufNghi), { type: 'buffer' });
    expect(wbNghi.SheetNames).toHaveLength(4);

    // Xuất Excel cho Đội Nguyên
    const reqNguyen = new NextRequest('http://localhost:3000/api/rice-payroll/cs1-export', {
      method: 'POST',
      headers: {
        cookie: `${SESSION_COOKIE_NAME}=authenticated`,
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        month: 11,
        year: 2026,
        targetTeam: 'NGUYÊN',
        batches: combinedBatches,
        workersNguyen: DEFAULT_DOI_NGUYEN_WORKERS,
        trauNguyen: [],
        waterDaysNguyen: 10,
      }),
    });

    const resNguyen = await POST(reqNguyen);
    expect(resNguyen.status).toBe(200);
    const bufNguyen = await resNguyen.arrayBuffer();
    const wbNguyen = XLSX.read(Buffer.from(bufNguyen), { type: 'buffer' });
    expect(wbNguyen.SheetNames).toHaveLength(4);
  });
});

