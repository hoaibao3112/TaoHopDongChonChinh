import fs from 'fs';
import path from 'path';
import { getRolePasswordsFromDb, saveRolePasswordsToDb } from '@/lib/db';

export type ConfigurableRoleKey =
  | 'contracts'
  | 'payroll'
  | 'husk'
  | 'baocao'
  | 'dangtai'
  | 'chingoc'
  | 'kiemtra';

export interface RolePasswordMeta {
  key: ConfigurableRoleKey;
  label: string;
  route: string;
  icon: string;
  description: string;
  defaultPassword: string;
}

export const ROLE_PASSWORD_METADATA: RolePasswordMeta[] = [
  {
    key: 'contracts',
    label: 'Tạo Hợp Đồng & Admin Mật Khẩu',
    route: '/',
    icon: '📄',
    description: 'Truy cập Tạo Hợp Đồng Mua Bán và trang Admin Quản Lý Mật Khẩu (/admin-mat-khau)',
    defaultPassword: 'chonchinh',
  },
  {
    key: 'payroll',
    label: 'Tính Lương Nông Sản (Hoài Bảo)',
    route: '/tinh-luong',
    icon: '💰',
    description: 'Xuất Lúa CS1, Nhập Sấy CS1, Đội Dương CS2, Nhập/Xuất NSX TM, Chụm Lò CS1',
    defaultPassword: 'hoaibao',
  },
  {
    key: 'husk',
    label: 'Nhập / Xuất Trấu (Xe & Ghe)',
    route: '/xuat-trau',
    icon: '🚛',
    description: 'Quét phiếu cân AI, Nhập trấu mới & Xem trấu đã lưu CSDL theo tháng',
    defaultPassword: 'teamlua',
  },
  {
    key: 'baocao',
    label: 'Báo Cáo Lúa Khô Chưa Xay',
    route: '/bao-cao-chua-xay',
    icon: '🌾',
    description: 'Tổng hợp lúa khô nằm tài & lúa tươi chờ sấy quy đổi KCS',
    defaultPassword: 'baocao',
  },
  {
    key: 'dangtai',
    label: 'Phương Tiện (Đăng Tài Xe & Xếp PT)',
    route: '/dang-tai',
    icon: '🚢',
    description: 'Truy cập cả 2 tab: Đăng Tài Xe (/dang-tai) và Xếp Phương Tiện (/dieu-phoi-pt)',
    defaultPassword: 'phuongtien',
  },
  {
    key: 'chingoc',
    label: 'Báo Cáo Nhập Ngày (Chị Ngọc)',
    route: '/bao-cao-nhap-ngay',
    icon: '📅',
    description: 'Báo cáo Lúa tươi & Lúa khô nhập theo ngày, phân loại HĐ & PT chưa về',
    defaultPassword: 'chingoc',
  },
  {
    key: 'kiemtra',
    label: 'Kiểm Tra Lỗi Nhập Liệu Lúa',
    route: '/kiem-tra-lua',
    icon: '🔍',
    description: 'Kiểm tra sai sót Mã lô, Tên khách hàng, Giá lúa & Công thức từ 2 file Lúa Tươi/Khô',
    defaultPassword: 'KIEMTRA',
  },
];

export const DEFAULT_ROLE_PASSWORDS: Record<ConfigurableRoleKey, string> = {
  contracts: 'chonchinh',
  payroll: 'hoaibao',
  husk: 'teamlua',
  baocao: 'baocao',
  dangtai: 'phuongtien',
  chingoc: 'chingoc',
  kiemtra: 'KIEMTRA',
};

function getPasswordFilePath(): string {
  try {
    const dir = path.join(process.cwd(), 'data', 'auth');
    if (!fs.existsSync(dir)) {
      try {
        fs.mkdirSync(dir, { recursive: true });
      } catch {}
    }
    return path.join(dir, 'passwords.json');
  } catch {
    return '/tmp/passwords.json';
  }
}

function getRedisConfig(): { url: string; token: string } | null {
  const url = process.env.UPSTASH_REDIS_REST_URL?.replace(/\/$/, '');
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;
  if (!url || !token) return null;
  return { url, token };
}

