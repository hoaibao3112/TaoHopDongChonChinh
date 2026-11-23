import { describe, it, expect } from 'vitest';
import {
  normalizeCustomerName,
  stripVietnameseHonorifics,
  searchMasterCustomers,
  MASTER_CUSTOMERS,
} from '../lib/dang-tai/customers';
import { processWeighingSlip } from '../lib/dang-tai/orderValidator';
import { XeDangTai, OcrPhieuCanResult } from '../lib/dang-tai/types';

describe('Customer Normalization (Nhóm Khách Hàng Chơn Chính)', () => {
  it('should have 119 real master customers loaded from fresh rice file', () => {
    expect(MASTER_CUSTOMERS.length).toBe(119);
    const lamTN = MASTER_CUSTOMERS.find((c) => c.name === 'LÂM TÂY NINH');
    expect(lamTN).toBeDefined();
    expect(lamTN?.count).toBe(60);
  });

  describe('stripVietnameseHonorifics', () => {
    it('should strip common Vietnamese honorifics', () => {
      expect(stripVietnameseHonorifics('a lâm')).toBe('lâm');
      expect(stripVietnameseHonorifics('a. lâm')).toBe('lâm');
      expect(stripVietnameseHonorifics('anh lâm')).toBe('lâm');
      expect(stripVietnameseHonorifics('chị hằng')).toBe('hằng');
      expect(stripVietnameseHonorifics('c hằng')).toBe('hằng');
      expect(stripVietnameseHonorifics('c. hằng')).toBe('hằng');
      expect(stripVietnameseHonorifics('chú út')).toBe('út');
      expect(stripVietnameseHonorifics('bác thái')).toBe('thái');
      expect(stripVietnameseHonorifics('ông dốn')).toBe('dốn');
      expect(stripVietnameseHonorifics('em bảo')).toBe('bảo');
    });
  });

  describe('normalizeCustomerName', () => {
    it('should normalize "a lâm tây ninh" to "LÂM TÂY NINH"', () => {
      expect(normalizeCustomerName('a lâm tây ninh')).toBe('LÂM TÂY NINH');
      expect(normalizeCustomerName('a. lâm tây ninh')).toBe('LÂM TÂY NINH');
      expect(normalizeCustomerName('A LAM TAY NINH')).toBe('LÂM TÂY NINH');
      expect(normalizeCustomerName('anh lam tay ninh')).toBe('LÂM TÂY NINH');
      expect(normalizeCustomerName('anh lâm tn')).toBe('LÂM TÂY NINH');
      expect(normalizeCustomerName('a lâm tn')).toBe('LÂM TÂY NINH');
    });

    it('should normalize other popular master suppliers', () => {
      expect(normalizeCustomerName('c hằng kiên giang')).toBe('HẰNG KIÊN GIANG');
      expect(normalizeCustomerName('anh thái đl')).toBe('THÁI ĐĂK LĂK');
      expect(normalizeCustomerName('thái daklak')).toBe('THÁI ĐĂK LĂK');
      expect(normalizeCustomerName('chú út mỹ quý')).toBe('ÚT MỸ QUÝ');
      expect(normalizeCustomerName('trường cm')).toBe('TRƯỜNG CÀ MAU');
      expect(normalizeCustomerName('anh trường cà mau')).toBe('TRƯỜNG CÀ MAU');
    });

    it('should uppercase and strip honorifics for unknown names cleanly', () => {
      expect(normalizeCustomerName('anh nguyễn văn x')).toBe('NGUYỄN VĂN X');
      expect(normalizeCustomerName('công ty tnhh abc')).toBe('CÔNG TY TNHH ABC');
    });

    it('should handle empty or null values safely', () => {
      expect(normalizeCustomerName('')).toBe('');
      expect(normalizeCustomerName(null)).toBe('');
      expect(normalizeCustomerName(undefined)).toBe('');
    });
  });

  describe('searchMasterCustomers', () => {
    it('should find LÂM TÂY NINH when searching with honorifics or abbreviations', () => {
      const results1 = searchMasterCustomers('a lam');
      expect(results1.some((c) => c.name === 'LÂM TÂY NINH')).toBe(true);

      const results2 = searchMasterCustomers('lâm tn');
      expect(results2.some((c) => c.name === 'LÂM TÂY NINH')).toBe(true);
    });

    it('should return top popular suppliers when query is empty', () => {
      const top = searchMasterCustomers('', 5);
      expect(top.length).toBe(5);
      expect(top[0].count).toBeGreaterThan(0);
    });
  });

  describe('orderValidator integration', () => {
    it('should auto-normalize phieu.khachHang to uppercase master customer in processWeighingSlip', () => {
      const phieu: OcrPhieuCanResult = {
        soXe: '66C-123.45',
        soPhieu: 'PC-001',
        khachHang: 'a lâm tây ninh',
        tlXeHangKg: 25000,
        tlXeKg: 10000,
        tlHangKg: 15000,
        rawText: '...',
        confidence: 0.95,
      };

      const trucks: XeDangTai[] = [
        {
          id: 't1',
          stt: 1,
          ngayDangTai: '2026-10-25',
          bienSoXe: '66C-123.45',
          nhaCungCap: '',
          soLuongUocTinh: 15000,
          loaiLua: '5451',
          trangThai: 'cho_can',
          canHopLeSTT: true,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        },
      ];

      const result = processWeighingSlip(phieu, trucks);
      expect(result.matched).toBe(true);
      expect(result.updatedXe?.khachHangCan).toBe('LÂM TÂY NINH');
      expect(result.updatedXe?.nhaCungCap).toBe('LÂM TÂY NINH');
    });
  });
});
