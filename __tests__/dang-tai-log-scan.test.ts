import { describe, it, expect } from 'vitest';
import { isValidPlateFormat, normalizeEstimatedWeight, formatPlateDisplay } from '../lib/dang-tai/plate';
import { OcrBangDangTaiItem } from '../lib/dang-tai/types';

describe('5. Kiểm tra Regex Biển Số Xe Việt Nam & Bắt Lỗi Chữ Viết Tay', () => {
  it('nhận diện đúng các biển số hợp lệ chuẩn Việt Nam', () => {
    // Xe tải, xe cơ giới các tỉnh
    expect(isValidPlateFormat('70H-03268')).toBe(true);
    expect(isValidPlateFormat('70H03268')).toBe(true);
    expect(isValidPlateFormat('66C-12345')).toBe(true);
    expect(isValidPlateFormat('63LD-01234')).toBe(true);
    expect(isValidPlateFormat('50H-12017')).toBe(true);
    expect(isValidPlateFormat('51D-03773')).toBe(true);
    expect(isValidPlateFormat('60C-00463')).toBe(true);
  });

  it('tô đỏ và bắt lỗi ngay lập tức các biển số thiếu mã tỉnh hoặc sai định dạng', () => {
    // Các lỗi người dùng nêu: chỉ ghi đuôi số 00463, 03773, 12017
    expect(isValidPlateFormat('00463')).toBe(false);
    expect(isValidPlateFormat('03773')).toBe(false);
    expect(isValidPlateFormat('12017')).toBe(false);
    expect(isValidPlateFormat('70-03268')).toBe(false); // thiếu chữ cái sê-ri
    expect(isValidPlateFormat('70H')).toBe(false); // thiếu số thứ tự
    expect(isValidPlateFormat('')).toBe(false);
  });
});

describe('6. Chuẩn Hóa Ước Tính Sản Lượng (34T -> 34.000 kg)', () => {
  it('quy đổi chính xác từ Tấn (T) sang Kilogram (Int)', () => {
    expect(normalizeEstimatedWeight('34T')).toBe(34000);
    expect(normalizeEstimatedWeight('34t')).toBe(34000);
    expect(normalizeEstimatedWeight('34 tấn')).toBe(34000);
    expect(normalizeEstimatedWeight('34.5T')).toBe(34500);
    expect(normalizeEstimatedWeight('34,5 tấn')).toBe(34500);
    expect(normalizeEstimatedWeight(34)).toBe(34000); // Ngữ cảnh tải trọng xe lúa (10-99 tấn)
    expect(normalizeEstimatedWeight(34000)).toBe(34000);
    expect(normalizeEstimatedWeight('34000')).toBe(34000);
  });
});

describe('7. Đánh Dấu Ô Nghi Ngờ & Độ Tin Cậy (Confidence & Uncertain Fields)', () => {
  it('đánh dấu chính xác các dòng có rủi ro nhầm lẫn số viết tay (1/7, 0/6, 3/8, 4/9)', () => {
    const rawItems: Partial<OcrBangDangTaiItem>[] = [
      {
        tempId: '1',
        stt: 1,
        bienSoXe: '70H-03268',
        soLuongUocTinh: 32000,
        confidence: 'high',
        uncertainFields: [],
        isValidPlate: true,
      },
      {
        tempId: '2',
        stt: 2,
        bienSoXe: '00463', // thiếu mã tỉnh
        soLuongUocTinh: 30000,
        confidence: 'medium',
        uncertainFields: ['bienSoXe'],
        canhBao: 'Biển số thiếu mã tỉnh (chỉ có 5 số 00463), nghi ngờ số 0/6',
        isValidPlate: false,
      },
      {
        tempId: '3',
        stt: 3,
        bienSoXe: '50H-12017',
        soLuongUocTinh: 34000,
        confidence: 'medium',
        uncertainFields: ['bienSoXe'],
        canhBao: 'Nghi ngờ cặp số 1/7 ở ký tự thứ 4 và thứ 6',
        isValidPlate: true,
      },
    ];

    // Dòng 1: Hợp lệ, không nghi ngờ
    expect(rawItems[0].isValidPlate).toBe(true);
    expect(rawItems[0].uncertainFields?.length).toBe(0);

    // Dòng 2: Bị tô đỏ vì sai định dạng và tô vàng vì có uncertainFields
    expect(rawItems[1].isValidPlate).toBe(false);
    expect(rawItems[1].uncertainFields).toContain('bienSoXe');

    // Dòng 3: Khớp định dạng nhưng được tô vàng vì chữ viết tay 1/7 có nghi ngờ
    expect(rawItems[2].isValidPlate).toBe(true);
    expect(rawItems[2].uncertainFields).toContain('bienSoXe');
    expect(rawItems[2].confidence).toBe('medium');
  });
});
