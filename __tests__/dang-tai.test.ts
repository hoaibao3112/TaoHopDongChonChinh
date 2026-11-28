import { describe, it, expect } from 'vitest';
import { normalizePlate, arePlatesMatching, formatPlateDisplay } from '../lib/dang-tai/plate';
import { processWeighingSlip, calculateDangTaiSummary } from '../lib/dang-tai/orderValidator';
import { XeDangTai, OcrPhieuCanResult } from '../lib/dang-tai/types';
import { checkPassword, verifySessionToken, signSessionToken } from '../lib/auth';
import fs from 'fs';
import path from 'path';
import { extractDangTaiSlipData } from '../lib/dang-tai/ocr';

describe('1. Chuẩn hóa biển số xe (Plate Normalization)', () => {
  it('chuẩn hóa biển số xe bỏ qua khoảng trắng, dấu gạch nối, dấu chấm và hoa/thường', () => {
    expect(normalizePlate('70H-03268')).toBe('70H03268');
    expect(normalizePlate('70h - 032.68')).toBe('70H03268');
    expect(normalizePlate(' 70H03268 ')).toBe('70H03268');
    expect(normalizePlate('66C-123.45')).toBe('66C12345');
  });

  it('so khớp hai biển số đúng dù khác định dạng nhập', () => {
    expect(arePlatesMatching('70H-03268', '70H03268')).toBe(true);
    expect(arePlatesMatching('70h-03268', '70H - 032.68')).toBe(true);
    expect(arePlatesMatching('66C-11111', '66C-22222')).toBe(false);
  });

  it('định dạng hiển thị biển số xe tiêu chuẩn', () => {
    expect(formatPlateDisplay('70H03268')).toBe('70H-03268');
  });
});

describe('2. Phân quyền và Mật khẩu thống nhất "chonchinh"', () => {
  it('nhập mật khẩu "chonchinh" trả về role "admin" và chuyển hướng đến /', () => {
    const auth = checkPassword('chonchinh');
    expect(auth.isAuthenticated).toBe(true);
    expect(auth.role).toBe('admin');
    expect(auth.redirectUrl).toBe('/');
  });

  it('tạo và xác thực HMAC token hợp lệ cho vai trò "admin"', () => {
    const token = signSessionToken('admin');
    const verifiedRole = verifySessionToken(token);
    expect(verifiedRole).toBe('admin');
  });
});

