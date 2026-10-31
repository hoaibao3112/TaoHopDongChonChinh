import { describe, it, expect } from 'vitest';
import { moneyToVietnameseWords, formatVND } from '../lib/number-to-vi-words';

describe('Đọc số tiền bằng chữ tiếng Việt (moneyToVietnameseWords)', () => {
  it('0 -> Không đồng', () => {
    expect(moneyToVietnameseWords(0)).toBe('Không đồng');
  });

  it('21 -> Hai mươi mốt đồng', () => {
    expect(moneyToVietnameseWords(21)).toBe('Hai mươi mốt đồng');
  });

  it('105 -> Một trăm lẻ năm đồng', () => {
    expect(moneyToVietnameseWords(105)).toBe('Một trăm lẻ năm đồng');
  });

  it('1.015.000 -> Một triệu không trăm mười lăm nghìn đồng', () => {
    expect(moneyToVietnameseWords(1_015_000)).toBe('Một triệu không trăm mười lăm nghìn đồng');
  });

  it('1.000.000.000 -> Một tỷ đồng', () => {
    expect(moneyToVietnameseWords(1_000_000_000)).toBe('Một tỷ đồng');
  });

  it('360.000.000 (Hợp đồng mẫu) -> Ba trăm sáu mươi triệu đồng', () => {
    expect(moneyToVietnameseWords(360_000_000)).toBe('Ba trăm sáu mươi triệu đồng');
  });

  it('Số lớn: 12.345.678.900 đồng', () => {
    const text = moneyToVietnameseWords(12_345_678_900);
    expect(text).toContain('tỷ');
    expect(text).toContain('triệu');
    expect(text).toContain('nghìn');
    expect(text).toContain('đồng');
  });

  it('Báo lỗi với số âm hoặc Infinity', () => {
    expect(() => moneyToVietnameseWords(-100)).toThrow(RangeError);
    expect(() => moneyToVietnameseWords(Infinity)).toThrow(RangeError);
    expect(() => moneyToVietnameseWords(NaN)).toThrow(RangeError);
  });
});

describe('Format định dạng VND (formatVND)', () => {
  it('Format đúng hàng nghìn có dấu chấm', () => {
    expect(formatVND(360000000)).toBe('360.000.000');
    expect(formatVND(1800)).toBe('1.800');
    expect(formatVND(0)).toBe('0');
  });
});

