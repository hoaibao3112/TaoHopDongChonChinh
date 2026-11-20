import { describe, it, expect } from 'vitest';
import { removeVietnameseTones, matchUnaccent } from '../lib/dang-tai/unaccent';
import { searchDrivers, upsertDriver, TaiXeEntry } from '../lib/dang-tai/drivers';

describe('8. Tìm Kiếm Không Dấu (Unaccent Matching)', () => {
  it('chuyển đổi chuỗi tiếng Việt có dấu thành không dấu chuẩn xác', () => {
    expect(removeVietnameseTones('Nguyễn Văn A')).toBe('nguyen van a');
    expect(removeVietnameseTones('Đặng Thị Thúy')).toBe('dang thi thuy');
    expect(removeVietnameseTones('Trần Văn Đức')).toBe('tran van duc');
    expect(removeVietnameseTones('A Lâm Tây Ninh')).toBe('a lam tay ninh');
  });

  it('khớp tìm kiếm không dấu dù gõ chữ thường, chữ hoa hoặc không dấu', () => {
    expect(matchUnaccent('Nguyễn Văn A', 'nguyen van a')).toBe(true);
    expect(matchUnaccent('Nguyễn Văn A', 'van')).toBe(true);
    expect(matchUnaccent('Nguyễn Văn A', 'NGUYEN')).toBe(true);
    expect(matchUnaccent('A Lâm Tây Ninh', 'lam')).toBe(true);
    expect(matchUnaccent('A Lâm Tây Ninh', 'tay ninh')).toBe(true);
    expect(matchUnaccent('Trần Văn Đức', 'duc')).toBe(true);
    expect(matchUnaccent('Trần Văn Đức', 'quang')).toBe(false);
  });
});

describe('9. Danh Bạ Tài Xế & Tìm Kiếm / Thêm Nhanh', () => {
  const sampleDrivers: TaiXeEntry[] = [
    {
      id: '1',
      ten: 'A Lâm Tây Ninh',
      sdt: '0987778797',
      nameSearch: 'a lam tay ninh',
      updatedAt: '',
    },
    {
      id: '2',
      ten: 'Nguyễn Văn Nam',
      sdt: '0912345678',
      nameSearch: 'nguyen van nam',
      updatedAt: '',
    },
    {
      id: '3',
      ten: 'Trần Văn Đức',
      sdt: '0908123456',
      nameSearch: 'tran van duc',
      updatedAt: '',
    },
  ];

  it('lọc tài xế bằng tiếng Việt không dấu', () => {
    // Gõ "nguyen van" -> ra Nguyễn Văn Nam
    const res1 = searchDrivers('nguyen van', sampleDrivers);
    expect(res1.length).toBe(1);
    expect(res1[0].ten).toBe('Nguyễn Văn Nam');

    // Gõ "lam" -> ra A Lâm Tây Ninh
    const res2 = searchDrivers('lam', sampleDrivers);
    expect(res2.length).toBe(1);
    expect(res2[0].ten).toBe('A Lâm Tây Ninh');

    // Gõ một phần SĐT "0987" -> ra A Lâm Tây Ninh
    const res3 = searchDrivers('0987', sampleDrivers);
    expect(res3.length).toBe(1);
    expect(res3[0].ten).toBe('A Lâm Tây Ninh');
  });

  it('upsertDriver thêm tài xế mới hoặc cập nhật SĐT nếu đã có', async () => {
    const uniqueName = `Tài Xế Mới ${Date.now()}`;
    // Thêm tài xế mới
    const { driver: newDriver, isNew } = await upsertDriver(uniqueName, '0944112233');
    expect(isNew).toBe(true);
    expect(newDriver.ten).toBe(uniqueName);
    expect(newDriver.sdt).toBe('0944112233');

    // Cập nhật SĐT cho tài xế vừa thêm
    const { driver: updatedDriver, isNew: isNewSecond } = await upsertDriver(uniqueName, '0988999888');
    expect(isNewSecond).toBe(false);
    expect(updatedDriver.sdt).toBe('0988999888');
  });
});
