import * as XLSX from 'xlsx';
import { XuatNSXTMEntry, XuatNSXTMSummary } from './xuat-nsx-tm-types';
import { roundRiceTons } from './rounding';
import { formatExcelDate } from './excel-parser';

export function isJaponica(riceType: string): boolean {
  const norm = (riceType || '').toUpperCase().trim();
  return norm.includes('JAPONICA') || norm.includes('DS1') || norm.includes('DS-1');
}

export function isNep(riceType: string): boolean {
  const norm = (riceType || '').toUpperCase().trim();
  return norm.includes('NẾP') || norm.includes('NEP');
}

export function isNSXTM(facility: string): boolean {
  const norm = (facility || '').toUpperCase().trim();
  return (
    norm.includes('NSX TM') ||
    norm.includes('NSX ĐTM') ||
    norm.includes('CCĐTM') ||
    norm.includes('TÂN MỸ') ||
    norm.includes('TM')
  );
}

/**
 * Tính toán đơn giá và thành tiền tự động cho 1 mẻ xuất NSX TM
 */
export function calculateXuatNSXTMRow(
  raw: Partial<XuatNSXTMEntry>,
  customPrices?: {
    giaCoTro?: number;
    giaKhongTro?: number;
    giaChumLua?: number;
    giaChumNep?: number;
    giaVoBon?: number;
  }
): XuatNSXTMEntry {
  const loaiLua = raw.loaiLua || '';
  const canNhapSayKg = raw.canNhapSayKg || 0;
  const soLuongTan = raw.soLuongTan !== undefined ? raw.soLuongTan : roundRiceTons(canNhapSayKg);

  const giaCoTroDefault = customPrices?.giaCoTro ?? 17000;
  const giaKhongTroDefault = customPrices?.giaKhongTro ?? 11000;
  const giaChumLuaDefault = customPrices?.giaChumLua ?? 8000;
  const giaChumNepDefault = customPrices?.giaChumNep ?? 11000;
  const giaVoBonDefault = customPrices?.giaVoBon ?? 3000;

  const japonica = isJaponica(loaiLua);
  const nep = isNep(loaiLua);

  let donGiaCoTro = 0;
  let donGiaKhongTro = 0;
  let donGiaChumLua = 0;
  let donGiaChumNep = 0;

  if (japonica) {
    donGiaCoTro = raw.donGiaCoTro !== undefined ? raw.donGiaCoTro : giaCoTroDefault;
    donGiaChumLua = raw.donGiaChumLua !== undefined ? raw.donGiaChumLua : giaChumLuaDefault;
  } else if (nep) {
    donGiaKhongTro = raw.donGiaKhongTro !== undefined ? raw.donGiaKhongTro : giaKhongTroDefault;
    donGiaChumNep = raw.donGiaChumNep !== undefined ? raw.donGiaChumNep : giaChumNepDefault;
  } else {
    // Lúa khác (ST25, OM18...)
    donGiaKhongTro = raw.donGiaKhongTro !== undefined ? raw.donGiaKhongTro : giaKhongTroDefault;
    donGiaChumLua = raw.donGiaChumLua !== undefined ? raw.donGiaChumLua : giaChumLuaDefault;
  }

  const donGiaVoBon = raw.donGiaVoBon !== undefined ? raw.donGiaVoBon : giaVoBonDefault;

  const thanhTienCoTro = soLuongTan * donGiaCoTro;
  const thanhTienKhongTro = soLuongTan * donGiaKhongTro;
  const thanhTienChum = soLuongTan * (donGiaChumLua || donGiaChumNep);
  const thanhTienVoBon = soLuongTan * donGiaVoBon;
  const tongThanhTien = thanhTienCoTro + thanhTienKhongTro + thanhTienChum + thanhTienVoBon;

  return {
    id: raw.id || `xuat-tm-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    soHD: raw.soHD || '',
    ngayCan: raw.ngayCan || '',
    nhanVienThuMua: raw.nhanVienThuMua || '',
    khachHang: raw.khachHang || '',
    loaiLua,
    maLo: raw.maLo || '',
    soLuongKg: raw.soLuongKg || 0,
    phuongTienTangBo: raw.phuongTienTangBo || '',
    ngayNhapSay: raw.ngayNhapSay || '',
    diaDiemSay: raw.diaDiemSay || 'NSX TM',
    ghiChuCanNhap: raw.ghiChuCanNhap || '',
    canNhapSayKg,
    ngayXuongLuaKho: raw.ngayXuongLuaKho || '',
    soLieuLuaKhoKg: raw.soLieuLuaKhoKg || 0,
    phuongTienChoLuaKho: raw.phuongTienChoLuaKho || 'VÔ BỒN',
    soLuongTan,
    donGiaCoTro,
    thanhTienCoTro,
    donGiaKhongTro,
    thanhTienKhongTro,
    donGiaChumLua,
    donGiaChumNep,
    thanhTienChum,
    donGiaVoBon,
    thanhTienVoBon,
    ghiChu: raw.ghiChu || '',
    tongThanhTien,
  };
}

/**
 * Tính bảng tổng hợp lương chi tiết khớp Sheet 2 chuẩn mẫu
 */
export function calculateXuatNSXTMTotal(
  entries: XuatNSXTMEntry[],
  monthKey: string,
  tamUng = 0
): XuatNSXTMSummary {
  let totalKg = 0;
  let totalTons = 0;
  let tonsCoTro = 0;
  let thanhTienCoTro = 0;
  let tonsKhongTro = 0;
  let thanhTienKhongTro = 0;
  let tonsChumLua = 0;
  let thanhTienChumLua = 0;
  let tonsChumNep = 0;
  let thanhTienChumNep = 0;
  let tonsVoBon = 0;
  let thanhTienVoBon = 0;

  for (const item of entries) {
    totalKg += item.canNhapSayKg || 0;
    const t = item.soLuongTan || 0;
    totalTons += t;

    if (item.donGiaCoTro > 0) {
      tonsCoTro += t;
      thanhTienCoTro += item.thanhTienCoTro;
    }
    if (item.donGiaKhongTro > 0) {
      tonsKhongTro += t;
      thanhTienKhongTro += item.thanhTienKhongTro;
    }
    if (item.donGiaChumLua > 0) {
      tonsChumLua += t;
      thanhTienChumLua += t * item.donGiaChumLua;
    }
    if (item.donGiaChumNep > 0) {
      tonsChumNep += t;
      thanhTienChumNep += t * item.donGiaChumNep;
    }
    if (item.donGiaVoBon > 0) {
      tonsVoBon += t;
      thanhTienVoBon += item.thanhTienVoBon;
    }
  }

  const tongCong = thanhTienCoTro + thanhTienKhongTro + thanhTienChumLua + thanhTienChumNep + thanhTienVoBon;
  const conLai = Math.max(0, tongCong - tamUng);

  return {
    monthKey,
    totalRows: entries.length,
    totalKg,
    totalTons,
    tonsCoTro,
    priceCoTro: 17000,
    thanhTienCoTro,
    tonsKhongTro,
    priceKhongTro: 11000,
    thanhTienKhongTro,
    tonsChumLua,
    priceChumLua: 8000,
    thanhTienChumLua,
    tonsChumNep,
    priceChumNep: 11000,
    thanhTienChumNep,
    tonsVoBon,
    priceVoBon: 3000,
    thanhTienVoBon,
    tongCong,
    tamUng,
    conLai,
  };
}

/**
 * Trích xuất danh sách các mẻ Xuất Lúa NSX TM từ file Excel bất kỳ
 * Hỗ trợ cả file mẫu "LƯƠNG_ĐỘI_NAM-XUẤT_NSX_ĐTM" và file Master "THỊNH_TỔNG SỐ LIỆU NHẬP LÚA TƯƠI"
 */
export function parseXuatNSXTMWorkbook(wb: XLSX.WorkBook): XuatNSXTMEntry[] {
  // 1. Kiểm tra nếu là file xuất Đội Nam chuẩn (có sheet BK XUẤT ĐỌI NAM hoặc BK XUẤT)
  const bkSheetName = wb.SheetNames.find(
    (n) => n.toUpperCase().includes('BK XUẤT') || n.toUpperCase().includes('XUẤT ĐỌI NAM') || n.toUpperCase().includes('XUẤT ĐỘI NAM')
  );

  if (bkSheetName) {
    const ws = wb.Sheets[bkSheetName];
    const data: any[][] = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' });
    const entries: XuatNSXTMEntry[] = [];

    // Hàng tiêu đề thường ở dòng 3 (index 2) hoặc dòng 4 (index 3)
    let headerIdx = -1;
    for (let r = 0; r < Math.min(10, data.length); r++) {
      const rowStr = (data[r] || []).join(' ').toUpperCase();
      if (rowStr.includes('KHÁCH HÀNG') && (rowStr.includes('LOẠI LÚA') || rowStr.includes('CÂN NHẬP SẤY'))) {
        headerIdx = r;
        break;
      }
    }
    const startRow = headerIdx >= 0 ? headerIdx + 1 : 3;

    for (let r = startRow; r < data.length; r++) {
      const row = data[r];
      if (!row || row.length === 0) continue;
      // Dừng lại nếu gặp hàng chữ ký hoặc hết dòng dữ liệu khách hàng
      const customer = String(row[3] || '').trim();
      if (!customer || customer.toUpperCase().includes('NGƯỜI LẬP') || customer.toUpperCase().includes('TỔNG CỘNG')) {
        continue;
      }

      const canNhapSayKg = Number(row[11]) || 0;
      if (canNhapSayKg <= 0 && !row[4]) continue;

      entries.push(
        calculateXuatNSXTMRow({
          id: `xuat-tm-${r}-${Date.now()}-${Math.random().toString(36).slice(2, 5)}`,
          soHD: String(row[0] || ''),
          ngayCan: formatExcelDate(row[1]),
          nhanVienThuMua: String(row[2] || ''),
          khachHang: customer,
          loaiLua: String(row[4] || ''),
          maLo: String(row[5] || ''),
          soLuongKg: Number(row[6]) || 0,
          phuongTienTangBo: String(row[7] || ''),
          ngayNhapSay: formatExcelDate(row[8]),
          diaDiemSay: String(row[9] || 'NSX TM'),
          ghiChuCanNhap: String(row[10] || ''),
          canNhapSayKg,
          ngayXuongLuaKho: formatExcelDate(row[12]),
          soLieuLuaKhoKg: Number(row[13]) || 0,
          phuongTienChoLuaKho: String(row[14] || 'VÔ BỒN'),
          soLuongTan: Number(row[15]) || roundRiceTons(canNhapSayKg),
          donGiaCoTro: Number(row[16]) || 0,
          donGiaKhongTro: Number(row[18]) || 0,
          donGiaChumLua: Number(row[20]) || 0,
          donGiaChumNep: Number(row[21]) || 0,
          donGiaVoBon: Number(row[23]) || 0,
          ghiChu: String(row[25] || ''),
        })
      );
    }

    if (entries.length > 0) return entries;
  }

  // 2. Nếu là file Master (THỊNH_TỔNG SỐ LIỆU NHẬP LÚA TƯƠI)
  const masterSheetName =
    wb.SheetNames.find((n) => n.toUpperCase().includes('LUA TUOI') || n.toUpperCase().includes('LÚA TƯƠI') || n.toUpperCase().includes('TỔNG SỐ LIỆU')) ||
    wb.SheetNames[0];

  const wsMaster = wb.Sheets[masterSheetName];
  if (!wsMaster) return [];

  const rawData: any[][] = XLSX.utils.sheet_to_json(wsMaster, { header: 1, defval: '' });
  const entries: XuatNSXTMEntry[] = [];

  for (let r = 3; r < rawData.length; r++) {
    const row = rawData[r];
    if (!row || row.length === 0) continue;

    const fac = String(row[25] || '').trim();
    if (!isNSXTM(fac)) continue;

    // Ngày xuống lúa khô (Cột AE - index 30), fallback Ngày nhập sấy (Cột Y - index 24) hoặc Ngày cân (Cột B - index 1)
    const ngayXuong = formatExcelDate(row[30] || row[24] || row[1]);
    if (!ngayXuong) continue;

    const customer = String(row[3] || '').trim();
    if (!customer) continue;

    const riceType = String(row[5] || '').trim();
    const canNhapSayKg = Number(row[27]) || Number(row[7]) || 0;
    if (canNhapSayKg <= 0) continue;

    const vehicleTangBo = String(row[18] || row[4] || '').trim();

    entries.push(
      calculateXuatNSXTMRow({
        id: `xuat-master-${r}-${Date.now()}-${Math.random().toString(36).slice(2, 5)}`,
        soHD: String(row[0] || ''),
        ngayCan: formatExcelDate(row[1]),
        nhanVienThuMua: String(row[2] || ''),
        khachHang: customer,
        loaiLua: riceType,
        maLo: String(row[6] || ''),
        soLuongKg: Number(row[7]) || 0,
        phuongTienTangBo: vehicleTangBo,
        ngayNhapSay: formatExcelDate(row[24]),
        diaDiemSay: fac || 'NSX TM',
        ghiChuCanNhap: String(row[26] || ''),
        canNhapSayKg,
        ngayXuongLuaKho: ngayXuong,
        soLieuLuaKhoKg: Number(row[31]) || 0,
        phuongTienChoLuaKho: String(row[32] || 'VÔ BỒN'),
        soLuongTan: roundRiceTons(canNhapSayKg),
        ghiChu: String(row[33] || ''),
      })
    );
  }

  return entries;
}
