import XLSX from 'xlsx-js-style';
import fs from 'fs';
import path from 'path';
import { NSXTMEntry, NSXTMVehicleType } from './nsx-tm-types';
import { roundRiceTons } from './rounding';

/**
 * Kiểm tra phương tiện là Xe hay Ghe
 */
export function detectVehicleType(vehicleName: string): NSXTMVehicleType {
  const v = (vehicleName || '').trim().toUpperCase();
  if (!v) return 'GHE';

  // Nếu có chữ XE, XE TẢI, TẢI, ĐẦU KÉO
  if (v.includes('XE') || v.includes('TẢI') || v.includes('ĐẦU KÉO') || v.includes('CONTAINER')) {
    return 'XE';
  }

  // Nếu có chữ GHE, TÀU, SALAN, SÀ LAN, VỎ, XUỒNG, NN (Nguyên Nguyên)
  if (v.includes('GHE') || v.includes('TÀU') || v.includes('SALAN') || v.includes('SÀ LAN') || v.startsWith('NN')) {
    return 'GHE';
  }

  // Kiểm tra biển số xe Việt Nam: VD 62H 00596, 66A 47312, 36H-13062, 54Y 7029, 63C 13680, 47H 03528...
  const licensePlateRegex = /\b\d{2}[A-Z]\s*[-]?\s*\d{3,5}\b/i;
  if (licensePlateRegex.test(v)) {
    return 'XE';
  }

  // Mặc định sông nước miền Tây là Ghe nếu không phải biển số xe
  return 'GHE';
}

/**
 * Chuyển số serial Excel hoặc chuỗi ngày thành DD/MM/YYYY
 */
export function formatToDateStr(val: unknown): string {
  if (val === undefined || val === null || val === '') return '';

  if (typeof val === 'number') {
    // Excel serial date (Windows 1900 system)
    const utcDays = Math.floor(val - 25569);
    const dateObj = new Date(utcDays * 86400 * 1000);
    const d = String(dateObj.getUTCDate()).padStart(2, '0');
    const m = String(dateObj.getUTCMonth() + 1).padStart(2, '0');
    const y = dateObj.getUTCFullYear();
    return `${d}/${m}/${y}`;
  }

  const str = String(val).trim();
  // Nếu là chuỗi số nguyên serial date
  if (/^\d{5}$/.test(str)) {
    const num = parseInt(str, 10);
    const utcDays = Math.floor(num - 25569);
    const dateObj = new Date(utcDays * 86400 * 1000);
    const d = String(dateObj.getUTCDate()).padStart(2, '0');
    const m = String(dateObj.getUTCMonth() + 1).padStart(2, '0');
    const y = dateObj.getUTCFullYear();
    return `${d}/${m}/${y}`;
  }

  // Nếu dạng DD/MM/YYYY hoặc YYYY-MM-DD
  if (str.includes('/')) {
    const parts = str.split('/');
    if (parts.length === 3) {
      if (parts[0].length === 4) {
        return `${parts[2].padStart(2, '0')}/${parts[1].padStart(2, '0')}/${parts[0]}`;
      }
      return `${parts[0].padStart(2, '0')}/${parts[1].padStart(2, '0')}/${parts[2]}`;
    }
  }

  if (str.includes('-')) {
    const parts = str.split('-');
    if (parts.length === 3) {
      if (parts[0].length === 4) {
        return `${parts[2].padStart(2, '0')}/${parts[1].padStart(2, '0')}/${parts[0]}`;
      }
      return `${parts[0].padStart(2, '0')}/${parts[1].padStart(2, '0')}/${parts[2]}`;
    }
  }

  return str;
}

/**
 * Parse File Lúa Tươi (THỊNH_TỔNG SỐ LIỆU NHẬP LÚA TƯƠI 2026.xlsx)
 * Lọc mẻ sấy tại NSX TM / NSX ĐTM / CCĐTM / TÂN MỸ
 */
