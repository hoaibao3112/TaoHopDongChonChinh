import { describe, it, expect } from 'vitest';
import { NSXTMEntry } from '@/lib/rice-payroll/nsx-tm-types';
import { roundRiceTons } from '@/lib/rice-payroll/rounding';

describe('Rice Nhập Sấy NSX TM - Tách Mẻ và Thêm Dòng Thủ Công', () => {
  it('tính toán làm tròn kg ra tấn chính xác bằng roundRiceTons', () => {
    expect(roundRiceTons(56355)).toBe(57);
    expect(roundRiceTons(14500)).toBe(15);
    expect(roundRiceTons(10200)).toBe(10);
  });

  it('tách mẻ dở dang và tự động trừ sản lượng mẻ gốc cho NSX TM', () => {
    // Giả lập mẻ gốc Đội Đức nhận 56 tấn lúa tươi xe
    const sourceBatch: NSXTMEntry = {
      id: 'nsxtm-fresh-1',
      source: 'LUA_TUOI',
      date: '16/10/2026',
      team: 'ĐỨC',
      customerName: 'ANH BẢY',
      riceType: 'OM18',
      vehicleName: '65C-12345',
      vehicleType: 'XE',
      jobDescription: 'Nhập 1 xe 65C-12345 OM18 của ANH BẢY',
      weightKg: 56355,
      roundedTons: 56,
      unitPriceSayXe: 25000,
      unitPriceSayGhe: 0,
      thanhTienSay: 56 * 25000,
      unitPriceLuaKho: 0,
      thanhTienLuaKho: 0,
      tongThanhTien: 56 * 25000,
    };

    expect(sourceBatch.tongThanhTien).toBe(1400000);

    // Ngày 16/10 sấy chưa hết 16 tấn, ngày 17/10 Đội Quý vào làm tiếp
    const splitTons = 16;
    const splitKg = 16000;
    const splitUnitPrice = 25000;

    // Giả lập mẻ tách mới
    const splitBatch: NSXTMEntry = {
      id: `split-nsxtm-${sourceBatch.id}-test`,
      source: 'LUA_TUOI',
      date: '17/10/2026',
      team: 'QUÝ',
      customerName: sourceBatch.customerName,
      riceType: sourceBatch.riceType,
      vehicleName: sourceBatch.vehicleName,
      vehicleType: 'XE',
      jobDescription: `${sourceBatch.jobDescription} (Làm tiếp)`,
      weightKg: splitKg,
      roundedTons: splitTons,
      unitPriceSayXe: 25000,
      unitPriceSayGhe: 0,
      thanhTienSay: splitTons * splitUnitPrice,
      unitPriceLuaKho: 0,
      thanhTienLuaKho: 0,
      tongThanhTien: splitTons * splitUnitPrice,
      note: 'Làm tiếp mẻ ANH BẢY (56t) ngày 16/10/2026 cho Đội Quý',
      isManual: true,
      splitFromId: sourceBatch.id,
      originalTonsBeforeSplit: sourceBatch.roundedTons,
      facility: 'NSX TÂN MỸ',
    };

    expect(splitBatch.tongThanhTien).toBe(400000);
    expect(splitBatch.team).toBe('QUÝ');

    // Mẻ gốc sau khi trừ
    const updatedSource = { ...sourceBatch };
    const remainingTons = Math.max(0, updatedSource.roundedTons - splitTons);
    updatedSource.roundedTons = remainingTons;
    updatedSource.thanhTienSay = remainingTons * 25000;
    updatedSource.tongThanhTien = updatedSource.thanhTienSay;

    expect(updatedSource.roundedTons).toBe(40);
    expect(updatedSource.tongThanhTien).toBe(1000000);

    // Tổng tiền của cả 2 phần việc (40t + 16t) phải đúng bằng 56t ban đầu
    expect(updatedSource.tongThanhTien + splitBatch.tongThanhTien).toBe(1400000);

    // Nếu khôi phục (restore) khi xóa mẻ tách:
    const restoredSource = { ...updatedSource };
    restoredSource.roundedTons = restoredSource.roundedTons + splitBatch.roundedTons;
    restoredSource.thanhTienSay = restoredSource.roundedTons * 25000;
    restoredSource.tongThanhTien = restoredSource.thanhTienSay;

    expect(restoredSource.roundedTons).toBe(56);
    expect(restoredSource.tongThanhTien).toBe(1400000);
  });

  it('sắp xếp danh sách mẻ nhập sấy NSX TM theo thứ tự ngày tăng dần từ ngày 1 đến 30/31 (không bị nhảy lộn xộn)', async () => {
    const { parseDateSortKey, sortEntriesByDate } = await import('@/lib/rice-payroll/nsx-tm-utils');

    // Kiểm tra parseDateSortKey
    expect(parseDateSortKey('05/11/2026')).toBe(20261105);
    expect(parseDateSortKey('16/11/2026')).toBe(20261116);
    expect(parseDateSortKey('10/11/2026')).toBe(20261110);

    // Giả lập danh sách mẻ nhập lộn xộn y hệt như trên ảnh của user:
    // Mẻ tươi (14/11, 15/11, 16/11) đứng trước, mẻ khô (05/11, 06/11, 09/11, 10/11) đứng sau
    const unsortedList: NSXTMEntry[] = [
      { id: '1', date: '14/11/2026', team: 'QUÝ', customerName: 'A', riceType: 'OM18', vehicleName: '', vehicleType: 'XE', jobDescription: '', weightKg: 1000, roundedTons: 1, thanhTienSay: 25000, thanhTienLuaKho: 0, tongThanhTien: 25000, source: 'LUA_TUOI' },
      { id: '2', date: '15/11/2026', team: 'QUÝ', customerName: 'B', riceType: 'OM18', vehicleName: '', vehicleType: 'XE', jobDescription: '', weightKg: 1000, roundedTons: 1, thanhTienSay: 25000, thanhTienLuaKho: 0, tongThanhTien: 25000, source: 'LUA_TUOI' },
      { id: '3', date: '16/11/2026', team: 'QUÝ', customerName: 'C', riceType: 'OM18', vehicleName: '', vehicleType: 'XE', jobDescription: '', weightKg: 1000, roundedTons: 1, thanhTienSay: 25000, thanhTienLuaKho: 0, tongThanhTien: 25000, source: 'LUA_TUOI' },
      { id: '4', date: '05/11/2026', team: 'QUÝ', customerName: 'D', riceType: 'OM18', vehicleName: '', vehicleType: 'XE', jobDescription: '', weightKg: 1000, roundedTons: 1, thanhTienSay: 0, thanhTienLuaKho: 20000, tongThanhTien: 20000, source: 'LUA_KHO' },
      { id: '5', date: '06/11/2026', team: 'QUÝ', customerName: 'E', riceType: 'OM18', vehicleName: '', vehicleType: 'XE', jobDescription: '', weightKg: 1000, roundedTons: 1, thanhTienSay: 0, thanhTienLuaKho: 20000, tongThanhTien: 20000, source: 'LUA_KHO' },
      { id: '6', date: '09/11/2026', team: 'QUÝ', customerName: 'F', riceType: 'OM18', vehicleName: '', vehicleType: 'XE', jobDescription: '', weightKg: 1000, roundedTons: 1, thanhTienSay: 0, thanhTienLuaKho: 20000, tongThanhTien: 20000, source: 'LUA_KHO' },
      { id: '7', date: '10/11/2026', team: 'QUÝ', customerName: 'G', riceType: 'OM18', vehicleName: '', vehicleType: 'XE', jobDescription: '', weightKg: 1000, roundedTons: 1, thanhTienSay: 0, thanhTienLuaKho: 20000, tongThanhTien: 20000, source: 'LUA_KHO' },
    ];

    const sorted = sortEntriesByDate(unsortedList);
    const resultDates = sorted.map((e) => e.date);

    // Phải theo đúng thứ tự 1-30: 05 -> 06 -> 09 -> 10 -> 14 -> 15 -> 16
    expect(resultDates).toEqual([
      '05/11/2026',
      '06/11/2026',
      '09/11/2026',
      '10/11/2026',
      '14/11/2026',
      '15/11/2026',
      '16/11/2026',
    ]);
  });
});
