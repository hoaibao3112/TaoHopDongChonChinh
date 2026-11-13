import XLSX from 'xlsx-js-style';
import { NSXTMEntry } from './nsx-tm-types';
import { roundRiceTons } from './rounding';
import {
  detectVehicleType,
  formatToDateStr,
  autoAssignAlternating2Days,
  autoAssignAlternating1Day,
  parseVnDate,
} from './nsx-tm-utils';

export {
  detectVehicleType,
  formatToDateStr,
  autoAssignAlternating2Days,
  autoAssignAlternating1Day,
  parseVnDate,
};

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

    const customer = String(row[5] || '').trim(); // Cột F: KHÁCH HÀNG
    const riceType = String(row[7] || '').trim(); // Cột H: LOẠI LÚA
    const vehicle = String(row[8] || '').trim();  // Cột I: PHƯƠNG TIỆN

    // Cột AB: CÂN NHẬP SẤY (KG), fallback Cột K / Cột M
    const kgRaw = row[27] || row[10] || row[12] || 0;
    const kg = typeof kgRaw === 'number' ? kgRaw : parseFloat(String(kgRaw).replace(/[^\d.-]/g, '')) || 0;
    if (kg <= 0) continue;

    const vType = detectVehicleType(vehicle);

    // Đơn giá: Xe = 25.000 đ/tấn, Ghe = 15.000 đ/tấn
    const pricePerTon = vType === 'XE' ? 25000 : 15000;

    // Tấn quy đổi làm tròn theo nguyên tắc công ty: >= 500kg làm tròn lên 1 tấn, < 500kg làm tròn xuống
    const tons = roundRiceTons(kg);
    const amount = tons * pricePerTon;

    // Câu mô tả công việc tự động:
    // "Đối với lúa thì hệ thống nhập như sau: Nhập một + tên phương tiện + loại lúa của + khách hang"
    // Nếu là xe -> "Nhập 1 xe {phương tiện} {loại lúa} của {khách hàng}"
    // Nếu là ghe -> "Nhập ghe {phương tiện} {loại lúa} của {khách hàng}"
    let workDesc = '';
    if (vType === 'XE') {
      workDesc = `Nhập 1 xe ${vehicle} ${riceType} của ${customer}`.trim();
    } else {
      workDesc = `Nhập ghe ${vehicle} ${riceType} của ${customer}`.trim();
    }

    entries.push({
      id: `tuoi-${r}-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
      source: 'LUA_TUOI',
      date: dateStr,
      team: 'ĐỨC', // Mặc định, sau đó hàm autoAssign sẽ chia xen kẽ
      customerName: customer,
      riceType,
      vehicleName: vehicle,
      vehicleType: vType,
      jobDescription: workDesc,
      weightKg: kg,
      roundedTons: tons,
      unitPriceSayXe: vType === 'XE' ? 25000 : 0,
      unitPriceSayGhe: vType === 'GHE' ? 15000 : 0,
      thanhTienSay: amount,
      thanhTienLuaKho: 0,
      tongThanhTien: amount,
      facility: fac || 'NSX TM',
    });
  }

  return entries;
}

/**
 * Parse File Lúa Khô (THỊNH_TỔNG NHẬP LÚA KHÔ NĂM 2026.xlsx)
 * CỘT AD: NGÀY NHẬP NSX TM
 * CỘT AE: CÂN CTY/ NSX (KG)
 */
export function parseLuaKhoWorkbook(wb: XLSX.WorkBook): NSXTMEntry[] {
  // Tìm sheet 'TỔNG HỢP' hoặc sheet đầu tiên
  const sheetName = wb.SheetNames.find((n) => n.toUpperCase().includes('TỔNG HỢP') || n.toUpperCase().includes('TONG HOP') || n.toUpperCase().includes('LÚA KHÔ')) || wb.SheetNames[0];
  const ws = wb.Sheets[sheetName];
  if (!ws) return [];

  const rawData: any[][] = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' });
  const entries: NSXTMEntry[] = [];

  // Dữ liệu bắt đầu từ dòng 5 (index 4)
  for (let r = 4; r < rawData.length; r++) {
    const row = rawData[r];
    if (!row || row.length === 0) continue;

    // Cột AD: NGÀY NHẬP NSX TM (index 29)
    const dateRaw = row[29];
    // Cột AE: CÂN CTY/ NSX (KG) (index 30)
    const kgRaw = row[30];

    const kg = typeof kgRaw === 'number' ? kgRaw : parseFloat(String(kgRaw).replace(/[^\d.-]/g, '')) || 0;
    if (kg <= 0) continue; // Không nhập NSX TM hoặc không có số lượng

    const dateStr = formatToDateStr(dateRaw);
    if (!dateStr) continue;

    const customer = String(row[6] || '').trim();   // Cột G: KHÁCH HÀNG (index 6)
    const riceType = String(row[9] || '').trim();   // Cột J: LOẠI LÚA (index 9)
    const vehicle = String(row[10] || '').trim();   // Cột K: PHƯƠNG TIỆN (index 10)

    const vType = detectVehicleType(vehicle);

    // Đơn giá lúa khô NSX TM: 20.000 đ/tấn (theo mẫu bảng lương)
    const pricePerTon = 20000;
    const tons = roundRiceTons(kg);
    const amount = tons * pricePerTon;

    // Mô tả công việc: "Nhập {ghe} {phương tiện} Lúa khô {loại lúa} của {khách hàng}"
    const workDesc = `Nhập ghe ${vehicle} Lúa khô ${riceType} của ${customer}`.trim();

    entries.push({
      id: `kho-${r}-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
      source: 'LUA_KHO',
      date: dateStr,
      team: 'ĐỨC',
      customerName: customer,
      riceType,
      vehicleName: vehicle,
      vehicleType: vType,
      jobDescription: workDesc,
      weightKg: kg,
      roundedTons: tons,
      unitPriceLuaKho: 20000,
      thanhTienSay: 0,
      thanhTienLuaKho: amount,
      tongThanhTien: amount,
      facility: 'NSX TM',
    });
  }

  return entries;
}