export function parseLuaTuoiWorkbook(wb: XLSX.WorkBook): NSXTMEntry[] {
  const sheetName = wb.SheetNames.find((n) => n.toUpperCase().includes('LUA TUOI') || n.toUpperCase().includes('LÚA TƯƠI')) || wb.SheetNames[0];
  const ws = wb.Sheets[sheetName];
  if (!ws) return [];

  const rawData: any[][] = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' });
  const entries: NSXTMEntry[] = [];

  // Data bắt đầu từ dòng 4 (index 3)
  for (let r = 3; r < rawData.length; r++) {
    const row = rawData[r];
    if (!row || row.length === 0) continue;

    const fac = String(row[25] || '').trim().toUpperCase(); // Cột Z: ĐỊA ĐIỂM SẤY
    // Điều kiện lọc NSX TM
    const isNSXTM = fac.includes('NSX TM') || fac.includes('NSX ĐTM') || fac.includes('CCĐTM') || fac.includes('TÂN MỸ') || fac.includes('TM');
    if (!isNSXTM) continue;

    // Cột Y: NGÀY NHẬP SẤY, fallback Cột B: NGÀY CÂN
    const dateRaw = row[24] || row[1];
    const dateStr = formatToDateStr(dateRaw);
    if (!dateStr) continue;

    // Cột AB: CÂN NHẬP SẤY (KG), fallback Cột H: SỐ LƯỢNG
    const kg = parseFloat(String(row[27] || row[7]).replace(/,/g, '')) || 0;
    if (kg <= 0) continue;

    const tons = roundRiceTons(kg);
    const vehicle = String(row[4] || row[18] || '').trim(); // Cột E (hoặc S tăng bo)
    const riceType = String(row[5] || '').trim();          // Cột F
    const customer = String(row[3] || '').trim();          // Cột D: KHÁCH HÀNG
    const vType = detectVehicleType(vehicle);

    // Xây dựng câu mô tả công việc chuẩn
    let desc = '';
    if (vType === 'XE') {
      const vClean = vehicle.toUpperCase().startsWith('XE') ? vehicle : `1 xe ${vehicle}`;
      desc = `Nhập ${vClean} ${riceType} của ${customer}`;
    } else {
      const vClean = vehicle.toUpperCase().includes('GHE') || vehicle.toUpperCase().includes('TÀU') || vehicle.toUpperCase().includes('SALAN')
        ? vehicle
        : `ghe ${vehicle}`;
      desc = `Nhập ${vClean} ${riceType} tươi của ${customer}`;
    }

    const unitPriceXe = vType === 'XE' ? 25000 : 0;
    const unitPriceGhe = vType === 'GHE' ? 15000 : 0;
    const unitPrice = vType === 'XE' ? 25000 : 15000;
    const thanhTien = tons * unitPrice;

    entries.push({
      id: `tuoi-${r}-${Date.now()}`,
      source: 'LUA_TUOI',
      date: dateStr,
      team: 'ĐỨC', // Mặc định gán ĐỨC, người dùng sẽ gán tự động xen kẽ
      customerName: customer,
      riceType,
      vehicleName: vehicle,
      vehicleType: vType,
      jobDescription: desc,
      weightKg: kg,
      roundedTons: tons,
      unitPriceSayXe: unitPriceXe,
      unitPriceSayGhe: unitPriceGhe,
      thanhTienSay: thanhTien,
      unitPriceLuaKho: 0,
      thanhTienLuaKho: 0,
      tongThanhTien: thanhTien,
      note: fac,
    });
  }

  return entries;
}

/**
 * Parse File Lúa Khô (THỊNH_TỔNG NHẬP LÚA KHÔ NĂM 2026.xlsx)
 * Lọc mẻ nhập tại NSX TM (Cột AD có ngày hoặc Cột AE Cân Cty/NSX > 0)
 */
export function parseLuaKhoWorkbook(wb: XLSX.WorkBook): NSXTMEntry[] {
  const sheetName = wb.SheetNames.find((n) => n.toUpperCase().includes('LUA KHO') || n.toUpperCase().includes('LÚA KHÔ')) || wb.SheetNames[0];
  const ws = wb.Sheets[sheetName];
  if (!ws) return [];

  const rawData: any[][] = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' });
  const entries: NSXTMEntry[] = [];

  // Data bắt đầu từ dòng 7 (index 6)
  for (let r = 6; r < rawData.length; r++) {
    const row = rawData[r];
    if (!row || row.length === 0) continue;

    // Cột AD: NHẬP NSX TM (ngày nhập NSX TM), Cột AE: CÂN CTY/ NSX
    const dateAD = row[29]; // Cột AD
    const kgAE = parseFloat(String(row[30] || '').replace(/,/g, '')) || 0; // Cột AE

    // Bỏ qua dòng tổng cộng
    const custRaw = String(row[3] || '').trim();
    if (custRaw.toUpperCase().includes('TỔNG CỘNG')) continue;

    // Điều kiện: Có ngày ở AD hoặc có cân ở AE (>0 và khác số tổng cộng)
    if (!dateAD && kgAE <= 0) continue;
    if (kgAE >= 30_000_000) continue; // Bỏ qua nếu là số tổng

    const dateRaw = dateAD || row[1]; // Fallback Cột B: NGÀY CÂN
    const dateStr = formatToDateStr(dateRaw);
    if (!dateStr) continue;

    const kg = kgAE > 0 ? kgAE : (parseFloat(String(row[7] || '').replace(/,/g, '')) || 0);
    if (kg <= 0) continue;

    const tons = roundRiceTons(kg);
    const vehicle = String(row[4] || '').trim(); // Cột E
    const riceType = String(row[5] || '').trim(); // Cột F
    const customer = custRaw;                     // Cột D: NHÀ CUNG CẤP
    const vType = detectVehicleType(vehicle);

    // Mô tả công việc: Nhập ghe NN02 Lúa khô JAPO của Đạt + Diễm
    const vUpper = vehicle.toUpperCase();
    let vPrefix = '';
    if (vUpper.includes('GHE') || vUpper.includes('TÀU') || vUpper.includes('SALAN') || vUpper.includes('SÀ LAN')) {
      vPrefix = vehicle;
    } else if (vType === 'XE') {
      vPrefix = vehicle.toUpperCase().startsWith('XE') ? vehicle : `xe ${vehicle}`;
    } else {
      vPrefix = `ghe ${vehicle}`;
    }

    const desc = `Nhập ${vPrefix} Lúa khô ${riceType} của ${customer}`;
    const unitPrice = 20000; // Đơn giá nhập lúa khô chuẩn: 20.000đ/tấn
    const thanhTien = tons * unitPrice;

    entries.push({
      id: `kho-${r}-${Date.now()}`,
      source: 'LUA_KHO',
      date: dateStr,
      team: 'QUÝ', // Mặc định gán QUÝ
      customerName: customer,
      riceType,
      vehicleName: vehicle,
      vehicleType: vType,
      jobDescription: desc,
      weightKg: kg,
      roundedTons: tons,
      unitPriceSayXe: 0,
      unitPriceSayGhe: 0,
      thanhTienSay: 0,
      unitPriceLuaKho: unitPrice,
      thanhTienLuaKho: thanhTien,
      tongThanhTien: thanhTien,
      note: 'Nhập lúa khô NSX TM',
    });
  }

  return entries;
}

