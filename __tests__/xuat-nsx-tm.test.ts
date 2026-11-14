import { describe, it, expect } from 'vitest';
import * as XLSX from 'xlsx';
import {
  calculateXuatNSXTMRow,
  calculateXuatNSXTMTotal,
  isJaponica,
  isNep,
  parseXuatNSXTMWorkbook,
} from '@/lib/rice-payroll/xuat-nsx-tm-parser';
import sampleOctoberDataRaw from '@/lib/rice-payroll/sample-october-xuat-nsx-tm.json';
import { XuatNSXTMEntry } from '@/lib/rice-payroll/xuat-nsx-tm-types';

const sampleOctoberData = sampleOctoberDataRaw as XuatNSXTMEntry[];

describe('Xuất Lúa NSX Tân Mỹ (Đội Nam) - Tính lương & Xuất Excel', () => {
  it('Phân loại chính xác giống lúa Japonica, Nếp và Lúa khác', () => {
    expect(isJaponica('JAPONICA-DS1')).toBe(true);
    expect(isJaponica('DS1')).toBe(true);
    expect(isJaponica('NẾP CPC')).toBe(false);

    expect(isNep('NẾP CPC')).toBe(true);
    expect(isNep('NẾP')).toBe(true);
    expect(isNep('ST25 ĐL')).toBe(false);
  });

  it('Tính đơn giá đúng cho từng loại: Japonica (17k), Nếp (11k), Lúa khác (11k) + Chụm lò + Vô bồn (3k)', () => {
    // Japonica
    const japRow = calculateXuatNSXTMRow({
      loaiLua: 'JAPONICA-DS1',
      canNhapSayKg: 75125,
      soLuongTan: 75,
    });
    expect(japRow.donGiaCoTro).toBe(17000);
    expect(japRow.thanhTienCoTro).toBe(75 * 17000); // 1.275.000
    expect(japRow.donGiaKhongTro).toBe(0);
    expect(japRow.donGiaChumLua).toBe(8000);
    expect(japRow.thanhTienChum).toBe(75 * 8000); // 600.000
    expect(japRow.donGiaVoBon).toBe(3000);
    expect(japRow.thanhTienVoBon).toBe(75 * 3000); // 225.000
    expect(japRow.tongThanhTien).toBe(1275000 + 600000 + 225000); // 2.100.000

    // Nếp
    const nepRow = calculateXuatNSXTMRow({
      loaiLua: 'NẾP CPC',
      canNhapSayKg: 110278,
      soLuongTan: 110,
    });
    expect(nepRow.donGiaCoTro).toBe(0);
    expect(nepRow.donGiaKhongTro).toBe(11000);
    expect(nepRow.thanhTienKhongTro).toBe(110 * 11000); // 1.210.000
    expect(nepRow.donGiaChumNep).toBe(11000);
    expect(nepRow.thanhTienChum).toBe(110 * 11000); // 1.210.000
    expect(nepRow.donGiaVoBon).toBe(3000);
    expect(nepRow.thanhTienVoBon).toBe(110 * 3000); // 330.000
    expect(nepRow.tongThanhTien).toBe(1210000 + 1210000 + 330000); // 2.750.000
  });

  it('Tính tổng hợp Tháng 10/2026 khớp 100% với file chuẩn mẫu LƯƠNG_ĐỘI_NAM-XUẤT_NSX_ĐTM_T10_2026_IN_CHUANMAU.xlsx', () => {
    const summary = calculateXuatNSXTMTotal(sampleOctoberData, '10/2026', 0);

    expect(summary.totalRows).toBe(32);
    expect(summary.totalKg).toBe(1588964);
    expect(summary.totalTons).toBe(1589);

    // Sheet 2 checks
    expect(summary.tonsCoTro).toBe(75);
    expect(summary.priceCoTro).toBe(17000);
    expect(summary.thanhTienCoTro).toBe(1275000);

    expect(summary.tonsKhongTro).toBe(1514);
    expect(summary.priceKhongTro).toBe(11000);
    expect(summary.thanhTienKhongTro).toBe(16654000);

    expect(summary.tonsChumLua).toBe(664);
    expect(summary.priceChumLua).toBe(8000);
    expect(summary.thanhTienChumLua).toBe(5312000);

    expect(summary.tonsChumNep).toBe(925);
    expect(summary.priceChumNep).toBe(11000);
    expect(summary.thanhTienChumNep).toBe(10175000);

    expect(summary.tonsVoBon).toBe(1589);
    expect(summary.priceVoBon).toBe(3000);
    expect(summary.thanhTienVoBon).toBe(4767000);

    // Tổng cộng
    expect(summary.tongCong).toBe(38183000);
    expect(summary.conLai).toBe(38183000);
  });

  it('Đọc file Excel LƯƠNG_ĐỘI_NAM-XUẤT_NSX_ĐTM_T10_2026_IN_CHUANMAU.xlsx qua parseXuatNSXTMWorkbook ra đúng 32 mẻ', () => {
    const wb = XLSX.readFile('LƯƠNG_ĐỘI_NAM-XUẤT_NSX_ĐTM_T10_2026_IN_CHUANMAU.xlsx');
    const entries = parseXuatNSXTMWorkbook(wb);

    expect(entries.length).toBe(32);
    const sum = calculateXuatNSXTMTotal(entries, '10/2026', 0);
    expect(sum.totalTons).toBe(1589);
    expect(sum.tongCong).toBe(38183000);
  });

  it('Cho phép tùy chỉnh đơn giá linh hoạt qua custom unitPrices (Chụm lò, Vô bồn, Xuất lúa)', () => {
    const customPrices = {
      priceCoTro: 18000,
      priceKhongTro: 12000,
      priceChumLua: 9000,
      priceChumNep: 12000,
      priceVoBon: 3500,
    };

    const row = calculateXuatNSXTMRow(
      {
        loaiLua: 'JAPONICA-DS1',
        canNhapSayKg: 20000,
        soLuongTan: 20,
      },
      customPrices
    );

    expect(row.donGiaCoTro).toBe(18000);
    expect(row.thanhTienCoTro).toBe(20 * 18000);
    expect(row.donGiaChumLua).toBe(9000);
    expect(row.thanhTienChum).toBe(20 * 9000);
    expect(row.donGiaVoBon).toBe(3500);
    expect(row.thanhTienVoBon).toBe(20 * 3500);
  });
});

