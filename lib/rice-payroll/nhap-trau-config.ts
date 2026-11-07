import { NhapTrauItem } from './nhap-types';

/**
 * Dữ liệu mẫu nhập trấu tháng 10/2026 từ file TONG_HOP_DOI_DƯƠNG_CS2_NHẬP_T10_2026
 * Tổng cộng: 75 tấn, thành tiền = 2.040.000 VNĐ
 */
export const DEFAULT_OCTOBER_TRAU_ITEMS: NhapTrauItem[] = [
  {
    id: 'trau-1',
    date: '01/10/2026',
    doiNhap: 'DƯƠNG',
    phuongTien: 'ÔNG 5',
    soLuong: 22,
    donGia: 27273,
    thanhTien: 600000,
  },
  {
    id: 'trau-2',
    date: '09/10/2026',
    doiNhap: 'DƯƠNG',
    phuongTien: 'ÔNG 5',
    soLuong: 11,
    donGia: 27273,
    thanhTien: 300000,
  },
  {
    id: 'trau-3',
    date: '14/10/2026',
    doiNhap: 'DƯƠNG',
    phuongTien: 'ÔNG 5',
    soLuong: 22,
    donGia: 27273,
    thanhTien: 600000,
  },
  {
    id: 'trau-4',
    date: '21/10/2026',
    doiNhap: 'DƯƠNG',
    phuongTien: 'NGUYÊN NGUYÊN 18 ',
    soLuong: 20,
    donGia: 27000,
    thanhTien: 540000,
  },
];

