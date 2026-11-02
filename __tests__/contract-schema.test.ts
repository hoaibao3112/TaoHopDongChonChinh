import { describe, it, expect } from 'vitest';
import { contractFormSchema } from '../lib/contract-schema';

describe('Validation Schema Hợp Đồng (Zod)', () => {
  const validBaseData = {
    contractNo: '250926/CC-TP',
    signDate: '2026-09-25',
    deliveryStartDate: '2026-09-25',
    deliveryEndDate: '2026-10-25',
    aBankAccountId: 'mb',
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
        unitPrice: 1800,
      },
    ],
  };

  it('Dữ liệu hợp lệ chuẩn hóa thành công', () => {
    const result = contractFormSchema.safeParse(validBaseData);
    expect(result.success).toBe(true);
  });

  it('Tên người đại diện viết thường -> Tự động chuyển thành chữ IN HOA', () => {
    const result = contractFormSchema.safeParse({
      ...validBaseData,
      bRepresentative: 'mai trần đăng giang',
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.bRepresentative).toBe('MAI TRẦN ĐĂNG GIANG');
    }
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

  it('Ngày giao ngược (kết thúc trước ngày bắt đầu) -> Báo lỗi', () => {
    const result = contractFormSchema.safeParse({
      ...validBaseData,
      deliveryStartDate: '2026-10-25',
      deliveryEndDate: '2026-09-25',
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.flatten().fieldErrors.deliveryEndDate).toBeDefined();
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
          unitPrice: 0,
        },
      ],
    });
    expect(result.success).toBe(false);
  });

  it('Tài khoản ngân hàng Bên A mặc định là mb và cho phép chọn bac-a hoặc vietinbank', () => {
    const defaultRes = contractFormSchema.safeParse(validBaseData);
    expect(defaultRes.success).toBe(true);
    if (defaultRes.success) {
      expect(defaultRes.data.aBankAccountId).toBe('mb');
    }

    const bacARes = contractFormSchema.safeParse({
      ...validBaseData,
      aBankAccountId: 'bac-a',
    });
    expect(bacARes.success).toBe(true);
    if (bacARes.success) {
      expect(bacARes.data.aBankAccountId).toBe('bac-a');
    }

    const vietinRes = contractFormSchema.safeParse({
      ...validBaseData,
      aBankAccountId: 'vietinbank',
    });
    expect(vietinRes.success).toBe(true);
    if (vietinRes.success) {
      expect(vietinRes.data.aBankAccountId).toBe('vietinbank');
    }
  });
});

