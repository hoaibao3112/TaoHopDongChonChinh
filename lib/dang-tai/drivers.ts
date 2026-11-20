import fs from 'fs';
import path from 'path';
import { removeVietnameseTones, matchUnaccent } from './unaccent';

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

function getDriversFilePath(): string {
  try {
    const dir = path.join(process.cwd(), 'data', 'dang-tai');
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    return path.join(dir, 'drivers.json');
  } catch {
    const tmpDir = path.join('/tmp', 'dang-tai');
    if (!fs.existsSync(tmpDir)) {
      try {
        fs.mkdirSync(tmpDir, { recursive: true });
      } catch {
        // Fallback to /tmp
      }
    }
    return path.join('/tmp', 'drivers.json');
  }
}

function getRedisConfig(): { url: string; token: string } | null {
  const url = process.env.UPSTASH_REDIS_REST_URL?.replace(/\/$/, '');
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;
  if (!url || !token) return null;
  return { url, token };
}

/**
 * Lấy danh bạ tài xế
 */
export async function getDriverDirectory(): Promise<TaiXeEntry[]> {
  // 1. Thử đọc từ Redis
  const redisConfig = getRedisConfig();
  if (redisConfig) {
    try {
      const res = await fetch(`${redisConfig.url}/get/dangtai:drivers`, {
        headers: { Authorization: `Bearer ${redisConfig.token}` },
        cache: 'no-store',
      });
      if (res.ok) {
        const data = await res.json();
        if (data.result && typeof data.result === 'string') {
          const list = JSON.parse(data.result);
          if (Array.isArray(list) && list.length > 0) {
            return list;
          }
        }
      }
    } catch (err) {
      console.warn('[Drivers] Lỗi đọc Redis, dùng file cục bộ:', err);
    }
  }

  // 2. Fallback sang file cục bộ
  try {
    const filePath = getDriversFilePath();
    if (fs.existsSync(filePath)) {
      const raw = fs.readFileSync(filePath, 'utf-8');
      const list = JSON.parse(raw);
      if (Array.isArray(list) && list.length > 0) {
        return list;
      }
    }
  } catch (err) {
    console.error('[Drivers] Lỗi đọc file cục bộ:', err);
  }

  // 3. Khởi tạo danh sách chuẩn của công ty
  const initial: TaiXeEntry[] = OFFICIAL_CHONCHINH_DRIVERS.map((d, idx) => ({
    id: `drv_${idx + 1}`,
    ten: d.ten,
    sdt: d.sdt,
    nameSearch: removeVietnameseTones(d.ten),
    ghiChu: d.ghiChu,
    updatedAt: new Date().toISOString(),
  }));

  await saveDriverDirectory(initial);
  return initial;
}

/**
 * Lưu danh bạ tài xế
 */
export async function saveDriverDirectory(list: TaiXeEntry[]): Promise<boolean> {
  const jsonStr = JSON.stringify(list, null, 2);

  // File cục bộ
  try {
    const filePath = getDriversFilePath();
    fs.writeFileSync(filePath, jsonStr, 'utf-8');
  } catch (err) {
    console.error('[Drivers] Lỗi ghi file cục bộ:', err);
  }

  // Redis
  const redisConfig = getRedisConfig();
  if (redisConfig) {
    try {
      await fetch(redisConfig.url, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${redisConfig.token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(['SET', 'dangtai:drivers', jsonStr]),
      });
    } catch (err) {
      console.warn('[Drivers] Lỗi ghi Redis:', err);
    }
  }

  return true;
}

/**
 * Tìm kiếm tài xế không dấu (accent-insensitive search)
 */
export function searchDrivers(query: string, drivers: TaiXeEntry[]): TaiXeEntry[] {
  if (!query.trim()) return drivers;
  const cleanQ = removeVietnameseTones(query);
  return drivers.filter(
    (d) =>
      d.nameSearch.includes(cleanQ) ||
      matchUnaccent(d.ten, query) ||
      d.sdt.includes(query.trim())
  );
}

/**
 * Thêm mới hoặc cập nhật thông tin tài xế trong danh bạ
 */
export async function upsertDriver(
  ten: string,
  sdt: string,
  bienSo?: string
): Promise<{ driver: TaiXeEntry; isNew: boolean; list: TaiXeEntry[] }> {
  const currentList = await getDriverDirectory();
  const cleanTen = ten.trim();
  const cleanSdt = sdt.trim();
  const nameSearch = removeVietnameseTones(cleanTen);

  // Tìm theo tên hoặc SĐT
  const existingIdx = currentList.findIndex(
    (d) => d.nameSearch === nameSearch || d.ten.toLowerCase() === cleanTen.toLowerCase()
  );

  let updatedDriver: TaiXeEntry;
  let isNew = false;

  if (existingIdx !== -1) {
    // Cập nhật SĐT mới
    updatedDriver = {
      ...currentList[existingIdx],
      ten: cleanTen,
      sdt: cleanSdt || currentList[existingIdx].sdt,
      nameSearch,
      bienSoThuongChay: bienSo || currentList[existingIdx].bienSoThuongChay,
      updatedAt: new Date().toISOString(),
    };
    currentList[existingIdx] = updatedDriver;
  } else {
    // Thêm mới
    isNew = true;
    updatedDriver = {
      id: `drv_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      ten: cleanTen,
      sdt: cleanSdt,
      nameSearch,
      bienSoThuongChay: bienSo,
      updatedAt: new Date().toISOString(),
    };
    currentList.push(updatedDriver);
  }

  await saveDriverDirectory(currentList);
  return { driver: updatedDriver, isNew, list: currentList };
}
