import { NhapTrauItem, RiceTypePrice } from './nhap-types';

export interface CS1Worker {
  id: string;
  name: string;
  advanceSalary: number; // Số tiền tạm ứng
  salaryAmount?: number; // Số tiền được nhận sau phân bổ
  accountNumber: string;
  bankName: string;
  accountHolder: string;
}

/**
 * Danh sách công nhân mặc định của ĐỘI ANH NGHỊ (Cơ sở 1)
 * Trích xuất từ file: LƯƠNG THÁNG 10 ĐỘI NGHỊ.xlsx
 */
export const DEFAULT_DOI_NGHI_WORKERS: CS1Worker[] = [
  {
    id: 'nghi-1',
    name: 'NGUYỄN VĂN TÁM',
    advanceSalary: 0,
    salaryAmount: 2_412_000,
    accountNumber: '1057283842',
    bankName: 'VIETCOMBANK',
    accountHolder: 'NGUYEN MINH TOAN',
  },
  {
    id: 'nghi-2',
    name: 'LÊ VĂN THẢO',
    advanceSalary: 0,
    salaryAmount: 2_200_000,
    accountNumber: '80001529282',
    bankName: 'MSB HÀNG HẢI',
    accountHolder: 'LE VAN THAO',
  },
  {
    id: 'nghi-3',
    name: 'LÊ THANH NGÀ',
    advanceSalary: 0,
    salaryAmount: 2_945_000,
    accountNumber: '80001529252',
    bankName: 'MSB HÀNG HẢI',
    accountHolder: 'LE THANH NGA',
  },
  {
    id: 'nghi-4',
    name: 'TRẦN VĂN KHỞI',
    advanceSalary: 0,
    salaryAmount: 2_968_000,
    accountNumber: '80001528339',
    bankName: 'MSB HÀNG HẢI',
    accountHolder: 'TRAN VAN KHOI',
  },
  {
    id: 'nghi-5',
    name: 'PHẠM VĂN SƠN',
    advanceSalary: 0,
    salaryAmount: 968_000,
    accountNumber: '80001529072',
    bankName: 'MSB HÀNG HẢI',
    accountHolder: 'PHAM VAN SON',
  },
  {
    id: 'nghi-6',
    name: 'NGUYỄN VĂN TRANH',
    advanceSalary: 0,
    salaryAmount: 3_042_000,
    accountNumber: '80001529394',
    bankName: 'MSB HÀNG HẢI',
    accountHolder: 'NGUYEN VAN TRANH',
  },
  {
    id: 'nghi-7',
    name: 'NGUYỄN VĂN BÉ NĂM',
    advanceSalary: 0,
    salaryAmount: 3_512_000,
    accountNumber: '0386536956',
    bankName: 'MB QUÂN ĐỘI',
    accountHolder: 'NGUYEN VAN BE NAM',
  },
  {
    id: 'nghi-8',
    name: 'PHẠM VĂN TIỂN',
    advanceSalary: 0,
    salaryAmount: 0,
    accountNumber: '6902205650753',
    bankName: 'AGRIBANK',
    accountHolder: 'PHAM VAN TIEN',
  },
  {
    id: 'nghi-9',
    name: 'LƯƠNG HỮU NGHỊ',
    advanceSalary: 0,
    salaryAmount: 9_713_000,
    accountNumber: '0977202260',
    bankName: 'MB QUÂN ĐỘI',
    accountHolder: 'LUONG HUU NGHI',
  },
  {
    id: 'nghi-10',
    name: 'NGUYỄN VĂN MƯỜI',
    advanceSalary: 0,
    salaryAmount: 3_142_000,
    accountNumber: '6902392297643',
    bankName: 'AGRIBANK',
    accountHolder: 'NGUYEN VAN MUOI',
  },
  {
    id: 'nghi-11',
    name: 'NGUYỄN TẤN LỰC',
    advanceSalary: 0,
    salaryAmount: 1_578_000,
    accountNumber: '0375374758',
    bankName: 'VPBANK',
    accountHolder: 'NGUYEN TAN LUC',
  },
];

/**
 * Danh sách công nhân mặc định của ĐỘI ANH NGUYÊN (Cơ sở 1)
 * Trích xuất từ file: LƯƠNG THÁNG 10 NGUYÊN.xlsx
 */