function sanitizeMap(raw: Record<string, unknown> | null | undefined): Record<ConfigurableRoleKey, string> {
  const result: Record<ConfigurableRoleKey, string> = { ...DEFAULT_ROLE_PASSWORDS };
  if (!raw) return result;
  for (const key of Object.keys(DEFAULT_ROLE_PASSWORDS) as ConfigurableRoleKey[]) {
    const val = raw[key];
    if (typeof val === 'string' && val.trim().length > 0) {
      const trimmed = val.trim();
      // Tự động nâng cấp mật khẩu cũ 'dangtai' -> 'phuongtien' sau khi gộp 2 tab
      if (key === 'dangtai' && trimmed === 'dangtai') {
        result[key] = DEFAULT_ROLE_PASSWORDS.dangtai;
      } else {
        result[key] = trimmed;
      }
    }
  }
  return result;
}

/**
 * Đọc danh sách mật khẩu hiện tại của tất cả các tab (PostgreSQL -> Redis -> File -> Mặc định)
 */
export async function getRolePasswords(): Promise<Record<ConfigurableRoleKey, string>> {
  // 1. Thử đọc từ Postgres
  try {
    const dbMap = await getRolePasswordsFromDb();
    if (dbMap && Object.keys(dbMap).length > 0) {
      return sanitizeMap(dbMap);
    }
  } catch (err) {
    console.warn('[PasswordStore] DB read warning:', err);
  }

  // 2. Thử đọc từ Redis
  const redis = getRedisConfig();
  if (redis) {
    try {
      const res = await fetch(`${redis.url}/get/app:role_passwords`, {
        headers: { Authorization: `Bearer ${redis.token}` },
        cache: 'no-store',
      });
      if (res.ok) {
        const data = await res.json();
        if (data.result && typeof data.result === 'string') {
          const parsed = JSON.parse(data.result);
          return sanitizeMap(parsed);
        }
      }
    } catch (err) {
      console.warn('[PasswordStore] Redis read warning:', err);
    }
  }

  // 3. Fallback đọc từ file JSON cục bộ
  try {
    const filePath = getPasswordFilePath();
    if (fs.existsSync(filePath)) {
      const raw = fs.readFileSync(filePath, 'utf-8');
      return sanitizeMap(JSON.parse(raw));
    }
  } catch (err) {
    console.warn('[PasswordStore] File read warning:', err);
  }

  return { ...DEFAULT_ROLE_PASSWORDS };
}

/**
 * Lưu mật khẩu mới cho các tab (kiểm tra trùng lặp & lưu đồng bộ Postgres + File + Redis)
 */
export async function saveRolePasswords(
  updates: Partial<Record<ConfigurableRoleKey, string>>
): Promise<Record<ConfigurableRoleKey, string>> {
  const current = await getRolePasswords();
  const next: Record<ConfigurableRoleKey, string> = { ...current };

  for (const key of Object.keys(DEFAULT_ROLE_PASSWORDS) as ConfigurableRoleKey[]) {
    if (updates[key] !== undefined) {
      const clean = String(updates[key]).trim();
      if (!clean) {
        throw new Error(`Mật khẩu cho mục "${key}" không được để trống!`);
      }
      next[key] = clean;
    }
  }

  // Kiểm tra không cho 2 tab dùng trùng 1 mật khẩu
  const seen = new Map<string, ConfigurableRoleKey>();
  for (const key of Object.keys(next) as ConfigurableRoleKey[]) {
    const pw = next[key];
    if (seen.has(pw)) {
      const otherKey = seen.get(pw)!;
      throw new Error(
        `Mật khẩu "${pw}" đang bị trùng giữa "${key}" và "${otherKey}". Mỗi tab phải có mật khẩu riêng biệt!`
      );
    }
    seen.set(pw, key);
  }

  // 1. Lưu vào Postgres
  try {
    await saveRolePasswordsToDb(next);
  } catch (err) {
    console.warn('[PasswordStore] DB save warning:', err);
  }

  // 2. Lưu vào file JSON cục bộ
  try {
    const filePath = getPasswordFilePath();
    fs.writeFileSync(filePath, JSON.stringify(next, null, 2), 'utf-8');
  } catch (err) {
    console.warn('[PasswordStore] File save warning:', err);
  }

  // 3. Đồng bộ lên Redis
  const redis = getRedisConfig();
  if (redis) {
    try {
      await fetch(`${redis.url}/set/app:role_passwords`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${redis.token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(JSON.stringify(next)),
      });
    } catch (err) {
      console.warn('[PasswordStore] Redis save warning:', err);
    }
  }

  return next;
}
