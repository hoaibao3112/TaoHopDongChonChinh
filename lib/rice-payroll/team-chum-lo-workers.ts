export interface ChumLoWorker {
  id: string;
  name: string;
  advanceSalary: number; // Số tiền tạm ứng (mặc định 2.000.000đ)
  accountNumber: string;
  bankName: string;
  accountHolder: string;
}

/**
 * Danh sách công nhân mặc định của Đội Chụm Lò Cơ Sở 1 (Đội Nguyên)
 * Căn cứ theo file chuẩn: TONG_HOP_DOI_CHỤM LÒ_T10_2026_XONG.xlsx
 */
export const DEFAULT_CHUM_LO_WORKERS: ChumLoWorker[] = [
  {
    id: 'worker-1',
    name: 'TRƯƠNG THỊ LOAN',
    advanceSalary: 2_000_000,
    accountNumber: '0366307602',
    bankName: 'MB QUÂN ĐỘI',
    accountHolder: 'TRƯƠNG THỊ LOAN',
  },
  {
    id: 'worker-2',
    name: 'TRƯƠNG VĂN CAO LƯƠNG',
    advanceSalary: 2_000_000,
    accountNumber: '80001509290',
    bankName: 'MSB HÀNG HẢI',
    accountHolder: 'TRUONG VAN CAO LUONG',
  },
  {
    id: 'worker-3',
    name: 'VÕ THỊ THANH',
    advanceSalary: 2_000_000,
    accountNumber: '0976571176',
    bankName: 'SHB NH SÀI GÒN HÀ NỘI',
    accountHolder: 'VO THI THANH',
  },
];

export const DEFAULT_CHUM_LO_UNIT_PRICE = 5_000; // 5.000 đồng/tấn