/**
 * Gán đội tự động xen kẽ 2 ngày (2 ngày ĐỨC, 2 ngày QUÝ)
 */
export function autoAssignAlternating2Days(entries: NSXTMEntry[]): NSXTMEntry[] {
  // Lấy danh sách các ngày duy nhất và sắp xếp tăng dần
  const uniqueDates = Array.from(new Set(entries.map((e) => e.date))).filter(Boolean);
  uniqueDates.sort((a, b) => {
    const [d1, m1, y1] = a.split('/').map(Number);
    const [d2, m2, y2] = b.split('/').map(Number);
    return new Date(y1, m1 - 1, d1).getTime() - new Date(y2, m2 - 1, d2).getTime();
  });

  // Bản đồ ngày -> Đội (cứ 2 ngày liên tiếp đổi đội 1 lần)
  const dateTeamMap = new Map<string, 'ĐỨC' | 'QUÝ'>();
  uniqueDates.forEach((dt, idx) => {
    // Chu kỳ 4: ngày 0, 1 -> ĐỨC; ngày 2, 3 -> QUÝ
    const cycle = Math.floor(idx / 2) % 2;
    dateTeamMap.set(dt, cycle === 0 ? 'ĐỨC' : 'QUÝ');
  });

  return entries.map((e) => ({
    ...e,
    team: dateTeamMap.get(e.date) || e.team,
  }));
}

/**
 * Gán đội tự động xen kẽ 1 ngày (chẵn/lẻ)
 */
export function autoAssignAlternating1Day(entries: NSXTMEntry[]): NSXTMEntry[] {
  return entries.map((e) => {
    const day = parseInt((e.date || '').split('/')[0], 10) || 1;
    return {
      ...e,
      team: day % 2 !== 0 ? 'ĐỨC' : 'QUÝ', // Ngày lẻ: ĐỨC, Ngày chẵn: QUÝ
    };
  });
}

/**
 * Đọc dữ liệu mẫu từ các file có sẵn trên máy
 */
export function loadLocalSampleData(): NSXTMEntry[] {
  const filePathTuoi = path.join(process.cwd(), 'THỊNH_TỔNG SỐ LIỆU NHẬP LÚA TƯƠI 2026.xlsx');
  const filePathKho = path.join(process.cwd(), 'THỊNH_TỔNG NHẬP LÚA KHÔ NĂM 2026.xlsx');

  let entries: NSXTMEntry[] = [];

  if (fs.existsSync(filePathTuoi)) {
    try {
      const buf = fs.readFileSync(filePathTuoi);
      const wb = XLSX.read(buf, { type: 'buffer' });
      const tuoi = parseLuaTuoiWorkbook(wb);
      entries.push(...tuoi);
    } catch (e) {
      console.warn('Lỗi đọc file lúa tươi mẫu:', e);
    }
  }

  if (fs.existsSync(filePathKho)) {
    try {
      const buf = fs.readFileSync(filePathKho);
      const wb = XLSX.read(buf, { type: 'buffer' });
      const kho = parseLuaKhoWorkbook(wb);
      entries.push(...kho);
    } catch (e) {
      console.warn('Lỗi đọc file lúa khô mẫu:', e);
    }
  }

  // Tự động gán xen kẽ 2 ngày
  return autoAssignAlternating2Days(entries);
}

