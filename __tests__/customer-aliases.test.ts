import { describe, it, expect } from 'vitest';
import {
  normalizeCustomerName,
  searchMasterCustomers,
  CustomerAlias,
  MasterCustomer,
} from '../lib/dang-tai/customers';
import { processWeighingSlip } from '../lib/dang-tai/orderValidator';
import { XeDangTai, OcrPhieuCanResult } from '../lib/dang-tai/types';
import {
  upsertCustomerAlias,
  upsertCustomCustomer,
  getAllCustomersAndAliases,
  deleteCustomerAlias,
} from '../lib/dang-tai/customerStorage';

describe('Customer Aliases & Custom Groups (Ánh Xạ Bí Danh Khách Hàng Vào CSDL)', () => {
  const mockAliases: CustomerAlias[] = [
    {
      alias: 'A KHU B',
      targetName: 'A KHU E',
      aliasSearch: 'a khu b',
      updatedAt: new Date().toISOString(),
    },
    {
      alias: 'LÂM TN GẦN',
      targetName: 'LÂM TÂY NINH',
      aliasSearch: 'lam tn gan',
      updatedAt: new Date().toISOString(),
    },
  ];

  const mockCustomCustomers: MasterCustomer[] = [
    {
      name: 'A KHU E',
      count: 10,
      nameSearch: 'a khu e',
    },
    {
      name: 'LÒ SÁU TIỀN GIANG',
      count: 5,
      nameSearch: 'lo sau tien giang',
    },
  ];

  describe('normalizeCustomerName with Aliases', () => {
    it('should map "A KHU B" to "A KHU E" when alias is registered', () => {
      // 1. Gõ đúng nguyên văn
      expect(normalizeCustomerName('A KHU B', mockAliases, mockCustomCustomers)).toBe('A KHU E');
      // 2. Gõ chữ thường
      expect(normalizeCustomerName('a khu b', mockAliases, mockCustomCustomers)).toBe('A KHU E');
      // 3. Có tiền tố xưng hô "anh khu b"
      expect(normalizeCustomerName('anh khu b', mockAliases, mockCustomCustomers)).toBe('A KHU E');
      // 4. Có dấu chấm "a. khu b"
      expect(normalizeCustomerName('a. khu b', mockAliases, mockCustomCustomers)).toBe('A KHU E');
    });

    it('should map alias "LÂM TN GẦN" to "LÂM TÂY NINH"', () => {
      expect(normalizeCustomerName('lâm tn gần', mockAliases, mockCustomCustomers)).toBe('LÂM TÂY NINH');
      expect(normalizeCustomerName('anh lâm tn gần', mockAliases, mockCustomCustomers)).toBe('LÂM TÂY NINH');
    });

    it('should recognize new custom customer "LÒ SÁU TIỀN GIANG"', () => {
      expect(normalizeCustomerName('lò sáu tg', mockAliases, mockCustomCustomers)).toBe('LÒ SÁU TIỀN GIANG');
      expect(normalizeCustomerName('chú lò sáu tiền giang', mockAliases, mockCustomCustomers)).toBe('LÒ SÁU TIỀN GIANG');
    });
  });

  describe('searchMasterCustomers with Custom Customers & Aliases', () => {
    it('should find target "A KHU E" when searching by alias "khu b"', () => {
      const results = searchMasterCustomers('khu b', 10, mockCustomCustomers, mockAliases);
      expect(results.length).toBeGreaterThan(0);
      expect(results[0].name).toBe('A KHU E');
    });

    it('should find custom customer "LÒ SÁU TIỀN GIANG"', () => {
      const results = searchMasterCustomers('lò sáu', 10, mockCustomCustomers, mockAliases);
      expect(results.some((c) => c.name === 'LÒ SÁU TIỀN GIANG')).toBe(true);
    });
  });

  describe('orderValidator integration with Aliases', () => {
    it('should auto-map scanned ticket "A KHU B" to "A KHU E" in processWeighingSlip', () => {
      const phieu: OcrPhieuCanResult = {
        soXe: '70H-03268',
        soPhieu: 'PC-999',
        khachHang: 'A KHU B', // Trên phiếu ghi A KHU B
        tlXeHangKg: 40000,
        tlXeKg: 10000,
        tlHangKg: 30000,
        rawText: '...',
        confidence: 0.95,
      };

      const trucks: XeDangTai[] = [
        {
          id: 'truck_1',
          stt: 1,
          ngayDangTai: '2026-11-23',
          bienSoXe: '70H-03268',
          nhaCungCap: 'CHƯA RÕ',
          soLuongUocTinh: 30000,
          loaiLua: '5451',
          trangThai: 'cho_can',
          canHopLeSTT: true,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        },
      ];

      const result = processWeighingSlip(phieu, trucks, undefined, {
        customAliases: mockAliases,
        customCustomers: mockCustomCustomers,
      });

      expect(result.matched).toBe(true);
      // Kết quả phải được tự động chuyển thành A KHU E!
      expect(result.updatedXe?.khachHangCan).toBe('A KHU E');
      expect(result.updatedXe?.nhaCungCap).toBe('A KHU E');
    });
  });

  describe('customerStorage DB/File persistence', () => {
    it('should save and retrieve alias mapping via storage functions', async () => {
      const { aliasEntry, aliases } = await upsertCustomerAlias('A KHU TEST', 'A KHU DÍCH TEST');
      expect(aliasEntry.alias).toBe('A KHU TEST');
      expect(aliasEntry.targetName).toBe('A KHU DÍCH TEST');

      const all = await getAllCustomersAndAliases();
      expect(all.aliases.some((a) => a.alias === 'A KHU TEST')).toBe(true);

      // Dọn dẹp test alias
      await deleteCustomerAlias('A KHU TEST');
      const allAfterDelete = await getAllCustomersAndAliases();
      expect(allAfterDelete.aliases.some((a) => a.alias === 'A KHU TEST')).toBe(false);
    });

    it('should add custom customer into directory', async () => {
      const { customer } = await upsertCustomCustomer('KHÁCH HÀNG MỚI TEST', 5);
      expect(customer.name).toBe('KHÁCH HÀNG MỚI TEST');

      const all = await getAllCustomersAndAliases();
      expect(all.customCustomers.some((c) => c.name === 'KHÁCH HÀNG MỚI TEST')).toBe(true);
    });
  });
});
