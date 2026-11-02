export interface CompanyABankAccount {
  id: string;
  accountNumber: string;
  bankName: string;
  accountHolder: string;
  label: string;
  shortName: string;
}

export const COMPANY_A_BANK_ACCOUNTS: readonly CompanyABankAccount[] = [
  {
    id: 'mb',
    accountNumber: '070977789777',
    bankName: 'TMCP Quân Đôi MB bank -CN ĐỒNG THÁP',
    accountHolder: 'CÔNG TY TNHH XUẤT NHẬP KHẨU CHƠN CHÍNH',
    label: 'MB Bank — 070977789777 (CN Đồng Tháp)',
    shortName: 'MB Bank',
  },
  {
    id: 'bac-a',
    accountNumber: '660001066668888',
    bankName: 'BẮC Á BANK – chi nhánh ĐỒNG THÁP',
    accountHolder: 'CÔNG TY TNHH XNK CHON CHINH',
    label: 'Bắc Á Bank — 660001066668888 (CN Đồng Tháp)',
    shortName: 'Bắc Á Bank',
  },
  {
    id: 'vietinbank',
    accountNumber: '117977789777',
    bankName: 'VIETINBANK - CHI NHÁNH TÂY TIỀN GIANG',
    accountHolder: 'CÔNG TY TNHH XUẤT NHẬP KHẨU CHƠN CHÍNH',
    label: 'VietinBank — 117977789777 (CN Tây Tiền Giang)',
    shortName: 'VietinBank',
  },
] as const;

/**
 * Thông tin Bên A cố định — trích xuất chính xác 100% từ file hợp đồng mẫu gốc.
 * Không thay đổi theo yêu cầu người dùng trên form.
 */
export const COMPANY_A = {
  name: 'CÔNG TY TNHH XUẤT NHẬP KHẨU CHƠN CHÍNH (BÊN BÁN)',
  companyShortName: 'Công ty TNHH XNK Chơn Chính',
  address: 'Đường ĐT 846, Ấp 5, Xã Đốc Binh Kiều, Tỉnh Đồng Tháp, Việt Nam',
  phone: '0977 789 777',
  mst: '1402017541',
  representative: 'NGUYỄN THỊ DIỄM',
  title: 'Phó giám đốc',
  authorizationNote: '(Theo giấy ủy quyền số: 15.09/UQ-CC)',
  bankAccount: COMPANY_A_BANK_ACCOUNTS[0].accountNumber,
  bankName: COMPANY_A_BANK_ACCOUNTS[0].bankName,
  bankAccounts: COMPANY_A_BANK_ACCOUNTS,
  signerName: 'NGUYỄN THỊ DIỄM',
} as const;

