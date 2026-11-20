import { removeVietnameseTones } from './unaccent';

export interface TaiXeEntry {
  id: string;
  ten: string;
  sdt: string;
  nameSearch: string; // Tên bỏ dấu phục vụ tìm kiếm nhanh
  bienSoThuongChay?: string;
  ghiChu?: string;
  updatedAt: string;
}

// Danh sách tài xế chuẩn của công ty (đã loại bỏ trùng lặp và chuẩn hóa)
export const OFFICIAL_CHONCHINH_DRIVERS: { ten: string; sdt: string; ghiChu?: string }[] = [
  { ten: 'Nguyễn Công Danh', sdt: '0378854157' },
  { ten: 'Phan Thành Quý', sdt: '0373517190' },
  { ten: 'Lâm Công Văn', sdt: '0963475102' },
  { ten: 'Trần Văn Thuận', sdt: '0369959675' },
  { ten: 'Huỳnh Thái Hùng', sdt: '0937889737' },
  { ten: 'Nguyễn Nghi Được', sdt: '0900103099' },
  { ten: 'Nguyễn Văn Diễn', sdt: '0914487419' },
  { ten: 'Nguyễn Tấn Thời', sdt: '0976522457' },
  { ten: 'Trần Ký Kiệt', sdt: '0365390068' },
  { ten: 'Đỗ Minh Nhơn', sdt: '0989886028' },
  { ten: 'Huỳnh Kim Thạnh', sdt: '0909183897' },
  { ten: 'Lê Vũ Bảo', sdt: '036817659' },
  { ten: 'Nguyễn Phúc Hưng', sdt: '0334945959' },
  { ten: 'Lê Quang Tùng', sdt: '088665179' },
  { ten: 'Nguyễn Văn Phúc', sdt: '0355362470' },
  { ten: 'Đào Thanh Phong', sdt: '0968517957' },
  { ten: 'Trần Anh Thuận', sdt: '0915116769' },
  { ten: 'Võ Tấn Phát', sdt: '0983253422' },
  { ten: 'Trần Nguyên Chánh', sdt: '0938862837' },
  { ten: 'Nguyễn Hoàng Gia Long', sdt: '0367946643' },
];

export const INITIAL_DRIVERS: TaiXeEntry[] = OFFICIAL_CHONCHINH_DRIVERS.map((d, idx) => ({
  id: `drv_${idx + 1}`,
  ten: d.ten,
  sdt: d.sdt,
  nameSearch: removeVietnameseTones(d.ten),
  ghiChu: d.ghiChu,
  updatedAt: '2026-11-20T00:00:00.000Z',
}));
