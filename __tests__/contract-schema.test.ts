import { describe, it, expect } from 'vitest';
import { contractFormSchema } from '../lib/contract-schema';

describe('Validation Schema Hợp Đồng (Zod)', () => {
  const validBaseData = {
    contractNo: '250926/CC-TP',
    signDate: '2026-09-25',
    deliveryDate: '2026-10-25',
    bName: 'CÔNG TY TNHH SẢN XUẤT - THƯƠNG MẠI - DỊCH VỤ THÀNH PHÁT TG',
    bAddress: '135 Trần Ngọc Giải, Phường Thới Sơn, Tỉnh Đồng Tháp',
    bPhone: '0902589705',
    bMst: '1201695642',
    bRepresentative: 'MAI TRẦN ĐĂNG GIANG',
    bTitle: 'Phó Giám đốc',
    deliveryLocation: 'Giao hàng tại kho Bên A.',
    paymentMethod: 'Chuyển khoản 100% giá trị đơn hàng.',
    items: [
      {
        name: 'Trấu',
        quantity: 200000,
        unit: 'kg',
        unitPrice: 1800,
      },
    ],
  };

  it('Dữ liệu hợp lệ chuẩn hóa thành công', () => {
    const result = contractFormSchema.safeParse(validBaseData);
    expect(result.success).toBe(true);
  });

  it('MST sai (chỉ có 9 số) -> Báo lỗi', () => {
    const result = contractFormSchema.safeParse({
      ...validBaseData,
      bMst: '123456789',
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.flatten().fieldErrors.bMst).toBeDefined();
    }
  });

  it('MST sai (chứa chữ cái) -> Báo lỗi', () => {
    const result = contractFormSchema.safeParse({
      ...validBaseData,
      bMst: '120169564A',
    });
    expect(result.success).toBe(false);
  });

  it('MST chuẩn 10 số kèm 3 số chi nhánh (1201695642-001) -> Hợp lệ', () => {
    const result = contractFormSchema.safeParse({
      ...validBaseData,
      bMst: '1201695642-001',
    });
    expect(result.success).toBe(true);
  });

  it('Ngày giao ngược (trước ngày ký) -> Báo lỗi', () => {
    const result = contractFormSchema.safeParse({
      ...validBaseData,
      signDate: '2026-10-25',
      deliveryDate: '2026-09-25',
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.flatten().fieldErrors.deliveryDate).toBeDefined();
    }
  });

  it('Mảng hàng rỗng (items: []) -> Báo lỗi', () => {
    const result = contractFormSchema.safeParse({
      ...validBaseData,
      items: [],
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.flatten().fieldErrors.items).toBeDefined();
    }
  });

  it('Hàng hóa có số lượng âm hoặc bằng 0 -> Báo lỗi', () => {
    const result = contractFormSchema.safeParse({
      ...validBaseData,
      items: [
        {
          name: 'Trấu',
          quantity: 0,
          unit: 'kg',
          unitPrice: 1800,
        },
      ],
    });
    expect(result.success).toBe(false);
  });

  it('Hàng hóa có đơn giá âm hoặc bằng 0 -> Báo lỗi', () => {
    const result = contractFormSchema.safeParse({
      ...validBaseData,
      items: [
        {
          name: 'Trấu',
          quantity: 100,
          unit: 'kg',
          unitPrice: 0,
        },
      ],
    });
    expect(result.success).toBe(false);
  });
});