export const DEFAULT_DOI_NGUYEN_WORKERS: CS1Worker[] = [
  {
    id: 'nguyen-1',
    name: 'PHẠM VĂN SƠN',
    advanceSalary: 3_000_000,
    salaryAmount: 3_000_000,
    accountNumber: '80001529072',
    bankName: 'MSB HÀNG HẢI',
    accountHolder: 'PHAM VAN SON',
  },
  {
    id: 'nguyen-2',
    name: 'HÀ HỮU NGUYÊN',
    advanceSalary: 3_000_000,
    salaryAmount: 11_442_000,
    accountNumber: '80001528358',
    bankName: 'MSB HÀNG HẢI',
    accountHolder: 'HA HUU NGUYEN',
  },
  {
    id: 'nguyen-3',
    name: 'PHẠM VĂN THẢO',
    advanceSalary: 2_000_000,
    salaryAmount: 3_000_000,
    accountNumber: '6902205115358',
    bankName: 'AGRIBANK',
    accountHolder: 'PHAM VAN THAO',
  },
  {
    id: 'nguyen-4',
    name: 'HÀ HỮU NGÂN',
    advanceSalary: 0,
    salaryAmount: 4_000_000,
    accountNumber: '6902231078155',
    bankName: 'AGRIBANK',
    accountHolder: 'NGUYEN THI CAM NHUNG',
  },
  {
    id: 'nguyen-5',
    name: 'LÊ VĂN DUYÊN',
    advanceSalary: 0,
    salaryAmount: 4_000_000,
    accountNumber: '6902205646132',
    bankName: 'AGRIBANK',
    accountHolder: 'LE VAN DUYEN',
  },
  {
    id: 'nguyen-6',
    name: 'PHẠM VĂN TIỂN',
    advanceSalary: 0,
    salaryAmount: 4_000_000,
    accountNumber: '80001529252',
    bankName: 'MSB HÀNG HẢI',
    accountHolder: 'LE THANH NGA',
  },
  {
    id: 'nguyen-7',
    name: 'PHAN VĂN NHÂN',
    advanceSalary: 0,
    salaryAmount: 4_000_000,
    accountNumber: '6902205645181',
    bankName: 'AGRIBANK',
    accountHolder: 'PHAN VAN NHAN',
  },
  {
    id: 'nguyen-8',
    name: 'NGUYỄN VĂN MƯỜI',
    advanceSalary: 0,
    salaryAmount: 0,
    accountNumber: '6902392297643',
    bankName: 'AGRIBANK',
    accountHolder: 'NGUYEN VAN MUOI',
  },
  {
    id: 'nguyen-9',
    name: 'NGUYỄN THANH TÚ',
    advanceSalary: 0,
    salaryAmount: 0,
    accountNumber: '80001529252',
    bankName: 'MSB HÀNG HẢI',
    accountHolder: 'LE THANH NGA',
  },
];

/**
 * Danh sách chuyến trấu mẫu Tháng 10/2026 - Đội Nghị
 */
export const DEFAULT_OCTOBER_TRAU_NGHI: NhapTrauItem[] = [
  { id: 'tn-1', ngay: '02/10/2026', phuongTien: 'ÔNG 5', soLuong: 11, donGia: 27273, thanhTien: 300_000 },
  { id: 'tn-2', ngay: '04/10/2026', phuongTien: 'ÔNG 5', soLuong: 11, donGia: 27273, thanhTien: 300_000 },
  { id: 'tn-3', ngay: '06/10/2026', phuongTien: 'ÔNG 5', soLuong: 11, donGia: 27273, thanhTien: 300_000 },
  { id: 'tn-4', ngay: '10/10/2026', phuongTien: 'ÔNG 5', soLuong: 11, donGia: 27273, thanhTien: 300_000 },
  { id: 'tn-5', ngay: '20/10/2026', phuongTien: 'TÀU ĐÔ 49', soLuong: 19, donGia: 27000, thanhTien: 513_000 },
  { id: 'tn-6', ngay: '28/10/2026', phuongTien: 'ÔNG 5', soLuong: 11, donGia: 27273, thanhTien: 300_000 },
];

/**
 * Danh sách chuyến trấu mẫu Tháng 10/2026 - Đội Nguyên
 */
export const DEFAULT_OCTOBER_TRAU_NGUYEN: NhapTrauItem[] = [
  { id: 'tng-1', ngay: '01/10/2026', phuongTien: 'ÔNG 5', soLuong: 11, donGia: 27273, thanhTien: 300_000 },
  { id: 'tng-2', ngay: '03/10/2026', phuongTien: 'ÔNG 5', soLuong: 11, donGia: 27273, thanhTien: 300_000 },
  { id: 'tng-3', ngay: '05/10/2026', phuongTien: 'ÔNG 5', soLuong: 11, donGia: 27273, thanhTien: 300_000 },
  { id: 'tng-4', ngay: '09/10/2026', phuongTien: 'ÔNG 5', soLuong: 11, donGia: 27273, thanhTien: 300_000 },
  { id: 'tng-5', ngay: '11/10/2026', phuongTien: 'ÔNG 5', soLuong: 11, donGia: 27273, thanhTien: 300_000 },
  { id: 'tng-6', ngay: '19/10/2026', phuongTien: 'ÔNG 5', soLuong: 15, donGia: 27000, thanhTien: 405_000 },
  { id: 'tng-7', ngay: '27/10/2026', phuongTien: 'ÔNG 5', soLuong: 11, donGia: 27273, thanhTien: 300_000 },
];

/**
 * Bảng giá các loại lúa cơ sở 1 chuẩn
 */
export const DEFAULT_CS1_RICE_PRICES: RiceTypePrice[] = [
  { id: 'p1', riceType: 'OM18', pricePerTon: 20_000 },
  { id: 'p2', riceType: 'JAPONICA', pricePerTon: 20_000 },
  { id: 'p3', riceType: 'JAPONICA-DS1', pricePerTon: 20_000 },
  { id: 'p4', riceType: 'THƠM LÀI', pricePerTon: 20_000 },
  { id: 'p5', riceType: 'TL4T-LOẠI 1', pricePerTon: 20_000 },
  { id: 'p6', riceType: 'TL4T-LOẠI 2', pricePerTon: 20_000 },
  { id: 'p7', riceType: 'TL6T-LOẠI 2', pricePerTon: 20_000 },
  { id: 'p8', riceType: 'ĐT8', pricePerTon: 20_000 },
  { id: 'p9', riceType: 'ST25 ĐL', pricePerTon: 23_000 },
  { id: 'p10', riceType: 'ST25 KDM', pricePerTon: 23_000 },
  { id: 'p11', riceType: 'HP1', pricePerTon: 23_000 },
];
