import { XeDangTai, OcrPhieuCanResult, MatchPhieuCanResult } from './types';
import { arePlatesMatching } from './plate';

export interface ProcessSlipResult {
  phieu: OcrPhieuCanResult;
  matched: boolean;
  xeMatched?: XeDangTai;
  isValidOrder: boolean;
  warningMessage?: string;
  updatedXe?: XeDangTai;
  danhSachCapNhat: XeDangTai[];
  unweighedEarlierTrucks?: { stt: number; bienSoXe: string }[];
}

/**
 * Xử lý khớp phiếu cân với danh sách xe đăng tài và kiểm tra thứ tự STT
 * Quy tắc:
 * 1. Khớp theo Biển số xe (chuẩn hóa hoa/thường, dấu gạch nối)
 * 2. Nếu không tìm thấy biển số trong danh sách -> Cảnh báo chưa đăng tài
 * 3. Nếu tìm thấy:
 *    - Kiểm tra có xe nào có STT nhỏ hơn mà CHƯA CÂN hay không
 *    - Nếu có xe STT nhỏ hơn chưa cân -> Báo "Phiếu cân số X (Xe Y - STT Z) cân chưa hợp lệ! Xe STT ... chưa cân"
 *    - BÁO XONG VẪN TỰ ĐỘNG ĐIỀN vào đúng dòng của xe đó:
 *      + Cập nhật Trọng lượng hàng cân, Trọng lượng xe, Trọng lượng xe + hàng
 *      + Tính Chênh lệch = Trọng lượng hàng - Số lượng ước tính
 *      + Đánh dấu trạng thái 'da_can' (kèm cờ canHopLeSTT = false nếu sai STT)
 */
