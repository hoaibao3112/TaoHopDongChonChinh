import { describe, it, expect, afterAll } from 'vitest';
import {
  extractMonthKey,
  convertHuskRecordsToNSXTM,
  saveHuskRecordsByMonth,
  getHuskRecordsByMonth,
  deleteHuskRecord,
  updateHuskRecord,
  clearHuskRecordsByMonth,
  HuskMonthlyRecord,
} from '../lib/husk/monthlyStorage';

describe('Husk Monthly Sync & NSX TM Auto-Population', () => {
  describe('extractMonthKey', () => {
    it('should extract month key from YYYY-MM-DD format', () => {
      expect(extractMonthKey('2026-10-15')).toBe('10/2026');
      expect(extractMonthKey('2026-09-01')).toBe('09/2026');
      expect(extractMonthKey('2026-9-5')).toBe('09/2026');
    });

    it('should extract month key from DD/MM/YYYY format', () => {
      expect(extractMonthKey('15/10/2026')).toBe('10/2026');
      expect(extractMonthKey('01/09/2026')).toBe('09/2026');
      expect(extractMonthKey('5/9/2026')).toBe('09/2026');
    });

    it('should return empty string for invalid or empty dates', () => {
      expect(extractMonthKey('')).toBe('');
      expect(extractMonthKey(null)).toBe('');
      expect(extractMonthKey(undefined)).toBe('');
      expect(extractMonthKey('invalid-date')).toBe('');
    });
  });

  describe('convertHuskRecordsToNSXTM', () => {
    it('should map husk records to NSXTMEntry with 11.000 unit price and proper team allocation', () => {
      const records: HuskMonthlyRecord[] = [
        {
          id: 'test-1',
          date: '2026-10-12',
          monthKey: '10/2026',
          team: 'ĐỨC',
          customer: 'CÔ LIỄU',
          vehicle: '67C-12345',
          type: 'XE',
          weightKg: 25000,
          tons: 25.0,
          unitPrice: 11000,
          amount: 275000,
          description: 'Xuất một xe trấu 67C-12345 của CÔ LIỄU',
        },
        {
          id: 'test-2',
          date: '15/10/2026',
          monthKey: '10/2026',
          team: 'QUÝ',
          customer: 'TRANG BẾN TRE',
          vehicle: 'Ghe BT-9999',
          type: 'GHE',
          weightKg: 40000,
          tons: 40.0,
          unitPrice: 11000,
          amount: 440000,
        },
      ];

      const nsxEntries = convertHuskRecordsToNSXTM(records);
      expect(nsxEntries).toHaveLength(2);

      // Check first record (Đức, Xe)
      const e1 = nsxEntries[0];
      expect(e1.id).toBe('husk-db-test-1');
      expect(e1.team).toBe('ĐỨC');
      expect(e1.riceType).toBe('Trấu');
      expect(e1.vehicleType).toBe('XE');
      expect(e1.roundedTons).toBe(25.0);
      expect(e1.unitPriceXuatTrau).toBe(11000);
      expect(e1.thanhTienXuatTrau).toBe(275000);
      expect(e1.tongThanhTien).toBe(275000);
      expect(e1.source).toBe('MANUAL');
      expect(e1.date).toBe('12/10/2026'); // Standardized from YYYY-MM-DD

      // Check second record (Quý, Ghe)
      const e2 = nsxEntries[1];
      expect(e2.id).toBe('husk-db-test-2');
      expect(e2.team).toBe('QUÝ');
      expect(e2.riceType).toBe('Trấu');
      expect(e2.vehicleType).toBe('GHE');
      expect(e2.roundedTons).toBe(40.0);
      expect(e2.unitPriceXuatTrau).toBe(11000);
      expect(e2.thanhTienXuatTrau).toBe(440000);
      expect(e2.tongThanhTien).toBe(440000);
      expect(e2.source).toBe('MANUAL');
      expect(e2.date).toBe('15/10/2026');
    });
  });

  describe('saveHuskRecordsByMonth & getHuskRecordsByMonth', () => {
    it('should save and retrieve monthly husk records consistently', async () => {
      const monthKey = '99/9999'; // Test isolated month
      const records: HuskMonthlyRecord[] = [
        {
          id: 'test-sync-1',
          date: '01/01/9999',
          monthKey,
          team: 'ĐỨC',
          customer: 'TEST KH',
          vehicle: 'TEST VEHICLE',
          type: 'XE',
          weightKg: 10000,
          tons: 10,
          unitPrice: 11000,
          amount: 110000,
        },
      ];

      const saveOk = await saveHuskRecordsByMonth(monthKey, records);
      expect(saveOk).toBe(true);

      const retrieved = await getHuskRecordsByMonth(monthKey);
      expect(retrieved.length).toBeGreaterThanOrEqual(1);
      const found = retrieved.find((r) => r.id === 'test-sync-1');
      expect(found).toBeDefined();
      expect(found?.customer).toBe('TEST KH');
      expect(found?.team).toBe('ĐỨC');
    });

    it('should update a specific record in monthly storage', async () => {
      const monthKey = '99/9999';
      const res = await updateHuskRecord(monthKey, {
        id: 'test-sync-1',
        team: 'QUÝ',
        customer: 'TEST KH UPDATED',
      });
      expect(res.success).toBe(true);
      const updated = res.items.find((r) => r.id === 'test-sync-1');
      expect(updated?.team).toBe('QUÝ');
      expect(updated?.customer).toBe('TEST KH UPDATED');
    });

    it('should delete a single record from monthly storage', async () => {
      const monthKey = '99/9999';
      const res = await deleteHuskRecord(monthKey, 'test-sync-1');
      expect(res.success).toBe(true);
      expect(res.items.find((r) => r.id === 'test-sync-1')).toBeUndefined();
    });

    it('should clear all records for a month', async () => {
      const monthKey = '99/9999';
      const clearOk = await clearHuskRecordsByMonth(monthKey);
      expect(clearOk).toBe(true);
      const remaining = await getHuskRecordsByMonth(monthKey);
      expect(remaining).toHaveLength(0);
    });

    afterAll(async () => {
      // Dọn sạch dữ liệu test
      await clearHuskRecordsByMonth('99/9999');
    });
  });
});
