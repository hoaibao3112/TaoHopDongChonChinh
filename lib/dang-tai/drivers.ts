import fs from 'fs';
import path from 'path';
import { removeVietnameseTones, matchUnaccent } from './unaccent';
import { TaiXeEntry, OFFICIAL_CHONCHINH_DRIVERS, INITIAL_DRIVERS } from './driverTypes';
import { getDriversFromDb, saveDriversListToDb, upsertDriverToDb } from '@/lib/db';

export type { TaiXeEntry };
export { OFFICIAL_CHONCHINH_DRIVERS, INITIAL_DRIVERS };

function getDriversFilePath(): string {
  try {
    const dir = path.join(process.cwd(), 'data', 'dang-tai');
    if (!fs.existsSync(dir)) {
      try {
        fs.mkdirSync(dir, { recursive: true });
      } catch {
        // Ignore read-only errors on serverless
      }
    }
    return path.join(dir, 'drivers.json');
  } catch {
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
 * Lấy danh bạ tài xế (Ưu tiên Supabase Postgres -> Redis -> Local File)
 */
export async function getDriverDirectory(): Promise<TaiXeEntry[]> {
  // 1. ƯU TIÊN HÀNG ĐẦU: Đọc từ Supabase PostgreSQL
  try {
    const dbDrivers = await getDriversFromDb();
    if (dbDrivers && Array.isArray(dbDrivers) && dbDrivers.length > 0) {
      return dbDrivers;
    }
  } catch (err) {
    console.warn('[Drivers] Lỗi đọc Supabase DB, chuyển sang fallback:', err);
  }

  // 2. Thử đọc từ Redis
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

  // 3. Fallback sang file cục bộ
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
    // Ignore error
  }

  // 4. Nếu chưa có trên bất kỳ nơi nào, lấy danh bạ mẫu 20 tài xế và lưu vào Supabase
  const initial: TaiXeEntry[] = OFFICIAL_CHONCHINH_DRIVERS.map((d, idx) => ({
    id: `drv_${idx + 1}`,
    ten: d.ten,
    sdt: d.sdt,
    nameSearch: removeVietnameseTones(d.ten),
    ghiChu: d.ghiChu,
    updatedAt: new Date().toISOString(),
  }));

  try {
    await saveDriversListToDb(initial);
  } catch (err) {
    console.warn('[Drivers] Lỗi khởi tạo danh bạ trên Supabase:', err);
  }

  return initial;
}

/**
 * Lưu danh bạ tài xế (đồng bộ Supabase Postgres, Redis và file cục bộ)
 */
export async function saveDriverDirectory(list: TaiXeEntry[]): Promise<boolean> {
  // 1. Ưu tiên lưu vào Supabase PostgreSQL
  try {
    await saveDriversListToDb(list);
  } catch (err) {
    console.warn('[Drivers] Lỗi lưu danh bạ lên Supabase:', err);
  }

  const jsonStr = JSON.stringify(list, null, 2);

  // 2. Lưu file cục bộ nếu được phép
  try {
    const filePath = getDriversFilePath();
    fs.writeFileSync(filePath, jsonStr, 'utf-8');
  } catch (err) {
    // Ignore if read-only
  }

  // 3. Redis
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
 * Thêm mới hoặc cập nhật thông tin tài xế trong danh bạ (lưu ngay vào Supabase)
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
    currentList.unshift(updatedDriver);
  }

  // Lưu ngay tài xế này lên Supabase Postgres
  try {
    await upsertDriverToDb(updatedDriver);
  } catch (err) {
    console.warn('[Drivers] Lỗi upsert Supabase driver:', err);
  }

  // Đồng bộ toàn bộ danh sách
  await saveDriverDirectory(currentList);
  return { driver: updatedDriver, isNew, list: currentList };
}