describe('3. Logic Kiểm Tra Thứ Tự STT & Tự Động Điền', () => {
  const initialTrucks: XeDangTai[] = [
    {
      id: 'xe_1',
      stt: 1,
      ngayDangTai: '2026-11-20',
      gioDangTai: '07:00',
      bienSoXe: '66C-11111',
      loaiLua: '5451',
      soLuongUocTinh: 30000,
      trangThai: 'cho_can',
      createdAt: '2026-11-20T07:00:00Z',
      updatedAt: '2026-11-20T07:00:00Z',
    },
    {
      id: 'xe_2',
      stt: 2,
      ngayDangTai: '2026-11-20',
      gioDangTai: '07:15',
      bienSoXe: '66C-22222',
      loaiLua: 'OM18',
      soLuongUocTinh: 31000,
      trangThai: 'cho_can',
      createdAt: '2026-11-20T07:15:00Z',
      updatedAt: '2026-11-20T07:15:00Z',
    },
    {
      id: 'xe_3',
      stt: 3,
      ngayDangTai: '2026-11-20',
      gioDangTai: '07:30',
      bienSoXe: '70H-03268',
      loaiLua: '5451',
      soLuongUocTinh: 32000,
      trangThai: 'cho_can',
      createdAt: '2026-11-20T07:30:00Z',
      updatedAt: '2026-11-20T07:30:00Z',
    },
  ];

  it('TH1: Cân đúng thứ tự STT (Xe 1 cân đầu tiên) -> Hợp lệ và tự động điền', () => {
    const slip1: OcrPhieuCanResult = {
      soPhieu: '1',
      soXe: '66C-11111',
      tlHangKg: 30500,
      tlXeKg: 14000,
      tlXeHangKg: 44500,
      ngayGioCan: '20/11/2026 08:00:00',
      loaiHang: 'LUA TUOI 5451',
    };

    const res = processWeighingSlip(slip1, initialTrucks);
    expect(res.matched).toBe(true);
    expect(res.isValidOrder).toBe(true);
    expect(res.warningMessage).toBeUndefined();

    // Kiểm tra tự động điền
    expect(res.updatedXe).toBeDefined();
    expect(res.updatedXe?.tlHangKg).toBe(30500);
    expect(res.updatedXe?.chenhLechKg).toBe(500); // 30500 - 30000 = +500
    expect(res.updatedXe?.trangThai).toBe('da_can');
    expect(res.updatedXe?.canHopLeSTT).toBe(true);
  });

  it('TH2: Cân sai thứ tự STT (Xe STT 3 cân khi Xe STT 1 và 2 chưa cân) -> Báo lỗi cân chưa hợp lệ NHƯNG VẪN TỰ ĐỘNG ĐIỀN vào xe STT 3', () => {
    const slip3: OcrPhieuCanResult = {
      soPhieu: '5',
      soXe: '70H-03268',
      tlHangKg: 32910,
      tlXeKg: 14800,
      tlXeHangKg: 47710,
      ngayGioCan: '19/11/2026 11:57:27',
      loaiHang: 'LUA TUOI 5451',
      khachHang: 'A LAM TAY NINH',
    };

    const res = processWeighingSlip(slip3, initialTrucks);

    // Phải phát hiện đúng xe
    expect(res.matched).toBe(true);
    // Báo chưa hợp lệ vì STT 1 và 2 chưa cân
    expect(res.isValidOrder).toBe(false);
    expect(res.warningMessage).toContain('⚠️ CẢNH BÁO CÂN CHƯA HỢP LỆ: Phiếu cân số 5');
    expect(res.warningMessage).toContain('STT 1 (66C-11111)');
    expect(res.warningMessage).toContain('STT 2 (66C-22222)');

    // BÁO XONG VẪN TỰ ĐỘNG ĐIỀN VÀO ĐÚNG BIỂN SỐ XE ĐÃ ĐĂNG TÀI
    expect(res.updatedXe).toBeDefined();
    expect(res.updatedXe?.bienSoXe).toBe('70H-03268');
    expect(res.updatedXe?.soPhieuCan).toBe('5');
    expect(res.updatedXe?.ngayCan).toBe('19/11/2026');
    expect(res.updatedXe?.gioCan).toBe('11:57:27');
    expect(res.updatedXe?.tlHangKg).toBe(32910);
    expect(res.updatedXe?.tlXeKg).toBe(14800);
    expect(res.updatedXe?.tlXeHangKg).toBe(47710);
    expect(res.updatedXe?.chenhLechKg).toBe(910); // 32910 - 32000 = +910
    expect(res.updatedXe?.trangThai).toBe('sai_stt');
    expect(res.updatedXe?.canHopLeSTT).toBe(false);
    expect(res.updatedXe?.canhBaoSTT).toBe(res.warningMessage);
  });

  it('TH3: Biển số chưa đăng tài trước -> Cảnh báo rõ ràng', () => {
    const slipUnknown: OcrPhieuCanResult = {
      soPhieu: '99',
      soXe: '51C-99999',
      tlHangKg: 35000,
    };

    const res = processWeighingSlip(slipUnknown, initialTrucks);
    expect(res.matched).toBe(false);
    expect(res.warningMessage).toContain('chưa được đăng tài trước');
  });

  it('tính toán số liệu tổng hợp báo cáo đăng tài chính xác', () => {
    const trucksWithWeighed: XeDangTai[] = [
      {
        id: '1',
        stt: 1,
        ngayDangTai: '2026-11-20',
        gioDangTai: '07:00',
        bienSoXe: '66C-11111',
        loaiLua: '5451',
        soLuongUocTinh: 30000,
        trangThai: 'da_can',
        tlHangKg: 30500,
        createdAt: '',
        updatedAt: '',
      },
      {
        id: '2',
        stt: 2,
        ngayDangTai: '2026-11-20',
        gioDangTai: '07:15',
        bienSoXe: '66C-22222',
        loaiLua: 'OM18',
        soLuongUocTinh: 31000,
        trangThai: 'cho_can',
        createdAt: '',
        updatedAt: '',
      },
      {
        id: '3',
        stt: 3,
        ngayDangTai: '2026-11-20',
        gioDangTai: '07:30',
        bienSoXe: '70H-03268',
        loaiLua: '5451',
        soLuongUocTinh: 32000,
        trangThai: 'sai_stt',
        tlHangKg: 32910,
        canHopLeSTT: false,
        createdAt: '',
        updatedAt: '',
      },
    ];

    const sum = calculateDangTaiSummary(trucksWithWeighed, '2026-11-20');
    expect(sum.tongXe).toBe(3);
    expect(sum.daCan).toBe(2);
    expect(sum.choCan).toBe(1);
    expect(sum.saiStt).toBe(1);
    expect(sum.tongKgUocTinh).toBe(93000);
    expect(sum.tongKgThucTe).toBe(30500 + 32910); // 63410
    expect(sum.tongChenhLechKg).toBe(63410 - (30000 + 32000)); // +1410

    // Khi người điều phối bấm chấp nhận trường hợp hợp lệ
    trucksWithWeighed[2].daChapNhanHopLe = true;
    trucksWithWeighed[2].trangThai = 'da_can';
    const sumAfterApproved = calculateDangTaiSummary(trucksWithWeighed, '2026-11-20');
    expect(sumAfterApproved.saiStt).toBe(0); // Không còn tính là sai STT nữa
    expect(sumAfterApproved.daCan).toBe(2); // Vẫn là đã cân hoàn tất
  });

  it('đảo vị trí hàng của xe (ví dụ xe STT 4 ở hàng 4 đẩy lên hàng 2) nhưng STT 4 vẫn giữ nguyên', () => {
    const list: XeDangTai[] = [
      { id: '1', stt: 1, bienSoXe: '66C-11111', ngayDangTai: '2026-11-20', gioDangTai: '07:00', loaiLua: '5451', soLuongUocTinh: 30000, trangThai: 'cho_can', createdAt: '', updatedAt: '' },
      { id: '2', stt: 2, bienSoXe: '66C-22222', ngayDangTai: '2026-11-20', gioDangTai: '07:15', loaiLua: 'OM18', soLuongUocTinh: 31000, trangThai: 'cho_can', createdAt: '', updatedAt: '' },
      { id: '3', stt: 3, bienSoXe: '66C-33333', ngayDangTai: '2026-11-20', gioDangTai: '07:30', loaiLua: '5451', soLuongUocTinh: 32000, trangThai: 'cho_can', createdAt: '', updatedAt: '' },
      { id: '4', stt: 4, bienSoXe: '70H-03268', ngayDangTai: '2026-11-20', gioDangTai: '07:45', loaiLua: '5451', soLuongUocTinh: 33000, trangThai: 'cho_can', createdAt: '', updatedAt: '' },
    ];

    // Di chuyển xe id '4' (STT 4) từ index 3 lên index 1 (hàng 2)
    const currentIndex = list.findIndex((x) => x.id === '4');
    expect(currentIndex).toBe(3);

    const targetIndex = 1; // Hàng 2
    const reorderedList = [...list];
    const [movedTruck] = reorderedList.splice(currentIndex, 1);
    reorderedList.splice(targetIndex, 0, movedTruck);

    // Kiểm tra danh sách sau khi đảo
    expect(reorderedList.length).toBe(4);
    expect(reorderedList[0].stt).toBe(1);
    expect(reorderedList[1].stt).toBe(4); // Xe STT 4 nay nằm ở vị trí hàng số 2
    expect(reorderedList[1].bienSoXe).toBe('70H-03268');
    expect(reorderedList[2].stt).toBe(2);
    expect(reorderedList[3].stt).toBe(3);

    // Đảm bảo STT gốc của xe 4 không hề bị đổi thành 2
    expect(reorderedList[1].stt).toBe(4);
  });

  it('5. Tự động lấy Ngày Cân và Giờ Cân từ hàng bên dưới trên phiếu cân cập nhật vào hệ thống', () => {
    const slip: OcrPhieuCanResult = {
      soPhieu: '8',
      soXe: '70H-03268',
      ngayCan: '20/11/2026',
      gioCan: '11:41:23',
      ngayGioCan: '20/11/2026 11:41:23',
      tlHangKg: 32000,
    };

    const res = processWeighingSlip(slip, initialTrucks);
    expect(res.matched).toBe(true);
    expect(res.updatedXe?.ngayCan).toBe('20/11/2026');
    expect(res.updatedXe?.gioCan).toBe('11:41:23');
  });

  it('6. Khi người dùng đã chấp nhận phiếu cân: Ghi chú chỉ ghi nội dung bình thường, không ghi cảnh báo; khi KHÔNG chấp nhận thì mới hiện cảnh báo', () => {
    const truckWithWarning: XeDangTai = {
      id: 'xe_warning',
      stt: 6,
      ngayDangTai: '2026-11-20',
      gioDangTai: '08:00',
      bienSoXe: '50E-33425',
      loaiLua: '5451',
      soLuongUocTinh: 40000,
      trangThai: 'sai_stt',
      canHopLeSTT: false,
      canhBaoSTT: '⚠️ CẢNH BÁO CÂN CHƯA HỢP LỆ: Phiếu cân số 11 (Xe 50E-33425 - STT 6) được cân trước xe STT 5!',
      ghiChu: '6, 1, Nhà máy - ĐTM',
      daChapNhanHopLe: false,
      createdAt: '',
      updatedAt: '',
    };

    // Khi CHƯA/KHÔNG chấp nhận:
    const isApprovedBefore = !!truckWithWarning.daChapNhanHopLe;
    const isSaiSttBefore = (truckWithWarning.trangThai === 'sai_stt' || truckWithWarning.canHopLeSTT === false) && !isApprovedBefore;
    const noteBefore = isApprovedBefore
      ? (truckWithWarning.ghiChu || '')
      : isSaiSttBefore
      ? [truckWithWarning.canhBaoSTT, truckWithWarning.ghiChu].filter(Boolean).join(' | ')
      : (truckWithWarning.ghiChu || '');

    expect(isSaiSttBefore).toBe(true);
    expect(noteBefore).toContain('⚠️ CẢNH BÁO CÂN CHƯA HỢP LỆ');
    expect(noteBefore).toContain('6, 1, Nhà máy - ĐTM');

    // Khi người dùng ĐÃ CHẤP NHẬN:
    const approvedTruck: XeDangTai = {
      ...truckWithWarning,
      daChapNhanHopLe: true,
      trangThai: 'da_can',
      canHopLeSTT: true,
    };

    const isApprovedAfter = !!approvedTruck.daChapNhanHopLe;
    const isSaiSttAfter =
      ((approvedTruck.trangThai as string) === 'sai_stt' ||
        (approvedTruck.canHopLeSTT as boolean) === false) &&
      !isApprovedAfter;
    const isDaCanAfter = approvedTruck.trangThai === 'da_can' || isApprovedAfter;
    const statusTextAfter = isSaiSttAfter
      ? 'Cân sai STT ⚠️'
      : isDaCanAfter
      ? 'Đã cân ✓'
      : 'Chờ cân ⏳';
    const noteAfter = isApprovedAfter
      ? (approvedTruck.ghiChu || '')
      : isSaiSttAfter
      ? [approvedTruck.canhBaoSTT, approvedTruck.ghiChu].filter(Boolean).join(' | ')
      : (approvedTruck.ghiChu || '');

    expect(isSaiSttAfter).toBe(false);
    expect(statusTextAfter).toBe('Đã cân ✓');
    expect(noteAfter).toBe('6, 1, Nhà máy - ĐTM');
    expect(noteAfter).not.toContain('CẢNH BÁO');
    expect(noteAfter).not.toContain('ngoại lệ STT');
  });
});