export function processWeighingSlip(
  phieu: OcrPhieuCanResult,
  danhSachXe: XeDangTai[],
  imageUri?: string
): ProcessSlipResult {
  const soXePhieu = phieu.soXe || '';
  const soPhieu = phieu.soPhieu || '?';

  // 1. Tìm xe có biển số khớp trong danh sách đăng tài
  const xeIndex = danhSachXe.findIndex((xe) => arePlatesMatching(xe.bienSoXe, soXePhieu));

  if (xeIndex === -1) {
    // Không tìm thấy biển số trong danh sách
    const warningMessage = `⚠️ Phiếu cân số ${soPhieu} có Biển số "${soXePhieu || 'Không rõ'}" chưa được đăng tài trước! Vui lòng kiểm tra lại biển số hoặc đăng tài xe trước.`;
    return {
      phieu,
      matched: false,
      isValidOrder: false,
      warningMessage,
      danhSachCapNhat: danhSachXe,
    };
  }

  const xeMatched = danhSachXe[xeIndex];

  // 2. Kiểm tra thứ tự STT
  // Tìm các xe có STT nhỏ hơn mà chưa cân (trangThai === 'cho_can')
  const unweighedEarlierTrucks = danhSachXe
    .filter((xe) => xe.id !== xeMatched.id && xe.stt < xeMatched.stt && xe.trangThai === 'cho_can')
    .map((xe) => ({ stt: xe.stt, bienSoXe: xe.bienSoXe }))
    .sort((a, b) => a.stt - b.stt);

  const isValidOrder = unweighedEarlierTrucks.length === 0;

  let warningMessage: string | undefined = undefined;
  if (!isValidOrder) {
    const listTrucksStr = unweighedEarlierTrucks
      .map((t) => `STT ${t.stt} (${t.bienSoXe})`)
      .join(', ');
    warningMessage = `⚠️ CẢNH BÁO CÂN CHƯA HỢP LỆ: Phiếu cân số ${soPhieu} (Xe ${xeMatched.bienSoXe} - STT ${xeMatched.stt}) được cân trước xe ${listTrucksStr}!`;
  }

  // 3. TỰ ĐỘNG ĐIỀN VÀO ĐÚNG BIỂN SỐ XE
  // Tính trọng lượng và chênh lệch
  const tlHang = typeof phieu.tlHangKg === 'number' && !isNaN(phieu.tlHangKg) ? phieu.tlHangKg : undefined;
  const uocTinh = xeMatched.soLuongUocTinh || 0;
  const chenhLechKg = tlHang !== undefined ? tlHang - uocTinh : undefined;

  const ngayGioCan = phieu.ngayGioCan || xeMatched.ngayGioCan;
  let ngayCan = phieu.ngayCan || xeMatched.ngayCan;
  let gioCan = phieu.gioCan || xeMatched.gioCan;

  if (!ngayCan && ngayGioCan) {
    const parts = ngayGioCan.trim().split(' ');
    if (parts.length >= 2) {
      ngayCan = parts[0];
      if (!gioCan) gioCan = parts[1];
    } else if (ngayGioCan.includes('/') || ngayGioCan.includes('-')) {
      ngayCan = ngayGioCan;
    }
  }

  if (!gioCan && ngayGioCan) {
    const parts = ngayGioCan.trim().split(' ');
    if (parts.length >= 2) {
      gioCan = parts[1];
    } else if (ngayGioCan.includes(':')) {
      gioCan = ngayGioCan;
    }
  }

  const updatedXe: XeDangTai = {
    ...xeMatched,
    trangThai: isValidOrder ? 'da_can' : xeMatched.daChapNhanHopLe ? 'da_can' : 'sai_stt',
    canHopLeSTT: isValidOrder || !!xeMatched.daChapNhanHopLe,
    canhBaoSTT: warningMessage || xeMatched.canhBaoSTT,
    daChapNhanHopLe: xeMatched.daChapNhanHopLe,
    soPhieuCan: phieu.soPhieu || xeMatched.soPhieuCan,
    ngayCan: ngayCan || undefined,
    gioCan: gioCan || undefined,
    ngayGioCan: ngayGioCan,
    khachHangCan: phieu.khachHang || xeMatched.khachHangCan,
    nhaCungCap: phieu.khachHang || xeMatched.nhaCungCap,
    loaiHangCan: phieu.loaiHang || xeMatched.loaiHangCan,
    tlXeHangKg: phieu.tlXeHangKg !== undefined ? phieu.tlXeHangKg : xeMatched.tlXeHangKg,
    tlXeKg: phieu.tlXeKg !== undefined ? phieu.tlXeKg : xeMatched.tlXeKg,
    tlHangKg: tlHang !== undefined ? tlHang : xeMatched.tlHangKg,
    chenhLechKg: chenhLechKg !== undefined ? chenhLechKg : xeMatched.chenhLechKg,
    anhPhieuCan: imageUri || xeMatched.anhPhieuCan,
    ghiChu: phieu.ghiChu
      ? xeMatched.ghiChu
        ? `${xeMatched.ghiChu} | ${phieu.ghiChu}`
        : phieu.ghiChu
      : xeMatched.ghiChu,
    daCanLuc: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  // Cập nhật vào danh sách
  const danhSachCapNhat = [...danhSachXe];
  danhSachCapNhat[xeIndex] = updatedXe;

  return {
    phieu,
    matched: true,
    xeMatched,
    isValidOrder,
    warningMessage,
    updatedXe,
    danhSachCapNhat,
    unweighedEarlierTrucks,
  };
}

/**
 * Tính toán số liệu tổng hợp báo cáo đăng tài
 */
export function calculateDangTaiSummary(danhSachXe: XeDangTai[], ngay: string) {
  const tongXe = danhSachXe.length;
  const daCanXe = danhSachXe.filter((x) => x.trangThai === 'da_can' || x.trangThai === 'sai_stt');
  const daCan = daCanXe.length;
  const choCan = danhSachXe.filter((x) => x.trangThai === 'cho_can').length;
  const saiStt = danhSachXe.filter(
    (x) => (x.trangThai === 'sai_stt' || x.canHopLeSTT === false) && !x.daChapNhanHopLe
  ).length;

  const tongKgUocTinh = danhSachXe.reduce((sum, x) => sum + (x.soLuongUocTinh || 0), 0);
  const tongKgThucTe = daCanXe.reduce((sum, x) => sum + (x.tlHangKg || 0), 0);
  const tongChenhLechKg = tongKgThucTe - daCanXe.reduce((sum, x) => sum + (x.soLuongUocTinh || 0), 0);

  return {
    ngay,
    tongXe,
    daCan,
    choCan,
    saiStt,
    tongKgUocTinh,
    tongKgThucTe,
    tongChenhLechKg,
  };
}
